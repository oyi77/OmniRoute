/**
 * Helper functions extracted from chatCore.ts.
 *
 * These functions are pure helpers with no dependencies on chatCore module-level
 * state. Extracted as part of modularization (Phase 8).
 *
 * @module handlers/chatCoreHelpers
 */

import { FORMATS } from "../translator/formats.ts";
import { getHeaderValueCaseInsensitive } from "./chatCoreUtils.ts";
import { toFiniteNumberOrNull } from "./chatCoreUtils.ts";

/**
 * Materialize a deduplicated execution result by reconstructing its Response
 * from the stored snapshot.
 */
export function materializeDeduplicatedExecutionResult<T extends Record<string, unknown>>(
  result: T
): T {
  const snapshot =
    result && typeof result === "object"
      ? ((result as Record<string, unknown>)._dedupSnapshot as
          | {
              status: number;
              statusText: string;
              headers: [string, string][];
              payload: string;
            }
          | undefined)
      : undefined;

  if (!snapshot) return result;

  return {
    ...result,
    response: new Response(snapshot.payload, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers,
    }),
  } as T;
}

/**
 * Normalize an executor result to a consistent shape.
 */
export function normalizeExecutorResult(
  result:
    | Response
    | {
        response: Response;
        url?: string;
        headers?: Record<string, string>;
        transformedBody?: unknown;
      }
): { response: Response; url: string; headers: Record<string, string>; transformedBody: unknown } {
  if (result instanceof Response) {
    return { response: result, url: "", headers: {}, transformedBody: null };
  }
  return {
    response: result.response,
    url: result.url || "",
    headers: result.headers || {},
    transformedBody: result.transformedBody ?? null,
  };
}

/**
 * Wrap a ReadableStream with a finalize callback that runs on completion or error.
 */
export function wrapReadableStreamWithFinalize<T>(
  readable: ReadableStream<T>,
  finalize: () => void
): ReadableStream<T> {
  const reader = readable.getReader();
  let finalized = false;

  const runFinalize = () => {
    if (finalized) return;
    finalized = true;
    finalize();
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          runFinalize();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        runFinalize();
        controller.error(error);
      }
    },

    async cancel(reason) {
      runFinalize();
      try {
        await reader.cancel(reason);
      } catch {
        // Ignored
      }
    },
  });
}

/**
 * Resolve the account key for semaphore tracking.
 */
export function resolveAccountSemaphoreAccountKey(
  connectionId: string | null | undefined,
  credentials: Record<string, unknown> | null | undefined
): string | null {
  if (typeof connectionId === "string" && connectionId.trim().length > 0) {
    return connectionId;
  }

  const candidateKeys = [
    credentials?.connectionId,
    credentials?.id,
    credentials?.email,
    credentials?.name,
    credentials?.displayName,
  ];

  for (const candidate of candidateKeys) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * Resolve the max concurrency for an account semaphore.
 */
export function resolveAccountSemaphoreMaxConcurrency(
  credentials: Record<string, unknown> | null | undefined
): number | null {
  return toFiniteNumberOrNull(credentials?.maxConcurrent);
}

/**
 * Build executor client headers from request headers and user agent.
 */
export function buildExecutorClientHeaders(
  headers: Headers | Record<string, unknown> | null | undefined,
  userAgent?: string | null
): Record<string, string> | null {
  const normalized: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        normalized[key] = value;
      }
    }
  }

  const normalizedUserAgent = typeof userAgent === "string" ? userAgent.trim() : "";
  if (normalizedUserAgent && !normalized["user-agent"] && !normalized["User-Agent"]) {
    normalized["user-agent"] = normalizedUserAgent;
    normalized["User-Agent"] = normalizedUserAgent;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

/**
 * Check if the client is a Copilot client based on headers and user agent.
 */
export function isCopilotClient(
  headers: Headers | Record<string, unknown> | null | undefined,
  userAgent?: string | null
): boolean {
  const isMatch = (value: unknown) =>
    typeof value === "string" && value.toLowerCase().includes("copilot");

  if (isMatch(userAgent)) return true;

  if (headers instanceof Headers) {
    for (const [key, value] of headers as unknown as Iterable<[string, string]>) {
      if (isMatch(key) || isMatch(value)) return true;
    }
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (isMatch(key) || isMatch(value)) return true;
    }
  }

  return false;
}

/**
 * Build Claude prompt cache log metadata.
 */
export function buildClaudePromptCacheLogMeta(
  targetFormat: string,
  finalBody: Record<string, unknown> | null | undefined,
  providerHeaders: Record<string, unknown> | Headers | null | undefined,
  clientHeaders?: Headers | Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (targetFormat !== FORMATS.CLAUDE || !finalBody || typeof finalBody !== "object") return null;

  const describeCacheControl = (
    cacheControl: Record<string, unknown> | undefined,
    extra: Record<string, unknown> = {}
  ) => ({
    type:
      cacheControl && typeof cacheControl.type === "string" && cacheControl.type.trim()
        ? cacheControl.type.trim()
        : "ephemeral",
    ttl:
      cacheControl && typeof cacheControl.ttl === "string" && cacheControl.ttl.trim()
        ? cacheControl.ttl.trim()
        : null,
    ...extra,
  });

  const systemBreakpoints = Array.isArray(finalBody.system)
    ? (finalBody.system as Record<string, unknown>[]).flatMap(
        (block: Record<string, unknown>, index: number) => {
          if (!block || typeof block !== "object") return [];
          const text =
            typeof block.text === "string" && block.text.trim().length > 0
              ? block.text.trim()
              : "";
          if (text.startsWith("x-anthropic-billing-header:")) {
            return [];
          }
          const cacheControl =
            block.cache_control && typeof block.cache_control === "object"
              ? block.cache_control
              : null;
          return cacheControl
            ? [describeCacheControl(cacheControl as Record<string, unknown>, { index })]
            : [];
        }
      )
    : [];

  const toolBreakpoints = Array.isArray(finalBody.tools)
    ? (finalBody.tools as Record<string, unknown>[]).flatMap(
        (tool: Record<string, unknown>, index: number) => {
          if (!tool || typeof tool !== "object") return [];
          const cacheControl =
            tool.cache_control && typeof tool.cache_control === "object"
              ? tool.cache_control
              : null;
          const name =
            typeof tool.name === "string" && tool.name.trim() ? tool.name.trim() : null;
          return cacheControl
            ? [
                describeCacheControl(cacheControl as Record<string, unknown>, {
                  index,
                  name,
                }),
              ]
            : [];
        }
      )
    : [];

  const messageBreakpoints = Array.isArray(finalBody.messages)
    ? (finalBody.messages as Record<string, unknown>[]).flatMap(
        (message: Record<string, unknown>, messageIndex: number) => {
          if (!message || typeof message !== "object" || !Array.isArray(message.content))
            return [];
          const role =
            typeof message.role === "string" && message.role.trim()
              ? message.role.trim()
              : "unknown";
          return (message.content as Record<string, unknown>[]).flatMap(
            (block: Record<string, unknown>, contentIndex: number) => {
              if (!block || typeof block !== "object") return [];
              const cacheControl =
                block.cache_control && typeof block.cache_control === "object"
                  ? block.cache_control
                  : null;
              if (!cacheControl) return [];
              return [
                describeCacheControl(cacheControl as Record<string, unknown>, {
                  messageIndex,
                  contentIndex,
                  role,
                  blockType:
                    typeof block.type === "string" && block.type.trim()
                      ? block.type.trim()
                      : "unknown",
                }),
              ];
            }
          );
        }
      )
    : [];

  const totalBreakpoints =
    systemBreakpoints.length + toolBreakpoints.length + messageBreakpoints.length;
  let anthropicBeta = getHeaderValueCaseInsensitive(providerHeaders, "Anthropic-Beta");
  if (!anthropicBeta) {
    anthropicBeta = getHeaderValueCaseInsensitive(clientHeaders, "Anthropic-Beta");
  }

  if (totalBreakpoints === 0 && !anthropicBeta) return null;

  return {
    applied: totalBreakpoints > 0,
    totalBreakpoints,
    anthropicBeta,
    systemBreakpoints,
    toolBreakpoints,
    messageBreakpoints,
  };
}
