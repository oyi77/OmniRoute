/**
 * Memory extraction functions extracted from chatCore.ts.
 *
 * These functions extract text from request/response bodies for memory
 * injection. Extracted as part of modularization (Phase 5).
 *
 * @module handlers/chatCoreMemory
 */

const MEMORY_EXTRACTION_TEXT_LIMIT = 64 * 1024;

/**
 * Cap memory extraction text to the limit (keeping the tail).
 */
export function capMemoryExtractionText(value: string): string {
  if (value.length <= MEMORY_EXTRACTION_TEXT_LIMIT) return value;
  return value.slice(-MEMORY_EXTRACTION_TEXT_LIMIT);
}

/**
 * Resolve the memory owner ID from API key info.
 */
export function resolveMemoryOwnerId(apiKeyInfo: Record<string, unknown> | null): string | null {
  const rawId = apiKeyInfo?.id;
  if (typeof rawId === "string" && rawId.trim().length > 0) {
    return rawId;
  }
  return null;
}

/**
 * Extract memory text from a response body.
 */
export function extractMemoryTextFromResponse(
  response: Record<string, unknown> | null | undefined
): string {
  if (!response || typeof response !== "object") return "";

  const openAIText = (response as Record<string, unknown>)?.choices;
  if (Array.isArray(openAIText) && openAIText.length > 0) {
    const firstChoice = openAIText[0] as Record<string, unknown>;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") {
      return capMemoryExtractionText(message.content.trim());
    }
  }

  if (Array.isArray((response as Record<string, unknown>)?.content)) {
    const contentText = ((response as Record<string, unknown>).content as Record<string, unknown>[])
      .filter(
        (part: Record<string, unknown>) => part?.type === "text" && typeof part?.text === "string"
      )
      .map((part: Record<string, unknown>) => String(part.text).trim())
      .filter(Boolean)
      .join("\n");
    if (contentText) return capMemoryExtractionText(contentText);
  }

  if (typeof (response as Record<string, unknown>)?.output_text === "string") {
    return capMemoryExtractionText(
      ((response as Record<string, unknown>).output_text as string).trim()
    );
  }

  return "";
}

/**
 * Extract memory text from a request body.
 */
export function extractMemoryTextFromRequestBody(
  body: Record<string, unknown> | null | undefined
): string {
  if (!body || typeof body !== "object") return "";

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (messages && messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i] as Record<string, unknown>;
      if (msg?.role !== "user") continue;

      if (typeof msg.content === "string" && msg.content.trim().length > 0) {
        return capMemoryExtractionText(msg.content.trim());
      }

      if (Array.isArray(msg.content)) {
        const text = (msg.content as Record<string, unknown>[])
          .map((part: Record<string, unknown>) => {
            if (typeof part?.text === "string") return part.text.trim();
            if (part?.type === "input_text" && typeof part?.text === "string")
              return part.text.trim();
            return "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();
        if (text) return capMemoryExtractionText(text);
      }
    }
  }

  const input = Array.isArray(body.input) ? body.input : null;
  if (input && input.length > 0) {
    for (let i = input.length - 1; i >= 0; i -= 1) {
      const item = input[i] as Record<string, unknown>;
      const role = typeof item?.role === "string" ? item.role.trim().toLowerCase() : "";
      const itemType = typeof item?.type === "string" ? item.type.trim().toLowerCase() : "";
      if (role && role !== "user") continue;
      if (itemType && itemType !== "message") continue;

      if (typeof item?.content === "string" && item.content.trim()) {
        return capMemoryExtractionText(item.content.trim());
      }
      if (Array.isArray(item?.content)) {
        const text = (item.content as Record<string, unknown>[])
          .map((part: Record<string, unknown>) => {
            if (typeof part?.text === "string") return part.text.trim();
            if (part?.type === "input_text" && typeof part?.text === "string")
              return part.text.trim();
            return "";
          })
          .filter(Boolean)
          .join("\n")
          .trim();
        if (text) return capMemoryExtractionText(text);
      }
    }

    const tailChunks: string[] = [];
    let tailLength = 0;
    for (let i = input.length - 1; i >= 0 && tailLength < MEMORY_EXTRACTION_TEXT_LIMIT; i -= 1) {
      const item = input[i] as Record<string, unknown>;
      const text = (() => {
        const role = typeof item?.role === "string" ? item.role.trim().toLowerCase() : "";
        const itemType = typeof item?.type === "string" ? item.type.trim().toLowerCase() : "";
        if (role && role !== "user") return "";
        if (itemType && itemType !== "message") return "";

        if (typeof item?.content === "string") return item.content.trim();
        if (Array.isArray(item?.content)) {
          return (item.content as Record<string, unknown>[])
            .map((part: Record<string, unknown>) => {
              if (typeof part?.text === "string") return part.text.trim();
              if (part?.type === "input_text" && typeof part?.text === "string")
                return part.text.trim();
              return "";
            })
            .filter(Boolean)
            .join("\n")
            .trim();
        }
        return "";
      })();
      if (!text) continue;
      tailChunks.unshift(text);
      tailLength += text.length + 1;
    }
    const chunks = tailChunks.join("\n").trim();
    if (chunks) return capMemoryExtractionText(chunks);
  }

  return "";
}
