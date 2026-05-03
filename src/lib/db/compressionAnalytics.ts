import { getDbInstance } from "./core";

export interface CompressionAnalyticsRow {
  id?: number;
  timestamp: string;
  combo_id?: string;
  provider?: string;
  mode: string;
  original_tokens: number;
  compressed_tokens: number;
  tokens_saved: number;
  duration_ms?: number;
  request_id?: string;
}

export function insertCompressionAnalyticsRow(row: CompressionAnalyticsRow): void {
  const db = getDbInstance();
  db.prepare(
    `INSERT INTO compression_analytics (timestamp, combo_id, provider, mode, original_tokens, compressed_tokens, tokens_saved, duration_ms, request_id)
     VALUES (@timestamp, @combo_id, @provider, @mode, @original_tokens, @compressed_tokens, @tokens_saved, @duration_ms, @request_id)`
  ).run(row);
}

export function getCompressionAnalyticsSummary(since?: string): {
  totalRequests: number;
  totalTokensSaved: number;
  avgSavingsPct: number;
  byMode: Record<string, number>;
  byProvider: Record<string, number>;
  last24h: Array<{ hour: string; count: number; tokensSaved: number }>;
} {
  const db = getDbInstance();
  const sinceClause = since ? `WHERE timestamp >= datetime('now', '-${since}')` : "";
  const rows = db
    .prepare(`SELECT * FROM compression_analytics ${sinceClause}`)
    .all() as CompressionAnalyticsRow[];
  const totalRequests = rows.length;
  const totalTokensSaved = rows.reduce(
    (sum: number, r: CompressionAnalyticsRow) => sum + r.tokens_saved,
    0
  );
  const avgSavingsPct =
    totalRequests > 0
      ? rows.reduce(
          (sum: number, r: CompressionAnalyticsRow) =>
            sum + (r.tokens_saved / r.original_tokens) * 100,
          0
        ) / totalRequests
      : 0;
  const byMode: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  for (const r of rows) {
    const mode = r.mode;
    const prov = r.provider || "unknown";
    byMode[mode] = (byMode[mode] || 0) + r.tokens_saved;
    byProvider[prov] = (byProvider[prov] || 0) + r.tokens_saved;
  }
  return { totalRequests, totalTokensSaved, avgSavingsPct, byMode, byProvider, last24h: [] };
}
