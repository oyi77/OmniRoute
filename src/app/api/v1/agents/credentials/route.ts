import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDbInstance } from "@/lib/db/core";
import { getCloudAgentCorsHeaders, requireCloudAgentManagementAuth } from "@/lib/cloudAgent/api";
import pino from "pino";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error";

const logger = pino({ name: "cloud-agents-credentials-api" });

const SaveCredentialSchema = z.object({
  providerId: z.enum(["jules", "devin", "codex-cloud"]),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
});

function ensureCredentialsTable(): void {
  const db = getDbInstance();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_agent_credentials (
      provider_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      base_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function maskApiKey(key: string): string {
  if (key.length <= 4) return "****";
  return "****" + key.slice(-4);
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { headers: getCloudAgentCorsHeaders(request) });
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireCloudAgentManagementAuth(request);
    if (authError) return authError;

    ensureCredentialsTable();

    const db = getDbInstance();
    const rows = db
      .prepare("SELECT provider_id, api_key, base_url, updated_at FROM cloud_agent_credentials")
      .all() as {
      provider_id: string;
      api_key: string;
      base_url: string | null;
      updated_at: string;
    }[];

    const data = rows.map((row) => ({
      providerId: row.provider_id,
      apiKey: maskApiKey(row.api_key),
      baseUrl: row.base_url,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ data }, { headers: getCloudAgentCorsHeaders(request) });
  } catch (error) {
    logger.error({ err: error }, "Failed to list cloud agent credentials");
    return NextResponse.json(
      {
        error:
          sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error") ||
          "Internal server error",
      },
      { status: 500, headers: getCloudAgentCorsHeaders(request) }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireCloudAgentManagementAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const validation = SaveCredentialSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400, headers: getCloudAgentCorsHeaders(request) }
      );
    }

    const { providerId, apiKey, baseUrl } = validation.data;

    ensureCredentialsTable();

    const db = getDbInstance();
    db.prepare(
      `INSERT INTO cloud_agent_credentials (provider_id, api_key, base_url, updated_at)
       VALUES (@providerId, @apiKey, @baseUrl, datetime('now'))
       ON CONFLICT(provider_id) DO UPDATE SET
         api_key = excluded.api_key,
         base_url = excluded.base_url,
         updated_at = excluded.updated_at`
    ).run({ providerId, apiKey, baseUrl: baseUrl ?? null });

    return NextResponse.json(
      {
        data: {
          providerId,
          apiKey: maskApiKey(apiKey),
          baseUrl: baseUrl ?? null,
        },
      },
      { status: 201, headers: getCloudAgentCorsHeaders(request) }
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to save cloud agent credentials");
    return NextResponse.json(
      {
        error:
          sanitizeErrorMessage(error instanceof Error ? error.message : "Unknown error") ||
          "Internal server error",
      },
      { status: 500, headers: getCloudAgentCorsHeaders(request) }
    );
  }
}
