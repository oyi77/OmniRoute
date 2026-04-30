import { NextResponse } from "next/server";
import { getDbInstance } from "@/lib/db/core";

function getRangeStartIso(range: string): string | null {
  const end = new Date();
  const start = new Date(end);

  switch (range) {
    case "1d":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    case "ytd":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "all":
    default:
      return null;
  }

  return start.toISOString();
}

function shortModelName(model: string | null): string {
  if (!model) return "-";
  const parts = model.split(/[/:-]/);
  return parts[parts.length - 1] || model;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "30d";
    const sinceIso = getRangeStartIso(range);

    const db = getDbInstance();
    const whereClause = sinceIso ? "WHERE timestamp >= @since" : "";
    const params = sinceIso ? { since: sinceIso } : {};

    const summaryRow = db
      .prepare(
        `
        SELECT
          COUNT(*) as totalRequests,
          COALESCE(SUM(tokens_input), 0) as promptTokens,
          COALESCE(SUM(tokens_output), 0) as completionTokens,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens,
          COUNT(DISTINCT model) as uniqueModels,
          COUNT(DISTINCT connection_id) as uniqueAccounts,
          COUNT(DISTINCT api_key_id) as uniqueApiKeys,
          COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) as successfulRequests,
          COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
          COALESCE(MIN(timestamp), '') as firstRequest,
          COALESCE(MAX(timestamp), '') as lastRequest
        FROM usage_history
        ${whereClause}
      `
      )
      .get(params) as Record<string, unknown>;

    const dailyRows = db
      .prepare(
        `
        SELECT
          DATE(timestamp) as date,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_input), 0) as promptTokens,
          COALESCE(SUM(tokens_output), 0) as completionTokens,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens
        FROM usage_history
        ${whereClause}
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `
      )
      .all(params) as Array<Record<string, unknown>>;

    const heatmapStart = new Date();
    heatmapStart.setDate(heatmapStart.getDate() - 364);
    const heatmapRows = db
      .prepare(
        `
        SELECT
          DATE(timestamp) as date,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens
        FROM usage_history
        WHERE timestamp >= @heatmapStart
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `
      )
      .all({ heatmapStart: heatmapStart.toISOString() }) as Array<Record<string, unknown>>;

    const modelRows = db
      .prepare(
        `
        SELECT
          model,
          provider,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_input), 0) as promptTokens,
          COALESCE(SUM(tokens_output), 0) as completionTokens,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens,
          COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
          COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) as successfulRequests,
          COALESCE(MAX(timestamp), '') as lastUsed
        FROM usage_history
        ${whereClause}
        GROUP BY model, provider
        ORDER BY requests DESC
        LIMIT 50
      `
      )
      .all(params) as Array<Record<string, unknown>>;

    const providerRows = db
      .prepare(
        `
        SELECT
          provider,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_input), 0) as promptTokens,
          COALESCE(SUM(tokens_output), 0) as completionTokens,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens,
          COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
          COALESCE(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END), 0) as successfulRequests
        FROM usage_history
        ${whereClause}
        GROUP BY provider
        ORDER BY requests DESC
      `
      )
      .all(params) as Array<Record<string, unknown>>;

    const accountRows = db
      .prepare(
        `
        SELECT
          connection_id as account,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_input), 0) as promptTokens,
          COALESCE(SUM(tokens_output), 0) as completionTokens,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens,
          COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
          COALESCE(MAX(timestamp), '') as lastUsed
        FROM usage_history
        ${whereClause}
        GROUP BY connection_id
        ORDER BY requests DESC
        LIMIT 50
      `
      )
      .all(params) as Array<Record<string, unknown>>;

    const weeklyRows = db
      .prepare(
        `
        SELECT
          strftime('%w', timestamp) as dayOfWeek,
          COUNT(*) as requests,
          COALESCE(SUM(tokens_input + tokens_output), 0) as totalTokens
        FROM usage_history
        ${whereClause}
        GROUP BY strftime('%w', timestamp)
        ORDER BY dayOfWeek ASC
      `
      )
      .all(params) as Array<Record<string, unknown>>;

    const fallbackRow = db
      .prepare(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN requested_model IS NOT NULL AND requested_model != '' THEN 1 ELSE 0 END) as with_requested,
          SUM(CASE
            WHEN requested_model IS NOT NULL
             AND requested_model != ''
             AND model IS NOT NULL
             AND requested_model != model
            THEN 1 ELSE 0 END
          ) as fallbacks
        FROM call_logs
        ${whereClause}
      `
      )
      .get(params) as Record<string, unknown>;

    const summary = {
      totalRequests: Number(summaryRow?.totalRequests || 0),
      promptTokens: Number(summaryRow?.promptTokens || 0),
      completionTokens: Number(summaryRow?.completionTokens || 0),
      totalTokens: Number(summaryRow?.totalTokens || 0),
      uniqueModels: Number(summaryRow?.uniqueModels || 0),
      uniqueAccounts: Number(summaryRow?.uniqueAccounts || 0),
      uniqueApiKeys: Number(summaryRow?.uniqueApiKeys || 0),
      successfulRequests: Number(summaryRow?.successfulRequests || 0),
      successRatePct:
        Number(summaryRow?.totalRequests || 0) > 0
          ? Number(
              (Number(summaryRow?.successfulRequests || 0) /
                Number(summaryRow?.totalRequests || 1)) *
                100
            ).toFixed(2)
          : 0,
      avgLatencyMs: Math.round(Number(summaryRow?.avgLatencyMs || 0)),
      totalCost: 0,
      firstRequest: summaryRow?.firstRequest || "",
      lastRequest: summaryRow?.lastRequest || "",
      fallbackCount: Number(fallbackRow?.fallbacks || 0),
      fallbackRatePct:
        Number(fallbackRow?.with_requested || 0) > 0
          ? Number(
              (Number(fallbackRow?.fallbacks || 0) / Number(fallbackRow?.with_requested || 1)) * 100
            ).toFixed(2)
          : 0,
      requestedModelCoveragePct:
        Number(fallbackRow?.total || 0) > 0
          ? Number(
              (Number(fallbackRow?.with_requested || 0) / Number(fallbackRow?.total || 1)) * 100
            ).toFixed(2)
          : 0,
    };

    const dailyTrend = dailyRows.map((row) => ({
      date: row.date,
      requests: Number(row.requests),
      promptTokens: Number(row.promptTokens),
      completionTokens: Number(row.completionTokens),
      totalTokens: Number(row.totalTokens),
      cost: 0,
    }));

    const activityMap: Record<string, number> = {};
    for (const row of heatmapRows) {
      activityMap[row.date as string] = Number(row.totalTokens);
    }

    const byModel = modelRows.map((row) => ({
      model: shortModelName(row.model as string),
      provider: row.provider,
      rawModel: row.model,
      requests: Number(row.requests),
      promptTokens: Number(row.promptTokens),
      completionTokens: Number(row.completionTokens),
      totalTokens: Number(row.totalTokens),
      avgLatencyMs: Math.round(Number(row.avgLatencyMs)),
      successRatePct:
        Number(row.requests) > 0
          ? Number((Number(row.successfulRequests) / Number(row.requests)) * 100).toFixed(2)
          : 0,
      lastUsed: row.lastUsed,
      cost: 0,
    }));

    const byProvider = providerRows.map((row) => ({
      provider: row.provider,
      requests: Number(row.requests),
      promptTokens: Number(row.promptTokens),
      completionTokens: Number(row.completionTokens),
      totalTokens: Number(row.totalTokens),
      avgLatencyMs: Math.round(Number(row.avgLatencyMs)),
      successRatePct:
        Number(row.requests) > 0
          ? Number((Number(row.successfulRequests) / Number(row.requests)) * 100).toFixed(2)
          : 0,
      cost: 0,
    }));

    const byAccount = accountRows.map((row) => ({
      account: row.account,
      requests: Number(row.requests),
      promptTokens: Number(row.promptTokens),
      completionTokens: Number(row.completionTokens),
      totalTokens: Number(row.totalTokens),
      avgLatencyMs: Math.round(Number(row.avgLatencyMs)),
      lastUsed: row.lastUsed,
      cost: 0,
    }));

    const weeklyTokens = [0, 0, 0, 0, 0, 0, 0];
    const weeklyCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const row of weeklyRows) {
      const dayIdx = Number(row.dayOfWeek);
      if (dayIdx >= 0 && dayIdx <= 6) {
        weeklyTokens[dayIdx] = Number(row.totalTokens);
        weeklyCounts[dayIdx] = Number(row.requests);
      }
    }

    const analytics = {
      summary,
      dailyTrend,
      activityMap,
      byModel,
      byProvider,
      byAccount,
      weeklyTokens,
      weeklyCounts,
      range,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Error computing analytics:", error);
    return NextResponse.json({ error: "Failed to compute analytics" }, { status: 500 });
  }
}
