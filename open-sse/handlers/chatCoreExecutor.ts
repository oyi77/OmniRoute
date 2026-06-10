/**
 * Phase 4 (partial) — Executor Resolution with Upstream Proxy.
 *
 * Resolves the appropriate executor for a provider, optionally routing
 * through CLIProxyAPI when upstream proxy is configured.
 *
 * Three modes:
 * - "native": direct executor (no proxy)
 * - "cliproxyapi": always route through CLIProxyAPI
 * - "fallback": try native first, retry via CLIProxyAPI on 5xx/429/network errors
 */

import { getExecutor } from "../executors/index.ts";
import { getUpstreamProxyConfigCached } from "./chatCoreCache.ts";
import { getCachedSettings } from "@/lib/db/readCache";

type LoggerLike = {
  info?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
} | null;

export async function resolveExecutorWithProxy(
  provider: string,
  log?: LoggerLike
) {
  const cfg = await getUpstreamProxyConfigCached(provider);
  if (!cfg.enabled || cfg.mode === "native") return getExecutor(provider);

  if (cfg.mode === "cliproxyapi") {
    log?.info?.("UPSTREAM_PROXY", `${provider} routed through CLIProxyAPI (passthrough)`);
    return getExecutor("cliproxyapi");
  }

  // mode === "fallback": try native first, retry via CLIProxyAPI on specific failures
  const nativeExec = getExecutor(provider);
  const proxyExec = getExecutor("cliproxyapi");

  // Read custom fallback codes from settings. Default: 5xx + 429 + network errors.
  let fallbackCodes: number[] = [429, 500, 502, 503, 504];
  try {
    const allSettings = await getCachedSettings();
    if (
      typeof allSettings.cliproxyapi_fallback_codes === "string" &&
      allSettings.cliproxyapi_fallback_codes.trim()
    ) {
      const parsed = allSettings.cliproxyapi_fallback_codes
        .split(",")
        .map((s: string) => Number.parseInt(s.trim(), 10))
        .filter((n: number) => !Number.isNaN(n));
      if (parsed.length > 0) fallbackCodes = parsed;
    }
  } catch {
    /* use defaults */
  }
  const isRetryableStatus = (s: number) => fallbackCodes.includes(s) || s === 0;

  const wrapper = Object.create(nativeExec);
  wrapper.execute = async (input: {
    model: string;
    body: unknown;
    stream: boolean;
    credentials: unknown;
    signal?: AbortSignal | null;
    log?: unknown;
    upstreamExtraHeaders?: Record<string, string> | null;
  }) => {
    let result: { response: Response; url?: string; headers?: Headers };
    try {
      result = await nativeExec.execute(input);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log?.info?.("UPSTREAM_PROXY", `${provider} native error (${errMsg}), retrying via CLIProxyAPI`);
      try {
        return await proxyExec.execute(input);
      } catch (proxyErr) {
        const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
        log?.error?.("UPSTREAM_PROXY", `${provider} CLIProxyAPI fallback also failed: ${proxyMsg}`);
        throw proxyErr;
      }
    }

    if (!isRetryableStatus(result.response.status)) {
      return result;
    }
    log?.info?.(
      "UPSTREAM_PROXY",
      `${provider} native failed (${result.response.status}), retrying via CLIProxyAPI`
    );
    try {
      return await proxyExec.execute(input);
    } catch (proxyErr) {
      const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
      log?.error?.("UPSTREAM_PROXY", `${provider} CLIProxyAPI fallback also failed: ${proxyMsg}`);
      throw proxyErr;
    }
  };
  return wrapper;
}
