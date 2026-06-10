/**
 * Read a non-streaming response body from an upstream provider, handling the
 * common case where the upstream returns an SSE/NDJSON stream for what
 * should be a non-streaming request (e.g., when a provider ignores the
 * `stream: false` flag).
 *
 * Uses the terminal-signal detection in chatCoreStreamUtils to find the end
 * of the SSE stream early instead of buffering the entire response.
 */

import { withBodyTimeout } from "../utils/stream.ts";
import { createBodyTimeoutError } from "./chatCoreErrors.ts";
import { readStreamChunkWithTimeout } from "./chatCoreStreamHelpers.ts";
import { appendNonStreamingSseTerminalSignal, type NonStreamingSseTerminalState } from "./chatCoreStreamUtils.ts";

// Re-export the type for downstream consumers
export type { NonStreamingSseTerminalState };

// FETCH_BODY_TIMEOUT_MS is the maximum time we wait for the upstream body.
// 0 disables the timeout. Defined here to avoid pulling in a config import
// for this one constant.
import { FETCH_BODY_TIMEOUT_MS } from "../config/constants.ts";
export async function readNonStreamingResponseBody(
  response: Response,
  contentType: string,
  upstreamStream: boolean
): Promise<string> {
  if (
    !upstreamStream ||
    !response.body ||
    (!contentType.includes("text/event-stream") && !contentType.includes("application/x-ndjson"))
  ) {
    return withBodyTimeout<string>(response.text());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const terminalState: NonStreamingSseTerminalState = {
    currentEvent: "",
    pendingLine: "",
  };
  let rawBody = "";
  const deadline = FETCH_BODY_TIMEOUT_MS > 0 ? Date.now() + FETCH_BODY_TIMEOUT_MS : 0;

  try {
    while (true) {
      const timeoutMs = deadline > 0 ? deadline - Date.now() : 0;
      if (deadline > 0 && timeoutMs <= 0) {
        throw createBodyTimeoutError(FETCH_BODY_TIMEOUT_MS);
      }

      const { done, value } = await readStreamChunkWithTimeout(reader, timeoutMs);
      if (done) break;
      if (!value) continue;

      const decodedChunk = decoder.decode(value, { stream: true });
      rawBody += decodedChunk;
      if (appendNonStreamingSseTerminalSignal(terminalState, decodedChunk)) {
        await reader.cancel("non-streaming bridge consumed terminal SSE event").catch(() => {});
        break;
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    rawBody += decoder.decode();
    reader.releaseLock();
  }

  return rawBody;
}
