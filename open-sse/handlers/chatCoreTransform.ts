/**
 * Phase 2 — Request Transformation.
 *
 * Translates the client-format request body (usually OpenAI) to the target
 * provider-format body (e.g., Anthropic Messages, Gemini content block, etc.).
 */

import { translateRequest } from "../translator/index.ts";

type TransformPhaseInput = {
  sourceFormat: string;
  targetFormat: string;
  model: string | null;
  translatedBody: Record<string, unknown> | null;
  stream: boolean;
  credentials: Record<string, unknown> | null | undefined;
  provider: string | null;
  reqLogger: unknown;
  options: Parameters<typeof translateRequest>[8];
};

export function runTransformPhase(
  input: TransformPhaseInput
): Record<string, unknown> | null {
  const {
    sourceFormat,
    targetFormat,
    model,
    translatedBody,
    stream,
    credentials,
    provider,
    reqLogger,
    options,
  } = input;

  return translateRequest(
    sourceFormat,
    targetFormat,
    model,
    translatedBody,
    stream,
    credentials,
    provider,
    reqLogger as Parameters<typeof translateRequest>[7],
    options
  );
}
