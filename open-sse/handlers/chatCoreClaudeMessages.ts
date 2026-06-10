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
 * Normalize Claude upstream messages.
 * - Extract system/developer role messages into top-level system parameter
 * - Remove empty text blocks (Anthropic rejects them)
 * - Normalize unsupported content types without Claude->OpenAI round-trip
 * - Move stray tool_result blocks out of assistant messages (#2815)
 */
export function normalizeClaudeUpstreamMessages(
  payload: Record<string, unknown>,
  options?: { preserveToolResultBlocks?: boolean },
  log?: { debug?: (...args: unknown[]) => void }
): void {
  const preserveToolResultBlocks = options?.preserveToolResultBlocks === true;
  if (!Array.isArray(payload.messages)) return;
  let messages = payload.messages as ClaudeMessage[];

  // Extract system/developer role messages into top-level system parameter.
  extractSystemMessagesToBody(payload);
  messages = payload.messages as ClaudeMessage[];

  // Anthropic rejects empty text blocks in native Messages payloads.
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      msg.content = msg.content.filter(
        (block: ClaudeContentBlock) =>
          block.type !== "text" || (typeof block.text === "string" && block.text.length > 0)
      );
    }
  }

  // Normalize unsupported content types without reintroducing the Claude -> OpenAI round-trip.
  for (const msg of messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;
    msg.content = (msg.content as ClaudeContentBlock[]).flatMap((block: ClaudeContentBlock) => {
      if (
        block.type === "text" ||
        block.type === "image_url" ||
        block.type === "image" ||
        block.type === "file_url" ||
        block.type === "file" ||
        block.type === "document"
      ) {
        const fileData = (block.file_url ?? block.file ?? block.document) as
          | Record<string, unknown>
          | undefined;
        if (
          (block.type === "file" || block.type === "document") &&
          !fileData?.url &&
          !fileData?.data
        ) {
          const fileContent =
            (block.file as ClaudeContentBlock)?.content ??
            (block.file as ClaudeContentBlock)?.text ??
            block.content ??
            block.text;
          const fileName =
            (block.file as Record<string, unknown>)?.name ?? block.name ?? "attachment";
          if (typeof fileContent === "string" && fileContent.length > 0) {
            return [{ type: "text", text: `[${fileName}]\n${fileContent}` }];
          }
        }
        return [block];
      }

      if (block.type === "tool_result") {
        if (preserveToolResultBlocks) {
          return [block];
        }
        const toolId = block.tool_use_id ?? block.id ?? "unknown";
        const resultContent = block.content ?? block.text ?? block.output ?? "";
        const resultText =
          typeof resultContent === "string"
            ? resultContent
            : Array.isArray(resultContent)
              ? resultContent
                  .filter((c: Record<string, unknown>) => c.type === "text")
                  .map((c: Record<string, unknown>) => c.text)
                  .join("\n")
              : JSON.stringify(resultContent);
        if (resultText.length > 0) {
          return [{ type: "text", text: `[Tool Result: ${toolId}]\n${resultText}` }];
        }
        return [];
      }

      log?.debug?.("CONTENT", `Dropped unsupported content part type="${block.type}"`);
      return [];
    });
  }

  // #2815: move stray tool_result blocks out of assistant messages.
  // splitMisplacedToolResults is imported by the caller; skipped here to avoid a circular import.
  // Callers must invoke splitMisplacedToolResults(payload.messages) separately.
}

/**
 * Lift any system/developer role messages out of the messages array
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
