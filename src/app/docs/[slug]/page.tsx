import { notFound } from "next/navigation";
import Link from "next/link";
import { docsNavigation } from "../lib/docsNavigation";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Metadata } from "next";
import { DocCodeBlocks } from "../components/DocCodeBlocks";
import { FeedbackWidget } from "../components/FeedbackWidget";

export function generateStaticParams() {
  const allSlugs = docsNavigation.flatMap((section) =>
    section.items.map((item) => ({ slug: item.slug }))
  );
  return allSlugs;
}

export function getDocItemBySlug(slug: string) {
  for (const section of docsNavigation) {
    const item = section.items.find((item) => item.slug === slug);
    if (item) {
      return { sectionTitle: section.title, item };
    }
  }
  return null;
}

export function getAllDocSlugsFlat(): string[] {
  return docsNavigation.flatMap((section) => section.items.map((item) => item.slug));
}

export function getPrevNextSlugs(currentSlug: string) {
  const allSlugs = getAllDocSlugsFlat();
  const idx = allSlugs.indexOf(currentSlug);
  return {
    prev: idx > 0 ? allSlugs[idx - 1] : null,
    next: idx < allSlugs.length - 1 ? allSlugs[idx + 1] : null,
  };
}

export function extractHeadings(content: string): { id: string; text: string; level: number }[] {
  const headings: { id: string; text: string; level: number }[] = [];
  const regex = /^(#{2,4})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "");
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ id, text, level });
  }
  return headings;
}

export function renderMarkdown(content: string): string {
  return content
    .replace(/^####\s+(.*)$/gm, '<h4 id="$1" class="text-lg font-bold mb-2 mt-6">$1</h4>')
    .replace(/^###\s+(.*)$/gm, '<h3 id="$1" class="text-xl font-bold mb-3 mt-8">$1</h3>')
    .replace(/^##\s+(.*)$/gm, '<h2 id="$1" class="text-2xl font-bold mb-4 mt-10">$1</h2>')
    .replace(/^#\s+(.*)$/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>')
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<div class="group relative"><pre class="bg-bg-subtle p-4 rounded-lg overflow-x-auto"><code class="language-$1">$2</code></pre></div>'
    )
    .replace(/`([^`]+)`/g, '<code class="bg-bg-subtle px-2 py-1 rounded text-sm">$1</code>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/__(.*?)__/g, "<strong>$1</strong>")
    .replace(/_(.*?)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
    .replace(
      /!\[([^\]]+)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="max-w-full rounded-lg my-4">'
    )
    .replace(/^(\*|\-)\s+(.*)$/gm, '<li class="mb-1 ml-4">$2</li>')
    .replace(/^(\d+)\.\s+(.*)$/gm, '<li class="mb-1 ml-4">$2</li>')
    .replace(/^\|\s*(.+?)\s*\|$/gm, (match) => {
      if (match.match(/^\|\s*[-:]+[-|\s:]*$/)) return "";
      const cells = match
        .split("|")
        .filter((c) => c.trim())
        .map((c) => `<td class="border border-border p-2 text-sm">${c.trim()}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .replace(
      /(<tr>.*<\/tr>\n?)+/g,
      (match) =>
        `<table class="w-full border-collapse mb-4 text-sm"><tbody>${match}</tbody></table>`
    )
    .replace(
      /^>\s+(.*)$/gm,
      '<blockquote class="border-l-4 border-primary/30 pl-4 italic text-text-muted mb-4">$1</blockquote>'
    )
    .replace(/^---$/gm, '<hr class="border-border my-8">');
}

function cleanHeadingIds(html: string): string {
  return html.replace(
    /id="([^"]*)"/g,
    (_, id) =>
      `id="${id
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")}"`
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const docItem = getDocItemBySlug(slug);

  if (!docItem) {
    return {
      title: "Document Not Found",
    };
  }

  return {
    title: `${docItem.item.title} — OmniRoute Docs`,
    description: `OmniRoute documentation: ${docItem.item.title}`,
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const docItem = getDocItemBySlug(slug);

  if (!docItem) {
    notFound();
  }

  const { sectionTitle, item } = docItem;

  const filePath = path.join(process.cwd(), "docs", item.fileName);

  let pageTitle = item.title;
  let htmlContent = "";
  let headings: { id: string; text: string; level: number }[] = [];
  let loadError: string | null = null;
  let version: string | null = null;
  let lastUpdated: string | null = null;

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { content, data: frontmatter } = matter(fileContent);
    pageTitle = (frontmatter.title as string) || item.title;
    version = (frontmatter.version as string) || null;
    lastUpdated = (frontmatter.lastUpdated as string) || null;
    headings = extractHeadings(content);
    const rawHtml = renderMarkdown(content);
    htmlContent = cleanHeadingIds(rawHtml);
  } catch (error) {
    console.error(`Failed to read doc file: ${filePath}`, error);
    loadError = error instanceof Error ? error.message : "Unknown error";
  }

  if (loadError) {
    return (
      <div className="text-red-500 p-4 border border-red-200 bg-red-50 rounded-lg">
        <h2 className="text-xl font-bold mb-2">Error Loading Documentation</h2>
        <p>Failed to load {item.fileName}. Please try again later.</p>
        <p className="text-sm mt-2 text-gray-600">Error: {loadError}</p>
      </div>
    );
  }

  const { prev, next } = getPrevNextSlugs(slug);
  const prevItem = prev ? getDocItemBySlug(prev) : null;
  const nextItem = next ? getDocItemBySlug(next) : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Docs",
        item: `https://omniroute.online/docs`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: sectionTitle,
        item: `https://omniroute.online/docs/${slug}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: pageTitle,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          <nav className="mb-6">
            <ol className="flex items-center gap-2 text-sm text-text-muted">
              <li>
                <Link href="/docs" className="hover:text-text-main">
                  Docs
                </Link>
              </li>
              <li className='before:content-["&gt;"] before:mx-2'>{sectionTitle}</li>
              <li className='before:content-["&gt;"] before:mx-2'>{pageTitle}</li>
            </ol>
          </nav>

          <div className="flex items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold text-text-main">{pageTitle}</h1>
            {version && (
              <span className="px-2 py-0.5 text-xs font-mono bg-primary/10 text-primary border border-primary/20 rounded">
                v{version}
              </span>
            )}
          </div>

          {lastUpdated && (
            <p className="text-xs text-text-muted mb-4">Last updated: {lastUpdated}</p>
          )}

          <div className="prose-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />

          <DocCodeBlocks />

          <FeedbackWidget slug={slug} />

          <div className="flex items-center justify-between border-t border-border pt-6 mt-12">
            {prevItem ? (
              <Link
                href={`/docs/${prev}`}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                {prevItem.item.title}
              </Link>
            ) : (
              <div />
            )}
            {nextItem ? (
              <Link
                href={`/docs/${next}`}
                className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition-colors"
              >
                {nextItem.item.title}
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </div>

        {headings.length > 0 && (
          <aside className="hidden xl:block w-56 shrink-0">
            <div className="sticky top-8">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                On this page
              </h4>
              <nav className="space-y-1">
                {headings.map((heading) => (
                  <a
                    key={heading.id}
                    href={`#${heading.id}`}
                    className={`block text-sm text-text-muted hover:text-primary transition-colors truncate
                    ${heading.level === 3 ? "pl-3" : ""}
                    ${heading.level === 4 ? "pl-6" : ""}`}
                  >
                    {heading.text}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
