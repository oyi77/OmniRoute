import { convertOpenAIToResponsesToolCall } from "../handlers/responseTranslator.ts";
import { v4 as uuidv4 } from "uuid";

import { createSSEStream } from "./streamCore.ts";
import { JsonRecord } from "./types.ts";

/**
 * Race a response body read against a timeout.
 * Prevents indefinite hangs when the upstream sends headers but stalls on the body.
 */
export function withBodyTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = FETCH_BODY_TIMEOUT_MS
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Response body read timeout after ${timeoutMs}ms`);
      err.name = "BodyTimeoutError";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function stringifyIdValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export const STREAM_SUMMARY_TEXT_LIMIT = 64 * 1024;

export function appendBoundedText(current: string, next: string): string {
  if (!next) return current;
  const combined = current + next;
  if (combined.length <= STREAM_SUMMARY_TEXT_LIMIT) return combined;
  return combined.slice(-STREAM_SUMMARY_TEXT_LIMIT);
}

// Note: TextDecoder/TextEncoder are created per-stream inside createSSEStream()
// to avoid shared state issues with concurrent streams (TextDecoder with {stream:true}
// maintains internal buffering state between decode() calls).

/**
 * Stream modes
 */
export const STREAM_MODE = {
  TRANSLATE: "translate", // Full translation between formats
  PASSTHROUGH: "passthrough", // No translation, normalize output, extract usage
};