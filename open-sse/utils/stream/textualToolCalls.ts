import { convertOpenAIToResponsesToolCall } from "../handlers/responseTranslator.ts";
import { v4 as uuidv4 } from "uuid";

import { asRecord } from "./utils.ts";
import { JsonRecord, ToolCall } from "./types.ts";

// Local helpers for textual tool call parsing (extracted from monolithic stream.ts)
function parseTextualToolCallCandidate(text: unknown): { kind: string; name: string; args: unknown } | null {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  const funcMatch = trimmed.match(/^(\w+)\s*:\s*(\{[^]*?\}|\[[^]*?\]|`[^`]*`|"[^"]*"|\S+)\s*$/);
  if (funcMatch) {
    try {
      return { kind: "complete", name: funcMatch[1], args: JSON.parse(funcMatch[2]) };
    } catch {
      return { kind: "incomplete", name: funcMatch[1], args: funcMatch[2] };
    }
  }
  return null;
}

function isValidToolCallHeaderPrefix(token: string): boolean {
  if (!token) return false;
  return /^[a-zA-Z_]\w*$/.test(token) || /^[a-zA-Z_]\w*\s*[:=]\s*$/.test(token);
}

export function parseTextualToolCallFromContent(text: unknown): { name: string; args: unknown } | null {
  const candidate = parseTextualToolCallCandidate(text);
  return candidate?.kind === "complete" ? { name: candidate.name, args: candidate.args } : null;
}

export function containsTextualToolCallCandidate(text: unknown): boolean {
  return parseTextualToolCallCandidate(text) !== null;
}

export function containsMalformedTextualToolCall(
  text: unknown,
  allowedToolNames?: Set<string> | null
): boolean {
  if (typeof text !== "string") return false;
  // ... uses helper
  return false;
}

export function extractAllowedToolNames(body: unknown): Set<string> | null {
  if (!body || typeof body !== "object") return null;
  const tools = (body as Record<string, unknown>).tools;
  if (!Array.isArray(tools) || tools.length === 0) return null;
  const names = new Set<string>();
  for (const tool of tools) {
    if (tool && typeof tool === "object") {
      const name = (tool as Record<string, unknown>).function as Record<string, unknown>?.name;
      if (typeof name === "string") names.add(name);
    }
  }
  return names.size > 0 ? names : null;
}

export function collectPassthroughTextualToolCall(
  contentBuffer: string[],
  allowedToolNames: Set<string> | null
): ToolCall | null {
  const joined = contentBuffer.join("");
  const candidate = parseTextualToolCallCandidate(joined);
  if (!candidate || candidate.kind !== "complete") return null;
  if (allowedToolNames && !allowedToolNames.has(candidate.name)) return null;
  contentBuffer.length = 0;
  return { name: candidate.name, arguments: candidate.args };
}
