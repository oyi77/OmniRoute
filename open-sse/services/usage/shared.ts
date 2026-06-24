/**
 * Shared types and utilities for the usage module.
 *
 * Extracted from index.ts to break circular dependencies between index.ts
 * and provider-specific modules (antigravity.ts, minimax.ts).
 */

import { getDbInstance } from "@/lib/db/core";
export { getDbInstance } from "@/lib/db/core";

export type JsonRecord = Record<string, unknown>;
export type UsageQuota = {
  used: number;
  total: number;
  remaining?: number;
  remainingPercentage?: number;
  resetAt: string | null;
  unlimited: boolean;
  /**
   * True when the upstream provider reported the remaining fraction. False
   * means the API didn't include the field and the 0 value here is a sentinel,
   * NOT a confirmed-exhausted state. Antigravity-specific.
   */
  fractionReported?: boolean;
  quotaSource?: "retrieveUserQuota" | "fetchAvailableModels" | "localUsageHistory";
  displayName?: string;
  details?: Array<{
    name: string;
    used: number;
  }>;
  currency?: string;
  grantedBalance?: number;
  toppedUpBalance?: number;
};
export type UsageProviderConnection = JsonRecord & {
  id?: string;
  provider?: string;
  accessToken?: string;
  apiKey?: string;
  providerSpecificData?: JsonRecord;
  projectId?: string;
  email?: string;
};
export type SubscriptionCacheEntry = {
  data: unknown;
  fetchedAt: number;
};
export type AntigravityUsageOptions = {
  forceRefresh?: boolean;
};

export function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getFieldValue(source: unknown, snakeKey: string, camelKey: string): unknown {
  const obj = toRecord(source);
  return obj[snakeKey] ?? obj[camelKey] ?? null;
}

export function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function parseResetTime(resetValue: unknown): string | null {
  if (!resetValue) return null;

  try {
    let date: Date;
    if (resetValue instanceof Date) {
      date = resetValue;
    } else if (typeof resetValue === "number") {
      date = new Date(resetValue < 1e12 ? resetValue * 1000 : resetValue);
    } else if (typeof resetValue === "string") {
      // Numeric strings are Unix timestamps too (seconds or milliseconds).
      // `new Date("1700000000")` otherwise returns Invalid Date.
      if (/^\d+$/.test(resetValue)) {
        const ts = Number(resetValue);
        date = new Date(ts < 1e12 ? ts * 1000 : ts);
      } else {
        date = new Date(resetValue);
      }
    } else {
      return null;
    }

    // Epoch-zero (1970-01-01) means no scheduled reset — treat as null
    if (date.getTime() <= 0) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}

export function pickFirstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
