"use client";

import { useMemo } from "react";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";
import { getProviderDisplayName } from "@/lib/display/names";
import { useTranslations } from "next-intl";
import type { EndpointModelSummary, CopyHandler } from "./helpers";

export function EndpointSection({
  icon,
  iconColor,
  iconBg,
  title,
  path,
  description,
  models,
  expanded,
  onToggle,
  copy,
  copied,
  baseUrl,
  modelsLoading = false,
}: Readonly<{
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  path: string;
  description: string;
  models: EndpointModelSummary[];
  expanded: boolean;
  onToggle: () => void;
  copy: CopyHandler;
  copied?: string | null;
  baseUrl: string;
  modelsLoading?: boolean;
}>) {
  const t = useTranslations("endpoint");
  const grouped = useMemo(() => {
    const map: Record<string, EndpointModelSummary[]> = {};
    for (const m of models) {
      const owner = m.owned_by || "unknown";
      if (!map[owner]) map[owner] = [];
      map[owner].push(m);
    }
    return Object.entries(map).sort(
      (a: [string, EndpointModelSummary[]], b: [string, EndpointModelSummary[]]) =>
        b[1].length - a[1].length
    );
  }, [models]);

  const resolveProvider = (id: string) => AI_PROVIDERS[id] || getProviderByAlias(id);
  const providerColor = (id: string) => resolveProvider(id)?.color || "#888";
  const providerName = (id: string) => getProviderDisplayName(id, resolveProvider(id));
  const copyId = `endpoint_${path}`;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header (always visible) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-surface/50 transition-colors text-left"
      >
        <div className={`flex items-center justify-center size-10 rounded-lg ${iconBg} shrink-0`}>
          <span className={`material-symbols-outlined text-xl ${iconColor}`}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text-muted font-medium">
              {modelsLoading ? "..." : t("modelsCount", { count: models.length })}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
        <span
          className={`material-symbols-outlined text-text-muted text-lg transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          {/* Endpoint path + copy */}
          <div className="flex items-center gap-2 mt-3 mb-3">
            <code className="flex-1 text-xs font-mono text-text-muted bg-surface/80 px-3 py-1.5 rounded-lg truncate">
              {baseUrl.replace(/\/v1$/, "")}
              {path}
            </code>
            <button
              onClick={() => copy(`${baseUrl.replace(/\/v1$/, "")}${path}`, copyId)}
              className="p-1.5 hover:bg-surface rounded-lg text-text-muted hover:text-primary transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">
                {copied === copyId ? "check" : "content_copy"}
              </span>
            </button>
          </div>

          {/* Models grouped by provider */}
          {modelsLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/40 px-3 py-2 text-xs text-text-muted">
              <span className="material-symbols-outlined animate-spin text-sm">
                progress_activity
              </span>
              <span>{t("loadingModels")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {grouped.map(([providerId, providerModels]) => (
                <div key={providerId}>
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: providerColor(providerId) }}
                    />
                    <span className="text-xs font-semibold text-text-main">
                      {providerName(providerId)}
                    </span>
                    <span className="text-xs text-text-muted">
                      ({providerModels.length})
                    </span>
                  </div>
                  <div className="ml-5 flex flex-wrap gap-1.5">
                    {providerModels.map((m) => (
                      <span
                        key={m.id}
                        className="text-xs px-2 py-0.5 rounded-md bg-surface/80 text-text-muted font-mono"
                        title={m.id}
                      >
                        {m.root || m.id.split("/").pop()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
