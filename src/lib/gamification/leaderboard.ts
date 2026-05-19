/**
 * Leaderboard engine — score management, ranking, and scope rotation.
 *
 * @module lib/gamification/leaderboard
 */

import { getDbInstance } from "../db/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardScope = "global" | "weekly" | "monthly" | "tokens_shared" | "contributions";

export interface LeaderboardEntry {
  apiKeyId: string;
  score: number;
}

// ─── Statement / DB helpers (match gamification.ts pattern) ──────────────────

interface StatementLike<TRow = unknown> {
  all: (...params: unknown[]) => TRow[];
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes: number };
}

interface DbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
  exec: (sql: string) => void;
}

function db(): DbLike {
  return getDbInstance() as unknown as DbLike;
}

// ─── Score Management ────────────────────────────────────────────────────────

/**
 * Update score for an API key in a scope. Atomic increment.
 */
export async function updateScore(
  apiKeyId: string,
  scope: LeaderboardScope,
  points: number
): Promise<void> {
  const { updateScore: dbUpdateScore } = await import("../db/gamification");
  dbUpdateScore(apiKeyId, scope, points);
}

/**
 * Get rank for an API key in a scope.
 */
export async function getRank(apiKeyId: string, scope: LeaderboardScope): Promise<number> {
  const { getRank: dbGetRank } = await import("../db/gamification");
  return dbGetRank(apiKeyId, scope);
}

/**
 * Get top N entries for a scope.
 */
export async function getTopN(scope: LeaderboardScope, limit: number = 50, _offset: number = 0) {
  const { getTopN: dbGetTopN } = await import("../db/gamification");
  return dbGetTopN(scope, limit);
}

/**
 * Get neighbors around a user (entries above and below).
 */
export async function getNeighbors(
  apiKeyId: string,
  scope: LeaderboardScope,
  radius: number = 5
): Promise<{ above: LeaderboardEntry[]; below: LeaderboardEntry[] }> {
  const d = db();

  const scoreRow = d
    .prepare("SELECT score FROM leaderboard WHERE api_key_id = ? AND scope = ?")
    .get(apiKeyId, scope) as { score: number } | undefined;

  if (!scoreRow) return { above: [], below: [] };

  const above = d
    .prepare(
      `SELECT api_key_id, score FROM leaderboard
       WHERE scope = ? AND score > ?
       ORDER BY score ASC LIMIT ?`
    )
    .all(scope, scoreRow.score, radius) as Array<{ api_key_id: string; score: number }>;

  const below = d
    .prepare(
      `SELECT api_key_id, score FROM leaderboard
       WHERE scope = ? AND score < ?
       ORDER BY score DESC LIMIT ?`
    )
    .all(scope, scoreRow.score, radius) as Array<{ api_key_id: string; score: number }>;

  return {
    above: above.reverse().map((r) => ({ apiKeyId: r.api_key_id, score: r.score })),
    below: below.map((r) => ({ apiKeyId: r.api_key_id, score: r.score })),
  };
}

/**
 * Rotate weekly/monthly scopes. Archive old data, reset current.
 * Call this from a cron job or on first request of new period.
 */
export async function rotateScope(scope: "weekly" | "monthly"): Promise<void> {
  const d = db();
  const archiveSuffix =
    scope === "weekly"
      ? `week_${new Date().toISOString().slice(0, 10)}`
      : `month_${new Date().toISOString().slice(0, 7)}`;

  // Archive current scores
  d.exec(`
    INSERT OR IGNORE INTO leaderboard (api_key_id, scope, score, updated_at)
    SELECT api_key_id, '${archiveSuffix}', score, updated_at
    FROM leaderboard WHERE scope = '${scope}'
  `);

  // Reset current scope
  d.prepare("DELETE FROM leaderboard WHERE scope = ?").run(scope);
}
