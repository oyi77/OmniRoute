/**
 * Stream, timeout, and token helper functions extracted from chatCore.ts.
 *
 * These functions handle stream chunk reading with timeouts, executor timeout
 * resolution, billable token computation, and log payload truncation.
 * Extracted as part of modularization (Phase 9).
 *
 * @module handlers/chatCoreStreamHelpers
 */

import {
  createBodyTimeoutError,
  createAbortError,
  createUpstreamStartTimeoutError,
} from "./chatCoreErrors.ts";
import {
  getLoggedInputTokens,
  getLoggedOutputTokens,
  getReasoningTokens,
} from "@/lib/usage/tokenAccounting";
import { estimateSizeFast } from "../utils/estimateSize.ts";
import {
  getChatLogTextLimit,
  getChatLogArrayTailItems,
  getChatLogMaxDepth,
  getChatLogMaxObjectKeys,
} from "@/lib/logEnv";

// ── Constants ──

const MAX_LOG_BODY_CHARS = 8 * 1024;

/** Default fetch timeout in ms. Passed as parameter to avoid module-level constant. */
export const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

// ── Stream chunk reading ──

/**
 * Read a chunk from a ReadableStream with an optional timeout.
 * Uses Promise.withResolvers() for linear control flow.
 */
export function readStreamChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array }> {
  if (timeoutMs <= 0) return reader.read();

  const { promise, resolve, reject } = Promise.withResolvers<{ done: boolean; value?: Uint8Array }>();
  const timeout = setTimeout(() => reject(createBodyTimeoutError(timeoutMs)), timeoutMs);
  reader.read().then(
    (value) => {
      clearTimeout(timeout);
      resolve(value);
    },
    (error) => {
      clearTimeout(timeout);
      reject(error);
    }
  );
  return promise;
}

// ── Executor timeout ──

/**
 * Resolve the timeout for an executor, falling back to the default.
 */
export function getExecutorTimeoutMs(
  executor: unknown,
  defaultTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): number {
  const getTimeoutMs = (executor as { getTimeoutMs?: () => unknown } | null)?.getTimeoutMs;
  if (typeof getTimeoutMs !== "function") return defaultTimeoutMs;

  try {
    const timeoutMs = getTimeoutMs.call(executor);
    if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return defaultTimeoutMs;
    return Math.max(0, Math.floor(timeoutMs));
  } catch {
    return defaultTimeoutMs;
  }
}

/**
 * Execute a function with an upstream start timeout.
 * Aborts if the executor doesn't respond within the configured timeout.
 */
export async function executeWithUpstreamStartTimeout<T>({
  executor,
  provider,
  model,
  signal,
  log,
  execute,
  defaultTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
}: {
  executor: unknown;
  provider: string;
  model: string;
  signal: AbortSignal;
  log?: { warn?: (tag: string, message: string) => void } | null;
  execute: (signal: AbortSignal) => Promise<T>;
  defaultTimeoutMs?: number;
}): Promise<T> {
  const timeoutMs = getExecutorTimeoutMs(executor, defaultTimeoutMs);
  if (timeoutMs <= 0) return execute(signal);
  if (signal.aborted) throw createAbortError(signal);

  const timeoutController = new AbortController();
  const combinedController = new AbortController();
  const timeoutError = createUpstreamStartTimeoutError(timeoutMs, provider, model);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  let timeoutAbortListener: (() => void) | null = null;

  const abortCombined = (source: AbortSignal) => {
    if (combinedController.signal.aborted) return;
    const reason = source.reason instanceof Error ? source.reason : createAbortError(source);
    combinedController.abort(reason);
  };

  abortListener = () => abortCombined(signal);
  timeoutAbortListener = () => abortCombined(timeoutController.signal);
  signal.addEventListener("abort", abortListener, { once: true });
  timeoutController.signal.addEventListener("abort", timeoutAbortListener, { once: true });

  const { promise: timeoutPromise, reject: rejectTimeout } = Promise.withResolvers<never>();
  timeoutId = setTimeout(() => {
    log?.warn?.("TIMEOUT", timeoutError.message);
    timeoutController.abort(timeoutError);
    rejectTimeout(timeoutError);
  }, timeoutMs);

  const { promise: abortPromise, reject: rejectAbort } = Promise.withResolvers<never>();
  signal.addEventListener("abort", () => rejectAbort(createAbortError(signal)), { once: true });

  try {
    return await Promise.race([execute(combinedController.signal), timeoutPromise, abortPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (abortListener) signal.removeEventListener("abort", abortListener);
    if (timeoutAbortListener) {
      timeoutController.signal.removeEventListener("abort", timeoutAbortListener);
    }
  }
}

// ── Billable tokens ──

/**
 * Compute billable token total — mirrors the columns persisted by saveRequestUsage
 * so the live token-limit counter stays consistent with usage_history seed-on-miss.
 */
export function computeBillableTokens(usage: unknown): number {
  return getLoggedInputTokens(usage) + getLoggedOutputTokens(usage) + getReasoningTokens(usage);
}

// ── Chat log truncation ──

/**
 * Truncate a string value for chat log display.
 */
export function truncateChatLogText(value: string): string {
  const limit = getChatLogTextLimit();
  if (value.length <= limit) return value;
  const head = value.slice(0, Math.floor(limit / 2));
  const tail = value.slice(-Math.ceil(limit / 2));
  return `${head}\n[...truncated ${value.length - limit} chars...]\n${tail}`;
}

/**
 * Deep-clone a value with bounded depth and array/object size for logging.
 */
export function cloneBoundedChatLogPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateChatLogText(value);
  if (typeof value !== "object") return value;
  if (depth >= getChatLogMaxDepth()) return "[MaxDepth]";

  const maxTailItems = getChatLogArrayTailItems();

  if (Array.isArray(value)) {
    const retained = value.length > maxTailItems ? value.slice(-maxTailItems) : value;
    const cloned = retained.map((item) => cloneBoundedChatLogPayload(item, depth + 1));
    if (value.length > maxTailItems) {
      return [
        {
          _omniroute_truncated_array: true,
          originalLength: value.length,
          retainedTailItems: maxTailItems,
        },
        ...cloned,
      ];
    }
    return cloned;
  }

  const result: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  const maxKeys = getChatLogMaxObjectKeys();
  for (const [key, item] of maxKeys > 0 ? entries.slice(0, maxKeys) : entries) {
    result[key] = cloneBoundedChatLogPayload(item, depth + 1);
  }
  if (maxKeys > 0 && entries.length > maxKeys) {
    result._omniroute_truncated_keys = entries.length - maxKeys;
  }
  return result;
}

/**
 * Truncate a large object for logging. If its JSON representation exceeds
 * MAX_LOG_BODY_CHARS, return a lightweight summary instead of the full clone.
 */
export function truncateForLog(
  value: unknown
): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return value as null | undefined;
  if (typeof value !== "object") return value as unknown as Record<string, unknown>;
  const estimatedSize = estimateSizeFast(value);
  if (estimatedSize <= MAX_LOG_BODY_CHARS) return value as Record<string, unknown>;
  const obj = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {
    _truncated: true,
    _originalBytes: estimatedSize,
  };
  if (typeof obj.model === "string") summary.model = obj.model;
  if (typeof obj.provider === "string") summary.provider = obj.provider;
  if (Array.isArray(obj.messages)) summary.messageCount = obj.messages.length;
  if (Array.isArray(obj.contents)) summary.contentCount = obj.contents.length;
  if (typeof obj.stream === "boolean") summary.stream = obj.stream;
  return summary;
}
