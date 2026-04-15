/**
 * Migration Runner — Versioned SQL Migrations for SQLite
 *
 * Reads numbered `.sql` files from the migrations directory and applies
 * them sequentially, tracking applied versions in `_omniroute_migrations`.
 *
 * Naming convention: `NNN_description.sql` (e.g., `001_initial_schema.sql`)
 *
 * All migrations run within a single transaction — all-or-nothing per file.
 *
 * Safety features:
 * - Pre-migration backup before applying any pending migrations
 * - Mass-migration detection (abort if too many pending on existing DB)
 * - Migration name mismatch warning (detects renumbering issues)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type Database from "better-sqlite3";

/**
 * Resolve the migrations directory path safely across platforms.
 * On Windows with global npm installs, `import.meta.url` may not be a valid
 * `file://` URL, causing `fileURLToPath` to throw `ERR_INVALID_FILE_URL_PATH`.
 */
function resolveMigrationsDir(): string {
  try {
    const metaUrl = import.meta.url;
    if (metaUrl && metaUrl.startsWith("file://")) {
      const __filename = fileURLToPath(metaUrl);
      return path.join(path.dirname(__filename), "migrations");
    }
  } catch {
    // fileURLToPath failed (e.g. Windows global install) — use fallback
  }
  // Fallback: resolve relative to cwd (works for both dev and global installs)
  return path.join(process.cwd(), "src", "lib", "db", "migrations");
}

const MIGRATIONS_DIR = resolveMigrationsDir();

/**
 * Maximum number of migrations allowed to run in a single startup on an
 * existing database. If more migrations are pending than this threshold,
 * it likely means the migration tracking table was accidentally wiped,
 * and running all migrations from scratch could cause data loss.
 *
 * Set to 0 to disable this safety check.
 */
const MAX_PENDING_MIGRATIONS_ON_EXISTING_DB = 5;

/**
 * Ensure the schema_migrations tracking table exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _omniroute_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Get all migration files sorted by version number.
 */
function getMigrationFiles(): Array<{ version: string; name: string; path: string }> {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) return null;
      return {
        version: match[1],
        name: match[2],
        path: path.join(MIGRATIONS_DIR, filename),
      };
    })
    .filter(Boolean) as Array<{ version: string; name: string; path: string }>;
}

/**
 * Get list of already-applied migration versions.
 */
function getAppliedVersions(db: Database.Database): Set<string> {
  const rows = db.prepare("SELECT version FROM _omniroute_migrations").all() as Array<{
    version: string;
  }>;
  return new Set(rows.map((r) => r.version));
}

/**
 * Get applied migration records (version + name) for mismatch detection.
 */
function getAppliedRecords(
  db: Database.Database
): Array<{ version: string; name: string }> {
  return db.prepare("SELECT version, name FROM _omniroute_migrations ORDER BY version").all() as Array<{
    version: string;
    name: string;
  }>;
}

/**
 * Detect migration name mismatches — when a migration version number
 * has been reused/renumbered with a different name. This is a strong signal
 * that the migration tracking is corrupted or migrations were renumbered.
 */
function detectNameMismatches(
  appliedRecords: Array<{ version: string; name: string }>,
  files: Array<{ version: string; name: string; path: string }>
): Array<{ version: string; appliedName: string; diskName: string }> {
  const appliedByName = new Map(appliedRecords.map((r) => [r.version, r.name]));
  const mismatches: Array<{ version: string; appliedName: string; diskName: string }> = [];

  for (const file of files) {
    const appliedName = appliedByName.get(file.version);
    if (appliedName && appliedName !== file.name) {
      mismatches.push({
        version: file.version,
        appliedName,
        diskName: file.name,
      });
    }
  }

  return mismatches;
}

/**
 * Create a pre-migration backup of the SQLite database using VACUUM INTO.
 * Returns the backup path on success, null on failure.
 */
function createPreMigrationBackup(db: Database.Database): string | null {
  try {
    const sqliteFile = db.name;
    if (!sqliteFile || sqliteFile === ":memory:") return null;

    const backupDir = path.join(path.dirname(sqliteFile), "db_backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `db_${timestamp}_pre-migration.sqlite`);
    const escapedBackupPath = backupPath.replace(/'/g, "''");

    db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    console.log(`[Migration] Pre-migration backup created: ${backupPath}`);
    return backupPath;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Migration] Failed to create pre-migration backup: ${message}`);
    return null;
  }
}

/**
 * Run all pending migrations in order.
 * Returns the number of migrations applied.
 *
 * Includes safety checks:
 * 1. Detects migration name mismatches (renumbering) and warns
 * 2. Aborts if too many pending migrations on an existing DB (likely wipe)
 * 3. Creates automatic backup before running any migrations
 */
export function runMigrations(db: Database.Database): number {
  ensureMigrationsTable(db);

  const files = getMigrationFiles();
  const applied = getAppliedVersions(db);
  const appliedRecords = getAppliedRecords(db);

  // ── Safety Check 1: Detect migration name mismatches (renumbering) ──
  const mismatches = detectNameMismatches(appliedRecords, files);
  if (mismatches.length > 0) {
    console.error(
      `[Migration] ⚠️  CRITICAL: ${mismatches.length} migration version(s) have been renumbered!`
    );
    for (const m of mismatches) {
      console.error(
        `  Version ${m.version}: applied as "${m.appliedName}" but disk has "${m.diskName}"`
      );
    }
    console.error(
      `[Migration] This indicates migrations were renumbered between releases, ` +
        `which can cause the migration runner to skip or re-run migrations incorrectly.`
    );
    console.error(
      `[Migration] The version-only tracking will skip these (version already applied), ` +
        `but please report this to the OmniRoute maintainers.`
    );
  }

  // Collect pending migrations
  const pending = files.filter((f) => !applied.has(f.version));
  const pendingCount = pending.length;

  if (pendingCount === 0) return 0;

  // ── Safety Check 2: Mass-migration detection on existing DB ──
  // If there are applied migrations already, but suddenly many are pending,
  // the migration tracking table was likely wiped.
  const hasAppliedMigrations = appliedRecords.length > 0;
  const hasExistingData =
    hasAppliedMigrations ||
    (() => {
      try {
        const row = db
          .prepare("SELECT COUNT(*) as c FROM provider_connections")
          .get() as { c?: number } | undefined;
        return Boolean(row && row.c > 0);
      } catch {
        return false;
      }
    })();

  if (
    hasExistingData &&
    MAX_PENDING_MIGRATIONS_ON_EXISTING_DB > 0 &&
    pendingCount > MAX_PENDING_MIGRATIONS_ON_EXISTING_DB
  ) {
    console.error(
      `[Migration] 🚨 FATAL SAFETY ABORT: ${pendingCount} migrations are pending on a database ` +
        `that already contains data, but only ${appliedRecords.length} migration(s) are recorded.`
    );
    console.error(
      `[Migration] This likely means the _omniroute_migrations table was accidentally wiped, ` +
        `which would cause all migrations to re-run from scratch.`
    );
    console.error(
      `[Migration] To protect your data, migrations have been ABORTED. ` +
        `The database will start with the existing schema.`
    );
    console.error(
      `[Migration] To override this safety check, set environment variable: ` +
        `OMNIROUTE_SKIP_MIGRATION_SAFETY=1`
    );
    console.error(
      `[Migration] Pending migrations: ${pending.map((p) => `${p.version}_${p.name}`).join(", ")}`
    );

    if (process.env.OMNIROUTE_SKIP_MIGRATION_SAFETY !== "1") {
      return 0;
    }
    console.warn(
      `[Migration] Safety check bypassed via OMNIROUTE_SKIP_MIGRATION_SAFETY=1. Proceeding with caution.`
    );
  }

  // ── Safety Check 3: Pre-migration backup ──
  createPreMigrationBackup(db);

  // ── Run pending migrations ──
  let count = 0;

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.path, "utf-8");

    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _omniroute_migrations (version, name) VALUES (?, ?)").run(
        migration.version,
        migration.name
      );
    });

    try {
      applyMigration();
      count++;
      console.log(`[Migration] Applied: ${migration.version}_${migration.name}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Migration] FAILED: ${migration.version}_${migration.name} — ${message}`);
      throw err; // Re-throw to prevent DB from starting in inconsistent state
    }
  }

  if (count > 0) {
    console.log(`[Migration] ${count} migration(s) applied successfully.`);
  }

  return count;
}

/**
 * Get migration status for diagnostics.
 */
export function getMigrationStatus(db: Database.Database): {
  applied: Array<{ version: string; name: string; applied_at: string }>;
  pending: Array<{ version: string; name: string }>;
} {
  ensureMigrationsTable(db);

  const appliedRows = db
    .prepare("SELECT version, name, applied_at FROM _omniroute_migrations ORDER BY version")
    .all() as Array<{ version: string; name: string; applied_at: string }>;

  const appliedVersions = new Set(appliedRows.map((r) => r.version));
  const allFiles = getMigrationFiles();
  const pending = allFiles.filter((f) => !appliedVersions.has(f.version));

  return { applied: appliedRows, pending };
}
