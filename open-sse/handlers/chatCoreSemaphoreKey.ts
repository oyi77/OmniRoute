/**
 * Build the per-account semaphore key used to rate-limit concurrent requests
 * to a single provider account.
 *
 * Returns null when there is no account identity to key on (e.g., the
 * request did not arrive with a connection that the semaphore system
 * recognizes), in which case the caller should skip the semaphore check.
 */

import { buildAccountSemaphoreKey } from "../services/accountSemaphore.ts";
import { resolveAccountSemaphoreAccountKey } from "./chatCoreHelpers.ts";

export function resolveAccountSemaphoreKey({
  provider,
  model,
  connectionId,
  credentials,
}: {
  provider: string | null | undefined;
  model: string;
  connectionId: string | null | undefined;
  credentials: Record<string, unknown> | null | undefined;
}): string | null {
  const accountKey = resolveAccountSemaphoreAccountKey(connectionId, credentials);
  if (!accountKey || !provider) return null;
  return buildAccountSemaphoreKey({ provider, accountKey });
}
