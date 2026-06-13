/**
 * complexityRouter.ts — Request-complexity classification for tier-aware routing.
 *
 * 2026 strategy: route by the intrinsic difficulty of the *request* (not only by
 * provider stats), so trivial prompts can use cheap models and hard/reasoning
 * prompts escalate to capable ones. Built on the existing specificity detector
 * (codeComplexity / mathComplexity / reasoningDepth / contextSize / toolCalling
 * / domainSpecificity), adding an explicit tool-use → minimum-tier escalation:
 * a request carrying tool/function schemas (or agentic tool-calling signals)
 * should not be routed below the "cheap" tier even when the prose looks
 * trivial, because function-calling reliability matters more than raw cost.
 *
 * The classification maps to a `recommendedTier` that feeds the auto-router's
 * tier-affinity / specificity-match scoring factors (see scoreAutoTargets,
 * gated by config.complexityAwareRouting).
 */
import {
  analyzeSpecificity,
  getSpecificityLevel,
  getRecommendedMinTier,
} from "../specificityDetector";
import type { RuleInput, SpecificityLevel } from "../specificityTypes";

export type ComplexityTier = "free" | "cheap" | "premium";

export interface ComplexityClassification {
  /** 0..100 specificity / difficulty score. */
  score: number;
  /** trivial | simple | moderate | complex | expert */
  level: SpecificityLevel;
  /** Minimum provider tier recommended for this request. */
  recommendedTier: ComplexityTier;
  /** True when the request carries tool/function schemas or agentic tool signals. */
  hasToolUse: boolean;
  /** Names of the specificity rules that fired (for the inspector / dashboard). */
  signals: string[];
}

const TIER_ORDER: ComplexityTier[] = ["free", "cheap", "premium"];

/** Raise `tier` to at least `floor`; never lowers it. */
export function escalateTier(tier: ComplexityTier, floor: ComplexityTier): ComplexityTier {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(floor) ? tier : floor;
}

/**
 * Classify a request's complexity and recommend a minimum provider tier.
 * Pure + dependency-light (no DB / network); safe on the hot path.
 */
export function classifyRequestComplexity(input: RuleInput): ComplexityClassification {
  const result = analyzeSpecificity(input);
  const level = getSpecificityLevel(result.score);

  const explicitTools = Array.isArray(input.tools) && input.tools.length > 0;
  const hasToolUse = explicitTools || result.breakdown.toolCalling > 0;

  let recommendedTier = getRecommendedMinTier(level) as ComplexityTier;
  // Tool-using / agentic requests need reliable function calling — floor at "cheap".
  if (hasToolUse) recommendedTier = escalateTier(recommendedTier, "cheap");

  return {
    score: result.score,
    level,
    recommendedTier,
    hasToolUse,
    signals: result.rulesTriggered,
  };
}
