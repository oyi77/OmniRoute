"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils/cn";
import { docsNavigation } from "../lib/docsNavigation";

export function DocsSidebarClient({ mobileOnly = false }: { mobileOnly?: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Extract slug from pathname (e.g., /docs/setup-guide -> setup-guide)
  const currentSlug = pathname.split("/").pop();

  const isActive = (slug: string) => currentSlug === slug;

  if (mobileOnly) {
    return (
      <div className="lg:hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 bg-bg-subtle border border-border rounded-lg hover:bg-bg transition-colors"
          aria-label="Toggle Sidebar"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        {isOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
            <div className="fixed left-0 top-0 h-full w-64 bg-bg border-r border-border overflow-y-auto z-50">
              <MobileSidebarContent currentSlug={currentSlug} onClose={() => setIsOpen(false)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-64 bg-bg border-r border-border">
      <div className="p-4 border-b border-border">
        <h2 className="font-bold text-text-primary">OmniRoute Docs</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {docsNavigation.map((section, sectionIdx) => (
          <div key={sectionIdx} className="space-y-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-bg-subtle hover:text-text-main",
                    isActive(item.slug)
                      ? "text-primary font-medium bg-primary/10"
                      : "text-text-main"
                  )}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileSidebarContent({
  currentSlug,
  onClose,
}: {
  currentSlug: string;
  onClose: () => void;
}) {
  const isActive = (slug: string) => currentSlug === slug;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-bold text-text-primary">OmniRoute Docs</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-bg-subtle rounded transition-colors"
          aria-label="Close Sidebar"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {docsNavigation.map((section, sectionIdx) => (
          <div key={sectionIdx} className="space-y-2">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              {section.title}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  onClick={onClose}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-bg-subtle hover:text-text-main",
                    isActive(item.slug)
                      ? "text-primary font-medium bg-primary/10"
                      : "text-text-main"
                  )}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
