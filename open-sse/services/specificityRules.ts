import type { SpecificityBreakdown, RuleInput } from "./specificityTypes";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(messages: Array<{ content?: string | unknown }>): number {
  return messages.reduce((sum, msg) => {
    if (typeof msg.content === "string") return sum + estimateTokens(msg.content);
    if (Array.isArray(msg.content)) {
      return (
        sum +
        msg.content.reduce(
          (s: number, part: unknown) =>
            s +
            (typeof (part as { text?: string })?.text === "string"
              ? estimateTokens((part as { text: string }).text)
              : 0),
          0
        )
      );
    }
    return sum;
  }, 0);
}

export function detectCodeComplexity(input: RuleInput): number {
  const allText = input.messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  const codeFenceMatches = allText.match(/```[\s\S]*?```/g);
  const codeBlockCount = codeFenceMatches ? codeFenceMatches.length : 0;

  const inlineCodeMatches = allText.match(/`[^`]+`/g);
  const inlineCodeCount = inlineCodeMatches ? inlineCodeMatches.length : 0;

  const langIndicators = [
    /function\s+\w+\s*\(/gi,
    /const\s+\w+\s*=/gi,
    /import\s+.*from/gi,
    /class\s+\w+/gi,
    /interface\s+\w+/gi,
    /async\s+function/gi,
    /def\s+\w+\s*\(/gi,
    /SELECT\s+.*FROM/gi,
    /\$\{.*\}/g,
  ];
  const langMatches = langIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);

  const raw = codeBlockCount * 5 + inlineCodeCount * 0.5 + langMatches * 2;
  return Math.min(25, Math.round(raw));
}

export function detectMathComplexity(input: RuleInput): number {
  const allText = input.messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  const latexMatches = allText.match(/\$\$[\s\S]*?\$\$|\$[^$]+\$/g);
  const latexCount = latexMatches ? latexMatches.length : 0;

  const mathIndicators = [
    /[+\-*/^]=/g,
    /\b(sin|cos|tan|log|sqrt|sum|prod|int|lim)\b/gi,
    /\b\d+\s*[+\-*/]\s*\d+\s*=/g,
    /∑|∏|∫|√|∞|π/g,
    /\bf'(?:x)?\b/g,
    /\bdx\b/g,
  ];
  const mathMatches = mathIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);

  const raw = latexCount * 4 + mathMatches * 1.5;
  return Math.min(20, Math.round(raw));
}

export function detectReasoningDepth(input: RuleInput): number {
  const allText = input.messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  const reasoningIndicators = [
    /\b(first|step\s*\d|secondly|finally|therefore|thus|consequently|because|since)\b/gi,
    /\b(let me think|let's reason|let's analyze|step by step|breaking this down)\b/gi,
    /\b(we need to|we must|we should|the approach is|the solution involves)\b/gi,
    /(?:\d+\.\s+)(?:\w+)/g,
    /\b(if\s+.+\s+then\s+|assuming\s+|suppose\s+|consider\s+that)\b/gi,
  ];

  const reasonMatches = reasoningIndicators.reduce((sum, re) => {
    const matches = allText.match(re);
    return sum + (matches ? matches.length : 0);
  }, 0);

  const messageDepthBonus = Math.min(5, input.messages.length);

  const raw = reasonMatches * 2 + messageDepthBonus;
  return Math.min(20, Math.round(raw));
}

export function detectContextSize(input: RuleInput): number {
  const totalTokens = estimateMessageTokens(input.messages);
  if (totalTokens > 64000) return 15;
  if (totalTokens > 32000) return 12;
  if (totalTokens > 16000) return 9;
  if (totalTokens > 8000) return 6;
  if (totalTokens > 4000) return 4;
  if (totalTokens > 1000) return 2;
  return 0;
}

export function detectToolCalling(input: RuleInput): number {
  if (!input.tools || input.tools.length === 0) return 0;

  const toolCount = input.tools.length;
  if (toolCount > 20) return 10;
  if (toolCount > 10) return 8;
  if (toolCount > 5) return 6;
  if (toolCount > 2) return 4;
  return 2;
}

export function detectDomainSpecificity(input: RuleInput): number {
  const allText = input.messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

  const domainTerms: Record<string, RegExp[]> = {
    medical: [/\bdiagnosis\b/i, /\bsymptoms\b/i, /\btreatment\b/i, /\bpatient\b/i, /\bclinical\b/i],
    legal: [/\bpursuant\b/i, /\bstatute\b/i, /\bliability\b/i, /\bjurisdiction\b/i, /\bhereby\b/i],
    scientific: [/\bhypothesis\b/i, /\bmethodology\b/i, /\bempirical\b/i, /\bsignificant\b/i],
    financial: [/\bportfolio\b/i, /\bdividend\b/i, /\bamortization\b/i, /\barbitrage\b/i],
  };

  let maxDomainScore = 0;
  for (const [, terms] of Object.entries(domainTerms)) {
    const score = terms.reduce((sum, re) => {
      return sum + (re.test(allText) ? 2 : 0);
    }, 0);
    maxDomainScore = Math.max(maxDomainScore, score);
  }

  return Math.min(10, maxDomainScore);
}

export function getSpecificityBreakdown(input: RuleInput): SpecificityBreakdown {
  return {
    codeComplexity: detectCodeComplexity(input),
    mathComplexity: detectMathComplexity(input),
    reasoningDepth: detectReasoningDepth(input),
    contextSize: detectContextSize(input),
    toolCalling: detectToolCalling(input),
    domainSpecificity: detectDomainSpecificity(input),
  };
}
