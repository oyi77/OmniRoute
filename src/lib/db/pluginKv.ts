/**
 * Plugin key-value persistence layer.
 *
 * Provides typed get/set/delete/list operations for plugin sandboxes,
 * stored in the `key_value` table under `plugin:<pluginName>` namespaces.
 * Follows the same pattern as creditBalance.ts (Hard Rule #5: all SQL
 * lives inside src/lib/db/ modules).
 */

import { getDbInstance, isBuildPhase, isCloud } from "./core";

interface StatementLike<TRow = unknown> {
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
  all: (...params: unknown[]) => TRow[];
}

interface DbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
}

interface KeyValueRow {
  key: string;
  value: string;
}

function ns(pluginName: string): string {
  return `plugin:${pluginName}`;
}


/**
 * Read a value for a plugin key.
 * Returns undefined if the key does not exist.
 */
export function pluginKvGet(pluginName: string, key: string): unknown {
  if (isBuildPhase || isCloud) return undefined;
  const db = getDbInstance() as unknown as DbLike;
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
    .get(ns(pluginName), key) as KeyValueRow | undefined;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

/**
 * Set a value for a plugin key (creates or updates).
 */
export function pluginKvSet(pluginName: string, key: string, value: unknown): void {
  if (isBuildPhase || isCloud) return;
  const db = getDbInstance() as unknown as DbLike;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  db.prepare(
    "INSERT INTO key_value (namespace, key, value) VALUES (?, ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value"
  ).run(ns(pluginName), key, str);
}

/**
 * Delete a plugin key.
 */
export function pluginKvDelete(pluginName: string, key: string): void {
  if (isBuildPhase || isCloud) return;
  const db = getDbInstance() as unknown as DbLike;
  db.prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run(ns(pluginName), key);
}

/**
 * List all keys in a plugin's namespace.
 */
export function pluginKvListKeys(pluginName: string): string[] {
  if (isBuildPhase || isCloud) return [];
  const db = getDbInstance() as unknown as DbLike;
  const rows = db
    .prepare("SELECT key FROM key_value WHERE namespace = ?")
    .all(ns(pluginName)) as KeyValueRow[];
  return rows.map((r) => r.key);
}
