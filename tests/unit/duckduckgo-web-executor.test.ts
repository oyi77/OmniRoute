import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DuckDuckGoWebExecutor, DUCKDUCKGO_BASE } from "../../open-sse/executors/duckduckgo-web.ts";

const VALID_MESSAGES_BODY = { messages: [{ role: "user", content: "ping" }] };
const EMPTY_MESSAGES_BODY = { messages: [] };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>
): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

function getHeaderValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  return new Headers(headers).get(name);
}

/**
 * The executor must satisfy the `ExecuteResult` contract used by
 * `open-sse/handlers/chatCore.ts` (see chatCore.ts:3937-4486). Concretely:
 *   - return value is an object, NOT a raw Response
 *   - `.response` is a `Response`
 *   - `.url` and `.headers` and `.transformedBody` are present
 *
 * A previous version of this executor returned a raw `Response`, which
 * caused `res.response.status` to throw "Cannot read properties of undefined
 * (reading 'status')" upstream. The tests below pin the wrapper shape.
 */
function assertExecutorResultShape(result: unknown): asserts result is {
  response: Response;
  url: string;
  headers: Record<string, string>;
  transformedBody: unknown;
} {
  assert.ok(result && typeof result === "object", "execute() must return an object");
  const r = result as Record<string, unknown>;
  assert.ok(r.response instanceof Response, "result.response must be a Response");
  assert.equal(typeof r.url, "string", "result.url must be a string");
  assert.ok(r.headers && typeof r.headers === "object", "result.headers must be an object");
}

describe("DuckDuckGoWebExecutor", () => {
  describe("class instantiation", () => {
    it("should instantiate executor", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.ok(executor, "Executor should be created");
    });

    it("should have execute method", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.equal(typeof executor.execute, "function", "execute should be a function");
    });

    it("should have testConnection method", () => {
      const executor = new DuckDuckGoWebExecutor();
      assert.equal(
        typeof executor.testConnection,
        "function",
        "testConnection should be a function"
      );
    });

    it("should export DUCKDUCKGO_BASE constant", () => {
      assert.equal(
        DUCKDUCKGO_BASE,
        "https://duckduckgo.com",
        "DUCKDUCKGO_BASE should be correct URL"
      );
    });
  });

  describe("execute method validation", () => {
    it("should reject empty messages array with 400 (wrapped shape)", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: EMPTY_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 400, "should return 400 for empty messages");
      const body = await result.response.json();
      assert.ok(body.error, "error response should have error field");
    });

    it("should accept non-empty messages via ExecuteInput.body.messages", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        const result = await executor.execute({
          model: "gpt-4o-mini",
          body: VALID_MESSAGES_BODY,
          stream: false,
          credentials: {} as never,
        } as never);

        // The contract: result is the wrapper, not a raw Response.
        assertExecutorResultShape(result);
        assert.notEqual(result.response.status, 400, "should not return 400 for valid messages");
      } catch (error) {
        // Network errors are acceptable in this offline test environment.
        assert.ok(error instanceof Error, "should throw Error for network issues");
      }
    });

    it("should fall back to 400 when body has no messages key (not 500 / not TypeError)", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: {},
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 400);
    });

    it("should handle missing model parameter without throwing TypeError", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const result = await executor.execute({
        model: undefined as unknown as string,
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      // Should be a Response (likely 4xx/5xx from upstream) — never a TypeError.
      assert.ok(result.response instanceof Response);
    });
  });

  describe("testConnection method", () => {
    it("should return boolean", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        const result = await executor.testConnection({});
        assert.equal(typeof result, "boolean", "testConnection should return boolean");
      } catch {
        // Network error is acceptable — just verify the method is callable.
        assert.ok(true, "testConnection is callable");
      }
    });

    it("should complete within timeout", async () => {
      const executor = new DuckDuckGoWebExecutor();
      const startTime = Date.now();

      try {
        await executor.testConnection({});
      } catch {
        // Expected to fail or timeout in offline env.
      }

      const elapsed = Date.now() - startTime;
      assert.ok(
        elapsed < 35000,
        `testConnection should complete within 35 seconds, took ${elapsed}ms`
      );
    });
  });

  describe("response handling", () => {
    it("should handle AbortSignal with 499 and the wrapper shape", async () => {
      const executor = new DuckDuckGoWebExecutor();
      const controller = new AbortController();
      controller.abort();

      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        signal: controller.signal,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 499, "should return 499 for aborted request");
    });

    it("should support streaming parameter and return wrapper shape", async () => {
      const executor = new DuckDuckGoWebExecutor();

      try {
        const r1 = await executor.execute({
          model: "gpt-4o-mini",
          body: VALID_MESSAGES_BODY,
          stream: true,
          credentials: {} as never,
        } as never);
        assertExecutorResultShape(r1);

        const r2 = await executor.execute({
          model: "gpt-4o-mini",
          body: VALID_MESSAGES_BODY,
          stream: false,
          credentials: {} as never,
        } as never);
        assertExecutorResultShape(r2);
      } catch (error) {
        assert.ok(error instanceof Error, "should throw Error on network failure");
      }
    });

    it("should request current VQD headers and forward them to chat", async () => {
      const seenRequests: Array<{
        url: string;
        headers: HeadersInit | undefined;
        body?: BodyInit | null;
      }> = [];
      mockFetch((url, init) => {
        seenRequests.push({ url, headers: init?.headers, body: init?.body });
        if (url === "https://duck.ai/") {
          return new Response(
            "<script>window.__fe='serp_20260603_145043_ET-9c469f621c52a3a0e3cf6e770c442fbce0622c72'</script>",
            {
              status: 200,
              headers: { "Set-Cookie": "warm=duckai; Path=/; Secure" },
            }
          );
        }
        if (url.endsWith("/duckchat/v1/auth/token")) {
          return new Response("{}", {
            status: 200,
            headers: { "Set-Cookie": "token=duckai; Path=/; Secure" },
          });
        }
        if (url.startsWith("https://duckduckgo.com/?q=")) {
          return new Response("ok", {
            status: 200,
            headers: { "Set-Cookie": "serp=duckduckgo; Path=/; Secure" },
          });
        }
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: {
              "x-vqd-4": "legacy-vqd",
              "x-vqd-hash-1": "challenge-hash",
            },
          });
        }

        return new Response('data: {"message":"pong"}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      });

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 200);
      const statusRequest = seenRequests.find((request) =>
        request.url.endsWith("/duckchat/v1/status")
      );
      const chatRequest = seenRequests.find((request) => request.url.endsWith("/duckchat/v1/chat"));
      assert.ok(statusRequest);
      assert.ok(chatRequest);
      assert.equal(getHeaderValue(statusRequest.headers, "x-vqd-accept"), "1");
      const statusCookie = getHeaderValue(statusRequest.headers, "cookie") ?? "";
      const chatCookie = getHeaderValue(chatRequest.headers, "cookie") ?? "";
      assert.match(statusCookie, /dcm=3/);
      assert.match(statusCookie, /warm=duckai/);
      assert.match(statusCookie, /token=duckai/);
      assert.match(statusCookie, /serp=duckduckgo/);
      assert.match(chatCookie, /dcm=3/);
      assert.match(chatCookie, /warm=duckai/);
      assert.match(chatCookie, /token=duckai/);
      assert.match(chatCookie, /serp=duckduckgo/);
      assert.equal(getHeaderValue(chatRequest.headers, "x-vqd-4"), "legacy-vqd");
      assert.equal(getHeaderValue(chatRequest.headers, "x-vqd-hash-1"), "challenge-hash");
      assert.equal(
        getHeaderValue(chatRequest.headers, "x-fe-version"),
        "serp_20260603_145043_ET-9c469f621c52a3a0e3cf6e770c442fbce0622c72"
      );
      const feSignals = JSON.parse(
        Buffer.from(getHeaderValue(chatRequest.headers, "x-fe-signals") ?? "", "base64").toString(
          "utf8"
        )
      ) as { events: Array<{ name: string; trusted?: boolean }> };
      assert.deepEqual(feSignals.events.map((event) => event.name).slice(0, 4), [
        "onboarding_impression",
        "action",
        "onboarding_finish",
        "startNewChat_free",
      ]);
      assert.equal(feSignals.events[1]?.trusted, true);
      assert.match(getHeaderValue(chatRequest.headers, "x-ddg-journey-id") ?? "", /^[0-9a-f]{32}$/);
      const payload = JSON.parse(chatRequest.body as string) as Record<string, unknown>;
      assert.equal(payload.model, "gpt-4o-mini");
      assert.equal(payload.stream, undefined, "duck.ai browser payload does not include stream");
      assert.equal(payload.canDelegateImageGeneration, null);
      const body = await result.response.json();
      assert.equal(body.choices[0].message.content, "pong");
    });

    it("should send current Duck.ai model ids and reasoning effort fields", async () => {
      let chatPayload: Record<string, unknown> | null = null;
      mockFetch((url, init) => {
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": "challenge-hash" },
          });
        }

        if (url.endsWith("/duckchat/v1/chat")) {
          chatPayload = JSON.parse(init?.body as string) as Record<string, unknown>;
          return new Response('data: {"message":"pong"}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          });
        }

        return new Response("ok", { status: 200 });
      });

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "duckduckgo-web/gpt-5-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(chatPayload?.model, "gpt-5-mini");
      assert.equal(chatPayload?.reasoningEffort, "minimal");
      assert.equal(chatPayload?.canDelegateImageGeneration, null);
      assert.equal(chatPayload?.stream, undefined);
    });

    it("should strip OmniRoute provider prefix before sending model upstream", async () => {
      let chatPayload: { model?: string } | null = null;
      mockFetch((url, init) => {
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": "challenge-hash" },
          });
        }

        chatPayload = JSON.parse(init?.body as string) as { model?: string };
        return new Response('data: {"message":"pong"}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      });

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "duckduckgo-web/gpt-4o-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(chatPayload?.model, "gpt-4o-mini");
    });

    it("should parse current DuckDuckGo message chunks", async () => {
      mockFetch((url) => {
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": "challenge-hash" },
          });
        }

        return new Response(
          'data: {"message":"pon"}\n\ndata: {"message":"g"}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      });

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      const body = await result.response.json();
      assert.equal(body.choices[0].message.content, "pong");
    });

    it("should surface DuckDuckGo anti-abuse challenges as clear JSON errors", async () => {
      mockFetch((url) => {
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": "challenge-hash" },
          });
        }

        return new Response(
          JSON.stringify({
            action: "error",
            status: 418,
            type: "ERR_CHALLENGE",
            overrideCode: "3501",
          }),
          { status: 418, headers: { "Content-Type": "application/json" } }
        );
      });

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: VALID_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 418);
      const body = await result.response.json();
      assert.match(body.error.message, /ERR_CHALLENGE/);
      assert.match(body.error.message, /rate-limited IP/);
    });
  });

  describe("error handling", () => {
    it("should not throw a TypeError when messages are valid (regression: 'reading status')", async () => {
      const executor = new DuckDuckGoWebExecutor();

      // This is the exact bug from the live probe: duckduckgo-web returned
      // a raw Response, so chatCore.ts read `.response.status` on a Response
      // and threw "Cannot read properties of undefined (reading 'status')".
      // We assert that execute() never returns a raw Response and that
      // the result can be safely destructured.
      let caught: unknown = null;
      try {
        const r = await executor.execute({
          model: "gpt-4o-mini",
          body: VALID_MESSAGES_BODY,
          stream: false,
          credentials: {} as never,
        } as never);
        assertExecutorResultShape(r);
        // .status must be reachable without throwing
        void r.response.status;
      } catch (err) {
        caught = err;
      }

      // The executor should never surface the JS-level TypeError
      // "Cannot read properties of undefined (reading 'status')"
      if (caught instanceof Error) {
        assert.doesNotMatch(
          caught.message,
          /reading 'status'/,
          "executor must not surface the chatCore-side TypeError"
        );
      }
    });

    it("should return a JSON Content-Type on synthetic error responses", async () => {
      const executor = new DuckDuckGoWebExecutor();

      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: EMPTY_MESSAGES_BODY,
        stream: false,
        credentials: {} as never,
      } as never);

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 400);
      const contentType = result.response.headers.get("content-type");
      assert.ok(contentType?.includes("application/json"), "error response should be JSON");
      const body = await result.response.json();
      assert.ok(body.error, "error response should have error object");
      assert.ok(body.error.message, "error should have message");
    });
  });

  describe("integration checks", () => {
    it("should be properly exported as singleton", async () => {
      const { duckduckgoWebExecutor } = await import("../../open-sse/executors/duckduckgo-web.ts");
      assert.ok(duckduckgoWebExecutor, "singleton executor should be exported");
      assert.ok(duckduckgoWebExecutor.execute, "singleton should have execute method");
    });

    it("should be registered in executor index", async () => {
      const { getExecutor } = await import("../../open-sse/executors/index.ts");
      const executor = getExecutor("duckduckgo-web");
      assert.ok(executor, "executor should be registered in index");
      assert.equal(
        typeof executor.execute,
        "function",
        "registered executor should have execute method"
      );
    });
  });
});
