
import { getActiveStreamCount } from "@omniroute/open-sse/services/streamState.ts";

/**
 * Connection back-pressure for SSE / streaming endpoints.
 *
 * Caps the number of in-flight streaming requests to prevent memory
 * exhaustion under sustained high load. Uses `activeStreams.size` from
 * `streamState` as the live counter.
 *
 * Read the cap from `OMNI_MAX_CONCURRENT_CONNECTIONS` (default `100`).
 */

const OMNI_MAX_CONCURRENT_CONNECTIONS = Math.max(
  1,
  parseInt(process.env.OMNI_MAX_CONCURRENT_CONNECTIONS || "100", 10)
);

/**
 * Reject a request with HTTP 429 when the server is at capacity.
 *
 * @returns `{ shouldReject: true, response: Response }` when at limit,
 *          or `{ shouldReject: false }` when a new slot is available.
 */
export function checkConnectionCapacity() {
  const active = getActiveStreamCount();

  if (active >= OMNI_MAX_CONCURRENT_CONNECTIONS) {
    const retryAfter = Math.max(1, Math.ceil(active / OMNI_MAX_CONCURRENT_CONNECTIONS * 30));
    return {
      shouldReject: true as const,
      response: new Response(
        JSON.stringify({
          error: {
            message: `Server busy — ${active} active connections (limit ${OMNI_MAX_CONCURRENT_CONNECTIONS}). Retry after ${retryAfter}s.`,
            type: "rate_limit",
            retry_after: retryAfter,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(OMNI_MAX_CONCURRENT_CONNECTIONS),
            "X-RateLimit-Remaining": "0",
          },
        }
      ),
    };
  }

  return { shouldReject: false as const };
}

/**
 * Nominally increment / decrement the global active count.
 * Safe no-op when the underlying store does not expose a hook.
 */
export function bumpActiveStreams(delta: number) {
  if (typeof globalThis.__OMNI_ACTIVE_STREAMS === "number") {
    globalThis.__OMNI_ACTIVE_STREAMS = Math.max(0, globalThis.__OMNI_ACTIVE_STREAMS + delta);
  }
}
