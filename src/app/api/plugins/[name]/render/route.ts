import { NextResponse } from "next/server";
import { pluginManager } from "@/lib/plugins/manager";
import { extractApiKey, isValidApiKey } from "@/sse/services/auth";
import { isRequireApiKeyEnabled } from "@/shared/utils/featureFlags";
import { buildErrorBody, sanitizeErrorMessage } from "@omniroute/open-sse/utils/error.ts";
import { HTTP_STATUS } from "@omniroute/open-sse/config/constants.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function errorResp(status: number, message: string): Response {
  return new Response(JSON.stringify(buildErrorBody(status, sanitizeErrorMessage(message))), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function checkAuth(request: Request): Promise<Response | null> {
  const apiKeyRaw = extractApiKey(request);
  if (isRequireApiKeyEnabled() && !apiKeyRaw) {
    return errorResp(HTTP_STATUS.UNAUTHORIZED, "Authentication required");
  }
  if (apiKeyRaw && !(await isValidApiKey(apiKeyRaw))) {
    return errorResp(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }
  return null;
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  const { name } = await params;
  const url = new URL(request.url);
  const page = url.searchParams.get("page") || "index";

  const plugin = pluginManager.getLoaded(name);
  if (!plugin) {
    return NextResponse.json({ error: "Plugin not loaded/active" }, { status: 404 });
  }

  try {
    const content = await pluginManager.renderPluginPage(name, page);
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const authError = await checkAuth(request);
  if (authError) return authError;

  const { name } = await params;

  const plugin = pluginManager.getLoaded(name);
  if (!plugin) {
    return NextResponse.json({ error: "Plugin not loaded/active" }, { status: 404 });
  }

  const body = await request.json();
  const { page, params: pageParams } = body;

  try {
    const content = await pluginManager.renderPluginPage(
      name,
      page || "index",
      pageParams
    );
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 }
    );
  }
}