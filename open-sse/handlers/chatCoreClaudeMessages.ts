/**
 * Claude Messages API utilities.
 *
 * Anthropic's Messages API has specific rules about message structure:
 * - System/developer roles must be in top-level `system` parameter, not in `messages[]`
 * - Empty text blocks are rejected
 * - Unsupported content types need normalization
 *
 * This module provides pure utility functions for these operations.
 */

export type ClaudeContentBlock = Record<string, unknown>;
export type ClaudeMessage = {
  role?: unknown;
  content?: unknown;
};

/**
 * Lift any system/developer role messages out of the messages array
 * into the top-level `system` parameter. Anthropic's Messages API
 * rejects system/developer roles inside `messages[]`.
 *
 * Case-insensitive to be defensive against client casing variants.
 */
export function extractSystemMessagesToBody(payload: Record<string, unknown>): void {
  if (!Array.isArray(payload.messages)) return;
  const messages = payload.messages as ClaudeMessage[];
  const systemMessages = messages.filter((m) => {
    const role = String(m.role || "").toLowerCase();
    return role === "system" || role === "developer";
  });
  if (systemMessages.length === 0) return;
  const extraBlocks: ClaudeContentBlock[] = [];
  for (const sm of systemMessages) {
    if (typeof sm.content === "string" && sm.content.length > 0) {
      extraBlocks.push({ type: "text", text: sm.content });
    } else if (Array.isArray(sm.content)) {
      for (const block of sm.content as ClaudeContentBlock[]) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
          extraBlocks.push(block);
        }
      }
    }
  }
  if (extraBlocks.length > 0) {
    const existingSystem = payload.system;
    if (typeof existingSystem === "string" && existingSystem.length > 0) {
      payload.system = [{ type: "text", text: existingSystem }, ...extraBlocks];
    } else if (Array.isArray(existingSystem)) {
      payload.system = [...(existingSystem as ClaudeContentBlock[]), ...extraBlocks];
    } else {
      payload.system = extraBlocks;
    }
  }
  payload.messages = messages.filter((m) => {
    const role = String(m.role || "").toLowerCase();
    return role !== "system" && role !== "developer";
  });
}
