import { NextRequest, NextResponse } from "next/server";
import { getCompressionAnalyticsSummary } from "@/lib/db/compressionAnalytics";
import { enforceApiKeyPolicy } from "@/shared/utils/apiKeyPolicy";

export async function GET(request: NextRequest) {
  const authError = await enforceApiKeyPolicy(request, "analytics");
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since") || "24h";

  try {
    const summary = getCompressionAnalyticsSummary(since);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Compression analytics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
