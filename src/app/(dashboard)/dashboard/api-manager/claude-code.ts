"use client";

import type { Model } from "./helpers";
import {
  type ClaudeCodeBlockableFamilyId,
  CLAUDE_CODE_DEFAULT_MODEL_ID,
  CLAUDE_CODE_DEFAULT_MODEL_NAME,
  CLAUDE_CODE_FAMILY_BLOCK_PATTERNS,
} from "./constants";

export function isClaudeCodeModel(model: Model): boolean {
  return (
    model.owned_by === "claude" || model.id.startsWith("cc/") || model.id.startsWith("claude/")
  );
}

export function withClaudeCodeDefaultModel(models: Model[]): Model[] {
  if (!models.some(isClaudeCodeModel)) return models;
  if (models.some((model) => model.id === CLAUDE_CODE_DEFAULT_MODEL_ID)) return models;
  return [
    {
      id: CLAUDE_CODE_DEFAULT_MODEL_ID,
      name: CLAUDE_CODE_DEFAULT_MODEL_NAME,
      owned_by: "claude",
    },
    ...models,
  ];
}

export function getBlockedClaudeCodeFamilies(blockedModels: string[]): ClaudeCodeBlockableFamilyId[] {
  return (Object.keys(CLAUDE_CODE_FAMILY_BLOCK_PATTERNS) as ClaudeCodeBlockableFamilyId[]).filter(
    (familyId) =>
      CLAUDE_CODE_FAMILY_BLOCK_PATTERNS[familyId].some((pattern) => blockedModels.includes(pattern))
  );
}

export function isClaudeCodeFamilyModel(modelId: string, familyId: ClaudeCodeBlockableFamilyId): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized === familyId ||
    normalized.includes(`/${familyId}`) ||
    normalized.includes(`-${familyId}`)
  );
}
