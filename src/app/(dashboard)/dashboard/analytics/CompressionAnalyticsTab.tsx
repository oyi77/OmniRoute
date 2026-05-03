"use client";

import { useState, useEffect } from "react";
import { Card, Button } from "@/shared/components";
import { useTranslations } from "next-intl";
import type { CompressionAnalyticsSummary } from "@/lib/db/compressionAnalytics";

export default function CompressionAnalyticsTab() {
  const t = useTranslations("analytics");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CompressionAnalyticsSummary | null>(null);
  const [range, setRange] = useState("24h");

  useEffect(() => {
    fetch(`/api/analytics/compression?since=${range}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-4 w-20 bg-border rounded mb-2"></div>
            <div className="h-8 w-full bg-border rounded"></div>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-text-muted">{t("noData")}</p>;
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h4 className="text-sm font-medium text-text-muted">{t("compressionTotalRequests")}</h4>
          <p className="text-2xl font-bold text-text-main mt-2">{summary.totalRequests}</p>
        </Card>
        <Card className="p-6">
          <h4 className="text-sm font-medium text-text-muted">{t("compressionTokensSaved")}</h4>
          <p className="text-2xl font-bold text-text-main mt-2">{summary.totalTokensSaved}</p>
        </Card>
        <Card className="p-6">
          <h4 className="text-sm font-medium text-text-muted">{t("compressionAvgSavings")}</h4>
          <p className="text-2xl font-bold text-text-main mt-2">
            {summary.avgSavingsPct.toFixed(1)}%
          </p>
        </Card>
      </div>

      {/* Mode Distribution */}
      <Card className="p-6">
        <h4 className="text-sm font-medium text-text-muted mb-4">{t("compressionByMode")}</h4>
        <div className="space-y-2">
          {Object.entries(summary.byMode).map(([mode, saved]) => (
            <div key={mode} className="flex items-center gap-2">
              <div className="flex-1 h-4 bg-border rounded overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${Math.min(100, (saved / summary.totalTokensSaved) * 100)}%` }}
                ></div>
              </div>
              <span className="text-sm text-text-muted w-20 text-right">{mode}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
