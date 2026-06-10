/**
 * Phase 1 — Setup for handleChatCore.
 *
 * Initializes all early-request state in one place:
 * - Heap-pressure guard (reject early if memory is exhausted)
 * - apiFormat / customModelTargetFormat extraction from modelInfo
 * - Trace setup (id, elapsed helper, emit request.started)
 * - System prompt injection into the request body
 * - Plugin onRequest hook execution (block short-circuit)
 *
 * On early failure (heap pressure, plugin block) returns a discriminated
 * `{ kind: "earlyReturn", response }` so the caller can immediately
 * return the error response.
 *
 * On success returns `{ kind: "ready", context }` with the initialized
 * state the rest of the pipeline will close over.
 */
import { injectSystemPrompt } from "../services/systemPrompt.ts";
import { HEAP_PRESSURE_THRESHOLD_MB } from "../utils/heapPressure.ts";
import { emit } from "@/lib/events/eventBus";

type LoggerLike = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
} | null;

type ModelInfo = {
  provider: string | null;
  model: string | null;
  extendedContext: unknown;
};

type Body = Record<string, unknown> | null;

type TraceFn = (label: string, extra?: Record<string, unknown>) => void;

type SetupContext = {
  body: Body;
  provider: string | null;
  model: string | null;
  extendedContext: unknown;
  apiFormat: string | undefined;
  customModelTargetFormat: string | undefined;
  requestedModel: string;
  isModelScope: () => boolean;
  startTime: number;
  traceId: string;
  trace: TraceFn;
  traceEnabled: boolean;
  tokensCompressed: number | null;
};

type EarlyReturn = { kind: "earlyReturn"; response: Response; status: number };

export type SetupPhaseResult = EarlyReturn | Ready;

export type SetupPhaseInput = {
  body: Body;
  modelInfo: ModelInfo;
  apiKeyInfo: unknown;
  log: LoggerLike;
  comboName?: string;
};

/**
 * Run the Phase 1 setup. Either returns a short-circuit error response
 * (heap pressure or plugin block) or a fully-initialized context the
 * rest of the pipeline can use.
 */
export async function runSetupPhase(input: SetupPhaseInput): Promise<SetupPhaseResult> {
  let { body, modelInfo, apiKeyInfo, log, comboName } = input;
  let { provider, model, extendedContext } = modelInfo;

  // ── Memory pressure guard ─────────────────────────────────────────
  // Reject early if V8 heap is already near the limit. Prevents cascading
  // OOM when many large-context requests arrive concurrently.
  try {
    const heapUsedMB = process.memoryUsage().heapUsed / (1024 * 1024);
    if (heapUsedMB > HEAP_PRESSURE_THRESHOLD_MB) {
      // Internal telemetry only — never expose the heap figure to clients.
      console.warn(
        `[chatCore] heap pressure guard tripped: ${Math.round(heapUsedMB)}MB > ${HEAP_PRESSURE_THRESHOLD_MB}MB; returning 503`
      );
      return {
        kind: "earlyReturn",
        status: 503,
        response: new Response(
          JSON.stringify({
            error: {
              message: "Service temporarily unavailable due to resource pressure. Retry shortly.",
              type: "server_error",
              code: "heap_pressure",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "5" } }
        ),
      };
    }
  } catch {
    /* memoryUsage() never throws */
  }

  // ── Extract optional custom-model fields from modelInfo ──────────
  // apiFormat / targetFormat are markers injected by getModelInfo for
  // custom models that aren't in the static provider registry.
  const apiFormat: string | undefined =
    modelInfo && typeof modelInfo === "object" && "apiFormat" in modelInfo
      ? typeof (modelInfo as { apiFormat?: unknown }).apiFormat === "string"
        ? ((modelInfo as { apiFormat?: string }).apiFormat as string)
        : undefined
      : undefined;
  const customModelTargetFormat: string | undefined =
    modelInfo && typeof modelInfo === "object" && "targetFormat" in modelInfo
      ? typeof (modelInfo as { targetFormat?: unknown }).targetFormat === "string"
        ? ((modelInfo as { targetFormat?: string }).targetFormat as string)
        : undefined
      : undefined;
  const requestedModel =
    typeof body?.model === "string" && body.model.trim().length > 0 ? body.model : model;

  // ── Trace instrumentation setup ─────────────────────────────────
  // trace() is called at every phase boundary in handleChatCore. It
  // only emits when OMNIROUTE_TRACE=true or DEBUG=true is set.
  const startTime = Date.now();
  const traceId = Math.random().toString(36).slice(2, 8);

  setImmediate(() => {
    emit("request.started", {
      id: traceId,
      model: model || "unknown",
      provider: provider || "unknown",
      timestamp: startTime,
      comboName: comboName || undefined,
    });
  });

  const traceEnabled = process.env.OMNIROUTE_TRACE === "true" || process.env.DEBUG === "true";
  const trace: TraceFn = (label, extra) => {
    if (!traceEnabled) return;
    const elapsed = Date.now() - startTime;
    let suffix = "";
    if (extra) {
      try {
        suffix = ` ${JSON.stringify(extra)}`;
      } catch {
        suffix = " [unserializable]";
      }
    }
    log?.info?.("STAGE_TRACE", `${traceId} ${label} t=${elapsed}ms${suffix}`);
  };
  trace("phase1_setup", { provider, model });

  // ── System prompt injection ─────────────────────────────────────
  // Inject the configured system prompt into the request body if
  // upstream providers are configured to receive it.
  const tokensCompressed: number | null = null;
  body = injectSystemPrompt(body as Record<string, unknown> | null) as Body;

  // ── Plugin onRequest hook ───────────────────────────────────────
  // Dynamic import cached by Node.js after first call — minimal overhead
  try {
    const { runOnRequest } = await import("@/lib/plugins/hooks");
    const pluginCtx = {
      requestId: traceId,
      body,
      model,
      provider,
      apiKeyInfo,
      metadata: {},
    };
    const pluginResult = await runOnRequest(pluginCtx as unknown as Parameters<typeof runOnRequest>[0]);
    if (pluginResult && "blocked" in pluginResult && pluginResult.blocked) {
      log?.info?.("PLUGIN", `Request blocked by plugin`);
      const errorBody = pluginResult.response
        ? JSON.stringify(pluginResult.response)
        : JSON.stringify({
            error: { message: "Request blocked by plugin", type: "plugin_block" },
          });
      return {
        kind: "earlyReturn",
        status: 403,
        response: new Response(errorBody, {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  } catch (pluginErr) {
    log?.warn?.(
      "PLUGIN",
      `onRequest hook failed (continuing without plugin): ${pluginErr instanceof Error ? pluginErr.message : String(pluginErr)}`
    );
  }

  // isModelScope is a closure that depends on credentials, which the
  // setup input does not include. The caller (handleChatCore) wraps
  // this before using it, or we accept credentials as an additional
  // parameter. For now we return a placeholder that the caller can
  // override.
  const isModelScope = () => false;

  return {
    kind: "ready",
    context: {
      body,
      provider,
      model,
      extendedContext,
      apiFormat,
      customModelTargetFormat,
      requestedModel,
      startTime,
      traceId,
      trace,
      traceEnabled,
      tokensCompressed,
    },
  };
}
