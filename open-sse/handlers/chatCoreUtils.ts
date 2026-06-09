/**
 * Pure utility functions extracted from chatCore.ts.
 *
 * These functions have zero side effects and no dependencies on chatCore state.
 * Extracted as part of modularization (Phase 1) to reduce chatCore.ts size
 * and improve testability.
 *
 * @module handlers/chatCoreUtils
 */

/**
 * Check if a request body has `stream: true`.
 */
export function isTruthyStreamBody(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { stream?: unknown }).stream === true;
}

/**
 * Parse a value as a finite number, or return null if not parseable.
 */
export function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parse a value as a positive number, or return 0 if not positive/finite.
 */
export function toPositiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Type guard: check if an error is a semaphore capacity error.
 */
export function isSemaphoreCapacityError(error: unknown): error is Error & { code: string } {
  return (
    !!error &&
    typeof error === "object" &&
    ((error as { code?: unknown }).code === "SEMAPHORE_TIMEOUT" ||
      (error as { code?: unknown }).code === "SEMAPHORE_QUEUE_FULL")
  );
}

/**
 * Get a header value case-insensitively from a Headers object or plain record.
 */
export function getHeaderValueCaseInsensitive(
  headers: Record<string, unknown> | Headers | null | undefined,
  targetName: string
): string | undefined {
  if (!headers) return undefined;
  const target = targetName.toLowerCase();
  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      if (key.toLowerCase() === target) return value;
    }
    return undefined;
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return String(headers[key] ?? "");
  }
  return undefined;
}

/**
 * Check if the client accepts text/event-stream.
 */
export function isEventStreamAccepted(headers: Record<string, unknown> | Headers | null | undefined): boolean {
  return (getHeaderValueCaseInsensitive(headers, "accept") || "")
    .toLowerCase()
    .includes("text/event-stream");
}

/**
 * Check if a buffered event response should be treated as expected (streaming).
 */
export function shouldTreatBufferedEventResponseAsExpected(
  upstreamStream: boolean,
  providerHeaders: Record<string, unknown> | Headers | null | undefined,
  finalBody: unknown
): boolean {
  return upstreamStream || isEventStreamAccepted(providerHeaders) || isTruthyStreamBody(finalBody);
}
