/**
 * Plugin Discovery Tool — Automated provider scanning.
 *
 * Scans known free-tier LLM providers for API availability.
 * Stores results in discovery_results table.
 *
 * @module discovery
 */

import { logger } from "../../open-sse/utils/logger";
import {
  insertDiscoveryResult,
  listDiscoveryResults,
  updateDiscoveryStatus,
  type DiscoveryResult,
} from "../db/discovery";

const log = logger("DISCOVERY");

export interface DiscoveryConfig {
  enabled: boolean;
  scanInterval: number; // ms between scans (default: 24h)
  maxConcurrentScans: number;
  targetProviders: string[]; // empty = scan all known
  notificationWebhook?: string;
}

const DEFAULT_CONFIG: DiscoveryConfig = {
  enabled: false,
  scanInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxConcurrentScans: 3,
  targetProviders: [],
};

// ── Known free-tier endpoints ──

interface ProbeTarget {
  providerId: string;
  endpoint: string;
  method: DiscoveryResult["method"];
  authType: DiscoveryResult["authType"];
  models?: string[];
  rateLimit?: string;
  riskLevel: DiscoveryResult["riskLevel"];
}

const PROBE_TARGETS: ProbeTarget[] = [
  {
    providerId: "pollinations",
    endpoint: "https://text.pollinations.ai/models",
    method: "public_api",
    authType: "none",
    models: ["openai", "mistral", "qwen"],
    riskLevel: "none",
  },
  {
    providerId: "huggingchat",
    endpoint: "https://huggingface.co/chat/api/models",
    method: "free_tier",
    authType: "none",
    riskLevel: "low",
  },
  {
    providerId: "github-models",
    endpoint: "https://models.github.ai/inference/models",
    method: "free_tier",
    authType: "api_key",
    riskLevel: "low",
  },
  {
    providerId: "cerebras",
    endpoint: "https://api.cerebras.ai/v1/models",
    method: "free_tier",
    authType: "api_key",
    rateLimit: "30 req/min",
    riskLevel: "none",
  },
  {
    providerId: "sambanova",
    endpoint: "https://api.sambanova.ai/v1/models",
    method: "free_tier",
    authType: "api_key",
    riskLevel: "none",
  },
  {
    providerId: "deepinfra",
    endpoint: "https://api.deepinfra.com/v1/openai/models",
    method: "free_tier",
    authType: "api_key",
    riskLevel: "none",
  },
];

// ── Probe ──

export async function probeEndpoint(
  url: string,
  signal?: AbortSignal
): Promise<{ accessible: boolean; status?: number; hasModels?: boolean }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "OmniRoute-Discovery/1.0" },
      signal,
    });
    return {
      accessible: res.ok,
      status: res.status,
      hasModels: res.ok,
    };
  } catch {
    return { accessible: false };
  }
}

// ── Scan ──

export async function scanProvider(
  target: ProbeTarget,
  signal?: AbortSignal
): Promise<DiscoveryResult> {
  const result = await probeEndpoint(target.endpoint, signal);
  const feasibility = result.accessible ? (result.hasModels ? 5 : 3) : 1;

  return {
    providerId: target.providerId,
    method: target.method,
    authType: target.authType,
    endpoint: target.endpoint,
    modelsJson: JSON.stringify(target.models ?? []),
    rateLimit: target.rateLimit,
    feasibility,
    riskLevel: target.riskLevel,
    status: result.accessible ? "verified" : "rejected",
    notes: result.accessible
      ? `Endpoint accessible (HTTP ${result.status})`
      : `Endpoint unreachable`,
  };
}

export async function runDiscoveryScan(
  config: Partial<DiscoveryConfig> = {},
  signal?: AbortSignal
): Promise<{ scanned: number; results: DiscoveryResult[] }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    log.info("discovery.disabled");
    return { scanned: 0, results: [] };
  }

  const targets = cfg.targetProviders.length > 0
    ? PROBE_TARGETS.filter((t) => cfg.targetProviders.includes(t.providerId))
    : PROBE_TARGETS;

  log.info("discovery.scan_start", { count: targets.length });

  const results: DiscoveryResult[] = [];
  const concurrency = cfg.maxConcurrentScans;

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((t) => scanProvider(t, signal))
    );
    results.push(...batchResults);
  }

  // Store results in DB
  for (const result of results) {
    try {
      insertDiscoveryResult(result);
    } catch (err: unknown) {
      log.error("discovery.store_failed", { providerId: result.providerId, error: (err as Error).message });
    }
  }

  log.info("discovery.scan_complete", { scanned: results.length, verified: results.filter((r) => r.status === "verified").length });
  return { scanned: results.length, results };
}

// ── Query ──

export function getDiscoveryResults(status?: string): DiscoveryResult[] {
  return listDiscoveryResults(status);
}

export function markVerified(id: number, notes?: string): boolean {
  return updateDiscoveryStatus(id, "verified", notes);
}

export function isDiscoveryEnabled(): boolean {
  return DEFAULT_DISCOVERY_CONFIG.enabled;
}

export { PROBE_TARGETS };
