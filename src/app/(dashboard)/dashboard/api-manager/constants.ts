"use client";

// Constants for validation
export const MAX_KEY_NAME_LENGTH = 200;
export const MAX_SELECTED_MODELS = 500;
export const CLAUDE_CODE_DEFAULT_MODEL_ID = "cc/*";
export const CLAUDE_CODE_DEFAULT_MODEL_NAME = "Claude Code default";
export const CLAUDE_CODE_DEFAULT_FAMILIES = [
  { id: "other", label: "other" },
  { id: "fable", label: "fable" },
  { id: "opus", label: "opus" },
  { id: "sonnet", label: "sonnet" },
  { id: "haiku", label: "haiku" },
] as const;
export type ClaudeCodeFamilyId = (typeof CLAUDE_CODE_DEFAULT_FAMILIES)[number]["id"];
export type ClaudeCodeBlockableFamilyId = Exclude<ClaudeCodeFamilyId, "other">;
export const CLAUDE_CODE_FAMILY_BLOCK_PATTERNS: Record<ClaudeCodeBlockableFamilyId, string[]> = {
  fable: ["claude-fable*", "fable"],
  opus: ["claude-opus*", "opus"],
  sonnet: ["claude-sonnet*", "sonnet"],
  haiku: ["claude-haiku*", "haiku"],
};
export const CLAUDE_CODE_BLOCK_PATTERN_SET = new Set(
  Object.values(CLAUDE_CODE_FAMILY_BLOCK_PATTERNS).flat()
);
