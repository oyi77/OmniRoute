import { notFound } from "next/navigation";
import Link from "next/link";
import { docsNavigation } from "../lib/docsNavigation";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Metadata } from "next";

// Generate static params for all documentation pages
export function generateStaticParams() {
  const allSlugs = docsNavigation.flatMap((section) =>
    section.items.map((item) => ({ slug: item.slug }))
  );
  return allSlugs;
}

// Find the navigation item by slug
export function getDocItemBySlug(slug: string) {
  for (const section of docsNavigation) {
    const item = section.items.find((item) => item.slug === slug);
    if (item) {
      return { sectionTitle: section.title, item };
    }
  }
  return null;
}

// Simple markdown renderer
export function renderMarkdown(content: string): string {
  // Convert markdown to HTML with basic formatting
  return (
    content
      // Headings
      .replace(/^#\s+(.*)$/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>')
      .replace(/^##\s+(.*)$/gm, '<h2 class="text-2xl font-bold mb-3">$1</h2>')
      .replace(/^###\s+(.*)$/gm, '<h3 class="text-xl font-bold mb-2">$1</h3>')
      .replace(/^####\s+(.*)$/gm, '<h4 class="text-lg font-bold mb-2">$1</h4>')

      // Code blocks
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre class="bg-bg-subtle p-4 rounded-lg overflow-x-auto"><code class="language-$1">$2</code></pre>'
      )
      .replace(/`([^`]+)`/g, '<code class="bg-bg-subtle px-2 py-1 rounded text-sm">$1</code>')

      // Bold and italic
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      .replace(/_(.*?)_/g, "<em>$1</em>")

      // Links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" class="text-primary hover:underline">$1</a>'
      )

      // Images
      .replace(
        /!\[([^\]]+)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" class="max-w-full rounded-lg my-4">'
      )

      // Lists - handle both unordered and ordered
      .replace(/^(\*|\-)\s+(.*)$/gm, '<li class="mb-1">$2</li>')
      .replace(/^(\d+)\.\s+(.*)$/gm, '<li class="mb-1">$2</li>')
      .replace(/^(<li>.*<\/li>)+/gm, '<ul class="list-disc pl-6 mb-4">$&</ul>')

      // Tables - simplified: wrap pipe-separated rows
      .replace(/^\|(.+)\|$/gm, (match) => {
        const cells = match
          .split("|")
          .filter((c) => c.trim())
          .map((c) => `<td class="border border-border p-2">${c.trim()}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .replace(
        /(<tr>.*<\/tr>\n?)+/g,
        (match) => `<table class="w-full border-collapse mb-4"><tbody>${match}</tbody></table>`
      )

      // Blockquotes
      .replace(
        /^>\s+(.*)$/gm,
        '<blockquote class="border-l-4 border-border pl-4 italic text-text-muted mb-4">$1</blockquote>'
      )

      // Horizontal rules
      .replace(/^---$/gm, '<hr class="border-border my-6">')

      // Paragraphs (simple approach - skip lines that are already wrapped in HTML tags)
      .replace(/^(?!<[a-z]>)(.+)$/gm, (match, p1) => {
        // Skip empty lines and lines that look like markdown headers or list items
        if (!p1.trim() || p1.match(/^[#\-*\d]/)) {
          return match;
        }
        return `<p class="mb-4">${p1}</p>`;
      })
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

  // Read markdown file
  const filePath = path.join(process.cwd(), "docs", item.fileName);

  let pageTitle = item.title;
  let htmlContent = "";
  let loadError: string | null = null;

  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const { content, data: frontmatter } = matter(fileContent);
    pageTitle = (frontmatter.title as string) || item.title;
    htmlContent = renderMarkdown(content);
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

  return (
    <div className="prose prose-lg max-w-none">
      {/* Breadcrumb */}
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

      {/* Page title */}
      <h1 className="text-3xl font-bold mb-6 text-text-main">{pageTitle}</h1>

      {/* Rendered content */}
      <div className="prose-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}
