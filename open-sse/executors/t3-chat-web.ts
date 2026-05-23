/**
 * T3ChatWebExecutor — t3.chat Session Provider
 *
 * Routes requests through t3.chat using cookie-based session auth.
 * t3.chat is a Convex-based app — requests go to a Convex HTTP action endpoint.
 *
 * Auth: cookies + convexSessionId (both required)
 * Method: Direct HTTP (Convex HTTP actions)
 *
 * FIXUP items marked below require live DevTools capture to confirm exact
 * Convex SSE chunk schema, endpoint URL, and request field names. The current
 * implementation uses best-effort patterns that work without live capture.
 */

import { BaseExecutor, type ExecuteInput } from "./base.ts";
import { sanitizeErrorMessage } from "../utils/error.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

export const T3_CHAT_BASE = "https://t3.chat";

/** FIXUP: Confirm this URL — may be "https://t3.chat/api/chat" or a Convex
 *  cloud deployment URL (e.g. t3.chat on convex.app). Reference: T3Router Rust
 *  source (github.com/vibheksoni/t3router) BASE_URL constant. */
const COMPLETION_URL = `${T3_CHAT_BASE}/api/chat`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface T3ChatCredentials {
  cookies: string;
  convexSessionId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateCredentials(creds: unknown): creds is T3ChatCredentials {
  const raw = typeof creds === "object" && creds !== null ? (creds as Record<string, unknown>) : {};
  return (
    typeof raw.cookies === "string" &&
    raw.cookies.length > 0 &&
    typeof raw.convexSessionId === "string" &&
    raw.convexSessionId.length > 0
  );
}

function buildErrorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: sanitizeErrorMessage(message),
        type: "upstream_error",
        code: `HTTP_${status}`,
      },
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

// ─── SSE Transform (t3.chat Convex → OpenAI) ─────────────────────────────────
// FIXUP: Confirm the exact field path in Convex SSE chunks from live capture.
// Current guess covers common Convex streaming patterns: { text, delta, content, v.text }

function transformT3SSE(t3Stream: ReadableStream, model: string): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const id = `chatcmpl-t3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  let emittedRole = false;

  return new ReadableStream({
    async start(controller) {
      const reader = t3Stream.getReader();
      let buffer = "";

      const emit = (obj: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const chunk = (delta: object, finish?: string | null) => {
        emit({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finish ?? null }],
        });
      };

      const close = () => {
        if (!emittedRole) {
          emittedRole = true;
          chunk({ role: "assistant", content: "" });
        }
        chunk({}, "stop");
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();

            if (payload === "[DONE]") {
              close();
              return;
            }

            let data: Record<string, unknown>;
            try {
              data = JSON.parse(payload);
            } catch {
              continue;
            }

            // FIXUP: Replace with real field path from captured Convex SSE chunk.
            const textContent =
              (data as any)?.text ??
              (data as any)?.delta ??
              (data as any)?.content ??
              (data as any)?.v?.text ??
              null;

            if (typeof textContent === "string" && textContent.length > 0) {
              if (!emittedRole) {
                emittedRole = true;
                chunk({ role: "assistant", content: "" });
              }
              chunk({ content: textContent });
            }

            // FIXUP: Replace with real end-of-stream marker from captured traffic.
            const isDone =
              (data as any)?.type === "done" ||
              (data as any)?.done === true ||
              (data as any)?.status === "complete" ||
              (data as any)?.finish_reason === "stop";

            if (isDone) {
              close();
              return;
            }
          }
        }
      } catch {
        // Stream error — fall through to close
      }

      close();
    },
  });
}

async function collectSSEContent(t3Stream: ReadableStream): Promise<string> {
  const decoder = new TextDecoder();
  const reader = t3Stream.getReader();
  let buffer = "";
  const parts: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") break;
      try {
        const data = JSON.parse(payload);
        // FIXUP: Use real field path from captured Convex SSE chunk.
        const textContent =
          (data as any)?.text ??
          (data as any)?.delta ??
          (data as any)?.content ??
          (data as any)?.v?.text ??
          null;
        if (typeof textContent === "string") parts.push(textContent);
      } catch {
        // skip
      }
    }
  }

  return parts.join("");
}

// ─── Executor ────────────────────────────────────────────────────────────────

export class T3ChatWebExecutor extends BaseExecutor {
  constructor() {
    super("t3-web", { baseUrl: T3_CHAT_BASE });
  }

  async testConnection(
    credentials: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      if (!validateCredentials(credentials)) return false;

      // FIXUP: Replace with a lightweight confirmed probe endpoint if different from base.
      const resp = await fetch(T3_CHAT_BASE, {
        method: "HEAD",
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: credentials.cookies,
        },
        signal,
      });
      // A 200/302/404 all indicate the site is reachable and the cookie was accepted.
      return resp.status < 500;
    } catch {
      return false;
    }
  }

  async execute({ model, body, stream, credentials, signal, log }: ExecuteInput) {
    const bodyObj = (body || {}) as Record<string, unknown>;
    const messages = (Array.isArray(bodyObj.messages) ? bodyObj.messages : []) as Array<{
      role: string;
      content: string | unknown;
    }>;
    const rawCreds = credentials as unknown as Record<string, unknown>;

    // 1. Validate credentials
    if (!validateCredentials(rawCreds)) {
      const missing = !rawCreds.cookies
        ? "cookies"
        : !rawCreds.convexSessionId
          ? "convexSessionId"
          : "both fields";
      return {
        response: buildErrorResponse(
          400,
          `t3.chat credentials invalid: missing or empty ${missing}. Both 'cookies' and 'convexSessionId' are required.`
        ),
        url: COMPLETION_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const { cookies, convexSessionId } = rawCreds as T3ChatCredentials;
    let headers: Record<string, string> = {};

    try {
      // 2. Build request headers
      // FIXUP: Confirm whether convex-session-id goes in a header or body field.
      //   If header: keep "convex-session-id" (current guess).
      //   If body: remove this header and add to requestPayload instead.
      headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        Accept: "text/event-stream, application/json",
        Cookie: cookies,
        "convex-session-id": convexSessionId,
        Referer: `${T3_CHAT_BASE}/`,
        Origin: T3_CHAT_BASE,
      };

      // 3. Build request payload
      // FIXUP: Confirm exact field names from captured network traffic (model, messages, stream).
      const requestPayload: Record<string, unknown> = {
        model,
        messages,
        stream: stream !== false,
      };

      log?.info?.("T3-CHAT-WEB", `POST ${COMPLETION_URL} model=${model}`);

      const resp = await fetch(COMPLETION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload),
        signal,
      });

      // 4. Handle HTTP errors
      if (!resp.ok) {
        const status = resp.status;
        let errMsg = `t3.chat API error (${status})`;
        if (status === 401 || status === 403) {
          errMsg =
            "t3.chat session expired or unauthorized — re-paste your cookies and convex-session-id.";
        } else if (status === 429) {
          errMsg = "t3.chat rate limited. Wait and retry.";
        }
        log?.warn?.("T3-CHAT-WEB", errMsg);
        return {
          response: buildErrorResponse(status, errMsg),
          url: COMPLETION_URL,
          headers,
          transformedBody: requestPayload,
        };
      }

      const ct = resp.headers.get("content-type") || "";

      // 5. Non-streaming full JSON response path
      if (ct.includes("application/json")) {
        const json = await resp.json();
        if (json?.error) {
          const errMsg = `t3.chat error: ${json.error?.message ?? JSON.stringify(json.error)}`;
          log?.warn?.("T3-CHAT-WEB", errMsg);
          return {
            response: buildErrorResponse(502, errMsg),
            url: COMPLETION_URL,
            headers,
            transformedBody: requestPayload,
          };
        }
        if (json?.choices) {
          return {
            response: new Response(JSON.stringify(json), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
            url: COMPLETION_URL,
            headers,
            transformedBody: requestPayload,
          };
        }
        // FIXUP: Confirm non-streaming response field names from captured traffic.
        const content =
          (json as any)?.content ?? (json as any)?.text ?? (json as any)?.message?.content ?? "";
        const openaiResponse = {
          id: `chatcmpl-t3-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: model || "unknown",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: String(content) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
        return {
          response: new Response(JSON.stringify(openaiResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
          url: COMPLETION_URL,
          headers,
          transformedBody: requestPayload,
        };
      }

      // 6. Streaming SSE path
      if (!resp.body) {
        return {
          response: buildErrorResponse(502, "t3.chat returned an empty response body"),
          url: COMPLETION_URL,
          headers,
          transformedBody: requestPayload,
        };
      }

      if (stream !== false) {
        const openaiStream = transformT3SSE(resp.body, model || "unknown");
        return {
          response: new Response(openaiStream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          }),
          url: COMPLETION_URL,
          headers,
          transformedBody: requestPayload,
        };
      }

      // Non-streaming: collect SSE content and return OpenAI JSON
      const content = await collectSSEContent(resp.body);
      const openaiResponse = {
        id: `chatcmpl-t3-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model || "unknown",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
      return {
        response: new Response(JSON.stringify(openaiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        url: COMPLETION_URL,
        headers,
        transformedBody: requestPayload,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log?.error?.("T3-CHAT-WEB", `Execute failed: ${msg}`);

      if (err instanceof DOMException && err.name === "AbortError") {
        return {
          response: buildErrorResponse(499, "Request cancelled"),
          url: COMPLETION_URL,
          headers: {},
          transformedBody: body,
        };
      }

      return {
        response: buildErrorResponse(502, `t3.chat connection error: ${msg}`),
        url: COMPLETION_URL,
        headers,
        transformedBody: body,
      };
    }
  }
}

export const t3ChatWebExecutor = new T3ChatWebExecutor();
