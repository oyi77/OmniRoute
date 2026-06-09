/**
 * Error factory functions extracted from chatCore.ts.
 *
 * These functions create typed Error objects for timeout, abort, and
 * streaming error scenarios. Extracted as part of modularization (Phase 2).
 *
 * @module handlers/chatCoreErrors
 */

/**
 * Create an error for response body read timeout.
 */
export function createBodyTimeoutError(timeoutMs: number): Error {
  const err = new Error(`Response body read timeout after ${timeoutMs}ms`);
  err.name = "BodyTimeoutError";
  return err;
}

/**
 * Create an error for upstream request start timeout.
 */
export function createUpstreamStartTimeoutError(
  timeoutMs: number,
  provider: string,
  model: string
): Error {
  const err = new Error(
    `Upstream request did not return response headers after ${timeoutMs}ms (${provider}/${model})`
  );
  err.name = "TimeoutError";
  return err;
}

/**
 * Create an error for aborted operations.
 */
export function createAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error(typeof reason === "string" ? reason : "The operation was aborted");
  err.name = "AbortError";
  return err;
}

/**
 * Create a streaming error result with SSE-formatted error body.
 */
export function createStreamingErrorResult(
  statusCode: number,
  message: string,
  code?: string,
  type?: string
) {
  const errorBody: Record<string, unknown> = {
    error: {
      message,
      type: type || "upstream_error",
      code: code || "upstream_error",
    },
  };

  const body = `data: ${JSON.stringify(errorBody)}\n\ndata: [DONE]\n\n`;

  return {
    success: false as const,
    status: statusCode,
    error: message,
    response: new Response(body, {
      status: statusCode,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }),
  };
}

/**
 * Get a human-readable identifier from an upstream error.
 */
export function getUpstreamErrorIdentifier(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  if (typeof e.code === "string") return e.code;
  if (typeof e.name === "string") return e.name;
  return undefined;
}
