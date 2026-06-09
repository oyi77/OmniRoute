/**
 * Claude passthrough tool name mapping functions extracted from chatCore.ts.
 *
 * These functions handle the mapping of tool names between Claude OAuth
 * prefixed names and original names during passthrough. Extracted as part
 * of modularization (Phase 4).
 *
 * @module handlers/chatCorePassthrough
 */

import { CLAUDE_OAUTH_TOOL_PREFIX } from "../translator/request/openai-to-claude.ts";
import { FORMATS } from "../translator/formats.ts";
import { isClaudeCodeCompatibleProvider } from "../services/claudeCodeCompatible.ts";
import { getHeaderValueCaseInsensitive } from "./chatCoreUtils.ts";

/**
 * Build a map of prefixed tool names to original names for Claude passthrough.
 */
export function buildClaudePassthroughToolNameMap(
  body: Record<string, unknown> | null | undefined
): Map<string, string> | null {
  if (!body || !Array.isArray(body.tools)) return null;

  const toolNameMap = new Map<string, string>();
  for (const tool of body.tools) {
    const toolRecord = tool as Record<string, unknown>;
    const toolData =
      toolRecord?.type === "function" &&
      toolRecord.function &&
      typeof toolRecord.function === "object"
        ? (toolRecord.function as Record<string, unknown>)
        : toolRecord;
    const originalName =
      typeof toolData?.name === "string" ? toolData.name : undefined;
    if (!originalName) continue;
    toolNameMap.set(`${CLAUDE_OAUTH_TOOL_PREFIX}${originalName}`, originalName);
  }

  return toolNameMap.size > 0 ? toolNameMap : null;
}

/**
 * Restore prefixed tool names back to originals in a Claude response body.
 */
export function restoreClaudePassthroughToolNames(
  responseBody: Record<string, unknown>,
  toolNameMap: Map<string, string> | null
): Record<string, unknown> {
  if (!toolNameMap || !Array.isArray(responseBody?.content)) return responseBody;

  let changed = false;
  const content = (responseBody.content as Record<string, unknown>[]).map(
    (block: Record<string, unknown>) => {
      if (block?.type !== "tool_use" || typeof block?.name !== "string") return block;
      const restoredName = toolNameMap.get(block.name) ?? block.name;
      if (restoredName === block.name) return block;
      changed = true;
      return {
        ...block,
        name: restoredName,
      };
    }
  );

  if (!changed) return responseBody;
  return {
    ...responseBody,
    content,
  };
}

/**
 * Merge executor-level tool name map with base tool name map.
 */
export function mergeResponseToolNameMap(
  baseToolNameMap: Map<string, string> | null,
  transformedBody: Record<string, unknown> | null | undefined
): Map<string, string> | null {
  const executorToolNameMap =
    transformedBody && transformedBody._toolNameMap instanceof Map
      ? (transformedBody._toolNameMap as Map<string, string>)
      : null;

  if (!executorToolNameMap?.size) return baseToolNameMap;
  if (!baseToolNameMap?.size) return executorToolNameMap;

  const merged = new Map(baseToolNameMap);
  for (const [key, value] of executorToolNameMap) {
    merged.set(key, value);
  }
  return merged;
}

/**
 * Check if a request is a Claude Code semantic passthrough request.
 */
export function isClaudeCodeSemanticPassthroughRequest({
  provider,
  sourceFormat,
  targetFormat,
  headers,
  userAgent,
}: {
  provider?: string | null;
  sourceFormat?: string | null;
  targetFormat?: string | null;
  headers?: Record<string, unknown> | Headers | null;
  userAgent?: string | null;
}): boolean {
  const isDirectClaudeCodeProvider =
    provider === "claude" || isClaudeCodeCompatibleProvider(provider);
  if (!isDirectClaudeCodeProvider) return false;
  if (sourceFormat !== FORMATS.CLAUDE) return false;
  if (targetFormat !== FORMATS.CLAUDE) return false;

  const headerUserAgent = getHeaderValueCaseInsensitive(headers, "user-agent");
  const ua = `${userAgent || ""} ${headerUserAgent || ""}`.toLowerCase();
  if (ua.includes("claude-code") || ua.includes("claude-cli")) return true;

  const appHeader = getHeaderValueCaseInsensitive(headers, "x-app");
  if (typeof appHeader === "string" && appHeader.trim().toLowerCase() === "cli") return true;

  const sessionId = getHeaderValueCaseInsensitive(headers, "x-claude-code-session-id");
  return typeof sessionId === "string" && sessionId.trim().length > 0;
}
