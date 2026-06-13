/**
 * Plugin key-value storage module.
 *
 * Provides typed get/set/delete/listKeys for the `key_value` table,
 * namespaced per plugin. Plugins access this through the sandbox's `db`
 * object — this module is the backing implementation.
 *
 * @module db/pluginKv
 */

import { getDbInstance } from "./core";

// ── Types ──

interface KeyValueRow {
  key: string;
  value: string;
}

// ── Helpers ──

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function serializeValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

// ── Operations ──

/**
 * Get a value from plugin-namespaced key_value storage.
 * Returns the parsed value, or undefined if not found.
 */
export function pluginKvGet(namespace: string, key: string): unknown {
  const db = getDbInstance();
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
    .get(namespace, key) as KeyValueRow | undefined;
  if (!row) return undefined;
  return parseValue(row.value);
}

/**
 * Set a value in plugin-namespaced key_value storage.
 * Uses INSERT OR REPLACE (upsert) semantics.
 */
export function pluginKvSet(namespace: string, key: string, value: unknown): void {
  const db = getDbInstance();
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
    namespace,
    key,
    serializeValue(value)
  );
}

/**
 * Delete a value from plugin-namespaced key_value storage.
 */
export function pluginKvDelete(namespace: string, key: string): void {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run(namespace, key);
}

/**
 * List all keys in a given plugin namespace.
 */
export function pluginKvListKeys(namespace: string): string[] {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT key FROM key_value WHERE namespace = ?")
    .all(namespace) as KeyValueRow[];
  return rows.map((r) => r.key);
}
