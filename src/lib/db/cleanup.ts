/**
 * Database cleanup functions for removing old data based on retention policies.
 *
 * @module lib/db/cleanup
 */

import { getDbInstance } from "./core";
import { getSettings } from "@/lib/localDb";

interface CleanupResult {
  deleted: number;
  errors: number;
}

/**
 * Clean up old quota_snapshots based on retention settings.
 */
export async function cleanupQuotaSnapshots(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.quotaSnapshots ?? 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM quota_snapshots WHERE created_at < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(
      `[Cleanup] Deleted ${result.deleted} quota_snapshots older than ${retentionDays} days`
    );
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning quota_snapshots:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old call_logs based on retention settings.
 */
export async function cleanupCallLogs(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.callLogs ?? 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM call_logs WHERE created_at < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(`[Cleanup] Deleted ${result.deleted} call_logs older than ${retentionDays} days`);
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning call_logs:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old usage_history based on retention settings.
 */
export async function cleanupUsageHistory(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.usageHistory ?? 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM usage_history WHERE timestamp < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(
      `[Cleanup] Deleted ${result.deleted} usage_history older than ${retentionDays} days`
    );
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning usage_history:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old compression_analytics based on retention settings.
 */
export async function cleanupCompressionAnalytics(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.compressionAnalytics ?? 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM compression_analytics WHERE created_at < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(
      `[Cleanup] Deleted ${result.deleted} compression_analytics older than ${retentionDays} days`
    );
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning compression_analytics:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old mcp_audit_log based on retention settings.
 */
export async function cleanupMcpAudit(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.mcpAudit ?? 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM mcp_audit_log WHERE timestamp < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(
      `[Cleanup] Deleted ${result.deleted} mcp_audit_log older than ${retentionDays} days`
    );
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning mcp_audit_log:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old a2a_events based on retention settings.
 */
export async function cleanupA2aEvents(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.a2aEvents ?? 30;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM a2a_events WHERE timestamp < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(`[Cleanup] Deleted ${result.deleted} a2a_events older than ${retentionDays} days`);
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning a2a_events:", err);
    result.errors++;
  }

  return result;
}

/**
 * Clean up old memory_entries based on retention settings.
 */
export async function cleanupMemoryEntries(): Promise<CleanupResult> {
  const db = getDbInstance();
  const settings = await getSettings();

  const retentionDays = (settings.retention as any)?.memoryEntries ?? 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffISO = cutoffDate.toISOString();

  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM memory_entries WHERE created_at < ?");
    const runResult = stmt.run(cutoffISO);
    result.deleted = runResult.changes;

    console.log(
      `[Cleanup] Deleted ${result.deleted} memory_entries older than ${retentionDays} days`
    );
  } catch (err: any) {
    console.error("[Cleanup] Error cleaning memory_entries:", err);
    result.errors++;
  }

  return result;
}

/**
 * Run all cleanup functions if auto-cleanup is enabled.
 */
export async function runAutoCleanup(): Promise<{
  totalDeleted: number;
  totalErrors: number;
  results: Record<string, CleanupResult>;
}> {
  const settings = await getSettings();
  const autoCleanupEnabled = (settings.retention as any)?.autoCleanupEnabled ?? false;

  if (!autoCleanupEnabled) {
    console.log("[Cleanup] Auto-cleanup is disabled");
    return { totalDeleted: 0, totalErrors: 0, results: {} };
  }

  console.log("[Cleanup] Starting auto-cleanup...");

  const results: Record<string, CleanupResult> = {
    quotaSnapshots: await cleanupQuotaSnapshots(),
    callLogs: await cleanupCallLogs(),
    usageHistory: await cleanupUsageHistory(),
    compressionAnalytics: await cleanupCompressionAnalytics(),
    mcpAudit: await cleanupMcpAudit(),
    a2aEvents: await cleanupA2aEvents(),
    memoryEntries: await cleanupMemoryEntries(),
  };

  const totalDeleted = Object.values(results).reduce((sum, r) => sum + r.deleted, 0);
  const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

  console.log(`[Cleanup] Auto-cleanup complete: ${totalDeleted} deleted, ${totalErrors} errors`);

  return { totalDeleted, totalErrors, results };
}

/**
 * Purge ALL quota_snapshots immediately (no retention check).
 */
export async function purgeQuotaSnapshots(): Promise<CleanupResult> {
  const db = getDbInstance();
  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM quota_snapshots");
    const runResult = stmt.run();
    result.deleted = runResult.changes;

    console.log(`[Cleanup] Purged ${result.deleted} quota_snapshots`);
  } catch (err: any) {
    console.error("[Cleanup] Error purging quota_snapshots:", err);
    result.errors++;
  }

  return result;
}

/**
 * Purge ALL call_logs immediately (no retention check).
 */
export async function purgeCallLogs(): Promise<CleanupResult> {
  const db = getDbInstance();
  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM call_logs");
    const runResult = stmt.run();
    result.deleted = runResult.changes;

    console.log(`[Cleanup] Purged ${result.deleted} call_logs`);
  } catch (err: any) {
    console.error("[Cleanup] Error purging call_logs:", err);
    result.errors++;
  }

  return result;
}

/**
 * Purge ALL detailed_logs immediately (no retention check).
 */
export async function purgeDetailedLogs(): Promise<CleanupResult> {
  const db = getDbInstance();
  const result: CleanupResult = { deleted: 0, errors: 0 };

  try {
    const stmt = db.prepare("DELETE FROM detailed_logs");
    const runResult = stmt.run();
    result.deleted = runResult.changes;

    console.log(`[Cleanup] Purged ${result.deleted} detailed_logs`);
  } catch (err: any) {
    console.error("[Cleanup] Error purging detailed_logs:", err);
    result.errors++;
  }

  return result;
}
