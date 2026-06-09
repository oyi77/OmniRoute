/**
 * Exported pure functions extracted from chatCore.ts.
 *
 * These functions are part of the public API but have no dependencies on
 * chatCore module-level state. Extracted as part of modularization (Phase 7).
 *
 * @module handlers/chatCoreExports
 */

import { FORMATS } from "../translator/formats.ts";
import { buildOmniRouteResponseMetaHeaders } from "@/domain/omnirouteResponseMeta";
import { OMNIROUTE_RESPONSE_HEADERS } from "@/shared/constants/headers";

/**
 * Check if a request should use native Codex passthrough (Responses API).
 */
export function shouldUseNativeCodexPassthrough({
  provider,
  sourceFormat,
  endpointPath,
}: {
  provider?: string | null;
  sourceFormat?: string | null;
  endpointPath?: string | null;
}): boolean {
  if (provider !== "codex") return false;
  if (sourceFormat !== FORMATS.OPENAI_RESPONSES) return false;
  let normalizedEndpoint = String(endpointPath || "");
  while (normalizedEndpoint.endsWith("/")) normalizedEndpoint = normalizedEndpoint.slice(0, -1);
  const segments = normalizedEndpoint.split("/");
  return segments.includes("responses");
}

/**
 * Convert all historical thinking/redacted_thinking blocks to redacted_thinking
 * with a synthetic default signature. Used in Claude OAuth passthrough when
 * session switches models (issue #2454).
 */
export function redactPassthroughThinkingSignatures(messages: unknown, signature: string): unknown {
  if (!Array.isArray(messages)) return messages;
  return (messages as Record<string, unknown>[]).map((msg) => {
    if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) return msg;
    let modified = false;
    const newContent = (msg.content as Record<string, unknown>[]).map((block) => {
      if (block && (block.type === "thinking" || block.type === "redacted_thinking")) {
        modified = true;
        return { type: "redacted_thinking", data: signature };
      }
      return block;
    });
    return modified ? { ...msg, content: newContent } : msg;
  });
}

const STREAMING_RESPONSE_HEADER_DENYLIST = new Set([
  "content-type",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

/**
 * Build response headers for streaming responses, filtering out hop-by-hop headers.
 */
export function buildStreamingResponseHeaders(
  providerHeaders: Headers,
  meta: Parameters<typeof buildOmniRouteResponseMetaHeaders>[0]
): Record<string, string> {
  const forwardedHeaders: [string, string][] = [];
  providerHeaders.forEach((value, key) => {
    if (!STREAMING_RESPONSE_HEADER_DENYLIST.has(key.toLowerCase())) {
      forwardedHeaders.push([key, value]);
    }
  });

  return {
    ...Object.fromEntries(forwardedHeaders),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    [OMNIROUTE_RESPONSE_HEADERS.cache]: "MISS",
    ...buildOmniRouteResponseMetaHeaders(meta),
  };
}

/**
 * Strip hop-by-hop headers that describe the upstream wire encoding.
 * After buffering and decompressing, these headers no longer describe the payload.
 */
export function stripStaleForwardingHeaders(headers: Headers): void {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
}

/**
 * Extract system/developer role messages from payload into top-level system field.
 * Mutates the payload in place.
 */
export function extractSystemRoleMessages(payload: Record<string, unknown>): void {
  if (!Array.isArray(payload.messages)) return;
  const messages = payload.messages as Array<{ role?: unknown; content?: unknown }>;
  const isSystemRole = (role: unknown): boolean =>
    typeof role === "string" &&
    (role.toLowerCase() === "system" || role.toLowerCase() === "developer");
  const systemMessages = messages.filter((m) => isSystemRole(m.role));
  if (systemMessages.length === 0) return;

  const extraBlocks: Array<Record<string, unknown>> = [];
  for (const sm of systemMessages) {
    if (typeof sm.content === "string" && sm.content.length > 0) {
      extraBlocks.push({ type: "text", text: sm.content });
    } else if (Array.isArray(sm.content)) {
      for (const block of sm.content as Array<Record<string, unknown>>) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
          extraBlocks.push({ ...block });
        }
      }
    }
  }
  if (extraBlocks.length > 0) {
    const existingSystem = payload.system;
    if (typeof existingSystem === "string" && existingSystem.length > 0) {
      payload.system = [{ type: "text", text: existingSystem }, ...extraBlocks];
    } else if (Array.isArray(existingSystem)) {
      payload.system = [...(existingSystem as Array<Record<string, unknown>>), ...extraBlocks];
    } else {
      payload.system = extraBlocks;
    }
  }
  payload.messages = messages.filter((m) => !isSystemRole(m.role));
}

/**
 * Check if token is expired or about to expire.
 */
export function isTokenExpiringSoon(expiresAt: unknown, bufferMs = 5 * 60 * 1000): boolean {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt as string | number | Date).getTime();
  return expiresAtMs - Date.now() < bufferMs;
}
