import { NextRequest, NextResponse } from "next/server";
import { validateBody, isValidationFailure } from "@/shared/validation/helpers";
import { z } from "zod";

const previewSchema = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  mode: z.enum(["off", "lite", "standard", "aggressive", "ultra"]),
});

function roughTokenCount(text: string): number {
  return Math.ceil((text.match(/\s+/g) || []).length * 1.3);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateBody(previewSchema, body);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { messages, mode } = validation.data;
    const original = messages.map((m) => m.content).join("\n");
    const originalTokens = roughTokenCount(original);

    if (mode === "off") {
      return NextResponse.json({
        original,
        compressed: original,
        originalTokens,
        compressedTokens: originalTokens,
        tokensSaved: 0,
        savingsPct: 0,
        techniquesUsed: [],
        durationMs: 0,
      });
    }

    // Placeholder for actual compression engine call
    const compressed = original; // TODO: call actual compression
    const compressedTokens = roughTokenCount(compressed);
    const tokensSaved = originalTokens - compressedTokens;

    return NextResponse.json({
      original,
      compressed,
      originalTokens,
      compressedTokens,
      tokensSaved,
      savingsPct: originalTokens > 0 ? (tokensSaved / originalTokens) * 100 : 0,
      techniquesUsed: [mode],
      durationMs: 0,
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
