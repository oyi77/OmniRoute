/**
 * Stream utility functions extracted from chatCore.ts.
 *
 * These functions handle non-streaming SSE payload parsing, NDJSON conversion,
 * and terminal signal detection. Extracted as part of modularization (Phase 3).
 *
 * @module handlers/chatCoreStreamUtils
 */

import { FORMATS } from "../translator/formats.ts";
import {
  parseSSEToClaudeResponse,
  parseSSEToOpenAIResponse,
  parseSSEToResponsesOutput,
} from "./sseParser.ts";

/**
 * Parse a non-streaming SSE payload by trying multiple formats.
 */
export function parseNonStreamingSSEPayload(
  rawBody: string,
  preferredFormat: string,
  fallbackModel: string
): { body: Record<string, unknown>; format: string } | null {
  const formatsToTry: string[] = [];
  const seen = new Set<string>();
  const queueFormat = (format: string) => {
    if (!format || seen.has(format)) return;
    seen.add(format);
    formatsToTry.push(format);
  };

  queueFormat(preferredFormat);
  queueFormat(FORMATS.OPENAI_RESPONSES);
  queueFormat(FORMATS.CLAUDE);
  queueFormat(FORMATS.OPENAI);

  for (const format of formatsToTry) {
    const parsed =
      format === FORMATS.OPENAI_RESPONSES
        ? parseSSEToResponsesOutput(rawBody, fallbackModel)
        : format === FORMATS.CLAUDE
          ? parseSSEToClaudeResponse(rawBody, fallbackModel)
          : parseSSEToOpenAIResponse(rawBody, fallbackModel);
    if (parsed && typeof parsed === "object") {
      return {
        body: parsed as Record<string, unknown>,
        format,
      };
    }
  }

  return null;
}

/**
 * Convert NDJSON (newline-delimited JSON) to SSE format.
 */
export function convertNDJSONToSSE(rawBody: string): string {
  const chunks = String(rawBody || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (chunks.length === 0) return rawBody;

  return `${chunks.map((chunk) => `data: ${chunk}\n`).join("\n")}\n`;
}

/**
 * Normalize a non-streaming event payload (convert NDJSON to SSE if needed).
 */
export function normalizeNonStreamingEventPayload(rawBody: string, contentType: string): string {
  if (contentType.includes("application/x-ndjson")) {
    return convertNDJSONToSSE(rawBody);
  }
  return rawBody;
}

// ── Non-streaming SSE terminal detection ──

const NON_STREAMING_SSE_TERMINAL_TYPES: Record<string, true> = {
  message_stop: true,
  "response.completed": true,
  "response.done": true,
  "response.cancelled": true,
  "response.canceled": true,
  "response.failed": true,
  "response.incomplete": true,
};

type NonStreamingSseTerminalState = {
  currentEvent: string;
  pendingLine: string;
};

/**
 * Process a single line of non-streaming SSE to detect terminal events.
 */
export function processNonStreamingSseTerminalLine(
  state: NonStreamingSseTerminalState,
  rawLine: string
): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    if (!trimmed) state.currentEvent = "";
    return false;
  }

  if (trimmed.startsWith("event:")) {
    state.currentEvent = trimmed.slice(6).trim();
    return false;
  }

  if (!trimmed.startsWith("data:")) return false;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return true;
  if (!data) return false;

  try {
    const parsed = JSON.parse(data);
    const eventType =
      parsed && typeof parsed === "object" && typeof parsed.type === "string"
        ? parsed.type
        : state.currentEvent;
    return eventType in NON_STREAMING_SSE_TERMINAL_TYPES;
  } catch {
    // Keep reading malformed data so the parser can report a useful upstream error.
    return false;
  }
}

/**
 * Append a chunk to the terminal signal detector and check if terminal reached.
 */
export function appendNonStreamingSseTerminalSignal(
  state: NonStreamingSseTerminalState,
  chunk: string
): boolean {
  const lines = `${state.pendingLine}${chunk}`.split(/\r?\n/);
  state.pendingLine = lines.pop() ?? "";

  for (const rawLine of lines) {
    if (processNonStreamingSseTerminalLine(state, rawLine)) return true;
  }

  return false;
}
