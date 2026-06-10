/**
 * Optionally sync Claude extra-usage state for the current request.
 * No-op unless the connection is a Claude connection with the
 * extra-usage-block feature enabled.
 *
 * Failures are logged at debug level but never thrown — this is a
 * best-effort background sync, not a critical path.
 */

import { isClaudeExtraUsageBlockEnabled } from "@/lib/providers/claudeExtraUsage";
import { fetchLiveProviderLimits } from "@/lib/usage/providerLimits";

type LoggerLike = {
  debug?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
} | null;

export async function maybeSyncClaudeExtraUsageState({
  provider,
  connectionId,
  providerSpecificData,
  log,
}: {
  provider: string | null | undefined;
  connectionId: string | null | undefined;
  providerSpecificData: unknown;
  log?: LoggerLike;
}): Promise<void> {
  if (!connectionId || !isClaudeExtraUsageBlockEnabled(provider, providerSpecificData)) {
    return;
  }

  try {
    await fetchLiveProviderLimits(connectionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.debug?.("CLAUDE_USAGE", `Failed to sync Claude extra-usage state: ${message}`);
  }
}
