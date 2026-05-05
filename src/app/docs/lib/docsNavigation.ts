export interface DocNavItem {
  slug: string; // URL slug: "setup-guide"
  title: string; // Display: "Setup Guide"
  fileName: string; // File: "SETUP_GUIDE.md"
}

export interface DocNavSection {
  title: string;
  items: DocNavItem[];
}

export const docsNavigation: DocNavSection[] = [
  {
    title: "Getting Started",
    items: [
      { slug: "setup-guide", title: "Setup Guide", fileName: "SETUP_GUIDE.md" },
      { slug: "user-guide", title: "User Guide", fileName: "USER_GUIDE.md" },
      { slug: "cli-tools", title: "CLI Tools", fileName: "CLI-TOOLS.md" },
      { slug: "architecture", title: "Architecture", fileName: "ARCHITECTURE.md" },
    ],
  },
  {
    title: "Features",
    items: [
      { slug: "features", title: "Features Gallery", fileName: "FEATURES.md" },
      { slug: "auto-combo", title: "Auto-Combo Engine", fileName: "AUTO-COMBO.md" },
      { slug: "compression-guide", title: "Compression Guide", fileName: "COMPRESSION_GUIDE.md" },
      { slug: "rtk-compression", title: "RTK Compression", fileName: "RTK_COMPRESSION.md" },
      {
        slug: "compression-engines",
        title: "Compression Engines",
        fileName: "COMPRESSION_ENGINES.md",
      },
      {
        slug: "compression-rules-format",
        title: "Rules Format",
        fileName: "COMPRESSION_RULES_FORMAT.md",
      },
      {
        slug: "compression-language-packs",
        title: "Language Packs",
        fileName: "COMPRESSION_LANGUAGE_PACKS.md",
      },
      { slug: "free-tiers", title: "Free Tiers", fileName: "FREE_TIERS.md" },
    ],
  },
  {
    title: "API & Protocols",
    items: [
      { slug: "api-reference", title: "API Reference", fileName: "API_REFERENCE.md" },
      { slug: "mcp-server", title: "MCP Server", fileName: "MCP-SERVER.md" },
      { slug: "a2a-server", title: "A2A Server", fileName: "A2A-SERVER.md" },
    ],
  },
  {
    title: "Deployment",
    items: [
      { slug: "docker-guide", title: "Docker Guide", fileName: "DOCKER_GUIDE.md" },
      { slug: "vm-deployment-guide", title: "VM Deployment", fileName: "VM_DEPLOYMENT_GUIDE.md" },
      {
        slug: "fly-io-deployment-guide",
        title: "Fly.io Deployment",
        fileName: "FLY_IO_DEPLOYMENT_GUIDE.md",
      },
      { slug: "termux-guide", title: "Termux Guide", fileName: "TERMUX_GUIDE.md" },
      { slug: "pwa-guide", title: "PWA Guide", fileName: "PWA_GUIDE.md" },
    ],
  },
  {
    title: "Operations",
    items: [
      { slug: "proxy-guide", title: "Proxy Guide", fileName: "PROXY_GUIDE.md" },
      { slug: "resilience-guide", title: "Resilience Guide", fileName: "RESILIENCE_GUIDE.md" },
      { slug: "environment", title: "Environment Config", fileName: "ENVIRONMENT.md" },
      { slug: "troubleshooting", title: "Troubleshooting", fileName: "TROUBLESHOOTING.md" },
    ],
  },
  {
    title: "Development",
    items: [
      {
        slug: "codebase-documentation",
        title: "Codebase Docs",
        fileName: "CODEBASE_DOCUMENTATION.md",
      },
      { slug: "coverage-plan", title: "Coverage Plan", fileName: "COVERAGE_PLAN.md" },
      { slug: "i18n", title: "i18n Guide", fileName: "I18N.md" },
      { slug: "release-checklist", title: "Release Checklist", fileName: "RELEASE_CHECKLIST.md" },
      { slug: "uninstall", title: "Uninstall", fileName: "UNINSTALL.md" },
    ],
  },
];
