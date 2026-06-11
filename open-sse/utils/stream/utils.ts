import { FETCH_BODY_TIMEOUT_MS } from "../../config/constants";

const STREAM_SUMMARY_TEXT_LIMIT = 500;
export { STREAM_SUMMARY_TEXT_LIMIT };

export function stringifyIdValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function appendBoundedText(
  existing: string[],
  text: string,
  limit: number = STREAM_SUMMARY_TEXT_LIMIT
): void {
  if (existing.length === 0) {
    existing.push(text.slice(0, limit));
  } else {
    const current = existing[0];
    if (current.length < limit) {
      const remaining = limit - current.length;
      existing[0] = current + text.slice(0, remaining);
    }
  }
}

export const STREAM_MODE = {
  TRANSLATE: "translate",
  PASSTHROUGH: "passthrough",
  SSE: "sse",
} as const;

export function withBodyTimeout(bodyTimeout: number = FETCH_BODY_TIMEOUT_MS): { bodyTimeout: number } {
  return { bodyTimeout };
}
