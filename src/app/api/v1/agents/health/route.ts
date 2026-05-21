import { NextRequest, NextResponse } from "next/server";
import { getAgent, getAvailableAgents } from "@/lib/cloudAgent/registry";
import { getDbInstance } from "@/lib/db/core";
import type { AgentCredentials } from "@/lib/cloudAgent/baseAgent";
import { getCloudAgentCorsHeaders, requireCloudAgentManagementAuth } from "@/lib/cloudAgent/api";
import pino from "pino";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error";

const logger = pino({ name: "cloud-agents-health-api" });

const PROVIDER_NAMES: Record<string, string> = {
  jules: "Jules",
  devin: "Devin",
  "codex-cloud": "Codex Cloud",
};

function getCredentialFromDb(providerId: string): AgentCredentials | null {
  const db = getDbInstance();

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_agent_credentials (
      provider_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      base_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const row = db
    .prepare("SELECT api_key, base_url FROM cloud_agent_credentials WHERE provider_id = ?")
    .get(providerId) as { api_key: string; base_url: string | null } | undefined;

  if (!row) return null;

  const creds: AgentCredentials = { apiKey: row.api_key };
  if (row.base_url) creds.baseUrl = row.base_url;
  return creds;
}

interface ProviderHealth {
  id: string;
  name: string;
  connected: boolean;
  latencyMs: number;
  error?: string;
}

async function checkProviderHealth(providerId: string): Promise<ProviderHealth> {
  const name = PROVIDER_NAMES[providerId] ?? providerId;
  const agent = getAgent(providerId);

  if (!agent) {
    return { id: providerId, name, connected: false, latencyMs: 0, error: "Unknown provider" };
  }

  const credentials = getCredentialFromDb(providerId);
  if (!credentials) {
    return {
      id: providerId,
      name,
      connected: false,
      latencyMs: 0,
      error: "No credentials configured",
    };
  }

  const start = Date.now();
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), 5000)
    );
    await Promise.race([agent.listSources(credentials), timeoutPromise]);
    return { id: providerId, name, connected: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      id: providerId,
      name,
      connected: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { headers: getCloudAgentCorsHeaders(request) });
}

export async function GET(request: NextRequest) {
  try {
    const authError = await requireCloudAgentManagementAuth(request);
    if (authError) return authError;

    const agentIds = getAvailableAgents();
    const results = await Promise.all(agentIds.map(checkProviderHealth));

    return NextResponse.json(
      { providers: results },
      { headers: getCloudAgentCorsHeaders(request) }
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to check cloud agent health");
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
