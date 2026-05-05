import Link from "next/link";
import { ReactNode } from "react";
import { DocsSidebarClient } from "./components/DocsSidebarClient";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar - hidden on mobile, visible on desktop */}
      <div className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-border">
        <DocsSidebarClient />
      </div>

      {/* Mobile sidebar toggle - visible only on mobile */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <DocsSidebarClient mobileOnly={true} />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto bg-bg">
        <div className="max-w-6xl mx-auto p-4 sm:px-6 lg:px-8 lg:py-8">
          {/* Navigation links */}
          <div className="flex items-center gap-4 mb-6">
            <Link href="/docs" className="text-text-muted hover:text-text-main transition-colors">
              ← Back to Docs Overview
            </Link>
            <Link
              href="/dashboard"
              className="text-text-muted hover:text-text-main transition-colors"
            >
              ← Dashboard
            </Link>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
