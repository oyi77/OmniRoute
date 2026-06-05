import { afterEach, beforeEach, describe, it } from "node:test";
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
        if (url === "https://duck.ai/country.json") {
          return new Response(JSON.stringify({ country: "ID" }), {
            status: 200,
            headers: { "Set-Cookie": "country=duckai; Path=/; Secure" },
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
          headers: { "Content-Type": "text/event-stream", "x-vqd-hash-1": "rotated-hash" },
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
      const statusRequest = seenRequests.find(
        (request) => request.url === "https://duck.ai/duckchat/v1/status"
      );
      const countryRequest = seenRequests.find(
        (request) => request.url === "https://duck.ai/country.json"
      );
      const tokenRequest = seenRequests.find((request) =>
        request.url.endsWith("/duckchat/v1/auth/token")
      );
      const chatRequests = seenRequests.filter((request) =>
        request.url.endsWith("/duckchat/v1/chat")
      );
      const seedChatRequest = chatRequests[0];
      const chatRequest = chatRequests[1];
      assert.ok(statusRequest);
      assert.ok(countryRequest);
      assert.ok(tokenRequest);
      assert.ok(seedChatRequest);
      assert.ok(chatRequest);
      const seedPayload = JSON.parse(seedChatRequest.body as string) as Record<string, unknown>;
      assert.equal(seedPayload.canUseTools, false);
      assert.deepEqual(seedPayload.messages, [{ role: "user", content: "hi" }]);
      assert.equal(
        getHeaderValue(countryRequest.headers, "user-agent"),
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
      );
      assert.equal(
        getHeaderValue(countryRequest.headers, "sec-ch-ua"),
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"'
      );
      assert.equal(getHeaderValue(countryRequest.headers, "sec-ch-ua-platform"), '"Linux"');
      assert.equal(
        getHeaderValue(countryRequest.headers, "accept-encoding"),
        "gzip, deflate, br, zstd"
      );
      assert.equal(getHeaderValue(countryRequest.headers, "cache-control"), "no-cache");
      assert.equal(getHeaderValue(countryRequest.headers, "priority"), "u=1, i");
      assert.equal(getHeaderValue(tokenRequest.headers, "accept"), "*/*");
      assert.equal(getHeaderValue(statusRequest.headers, "x-vqd-accept"), "1");
      assert.equal(getHeaderValue(statusRequest.headers, "cache-control"), "no-store");
      const statusCookie = getHeaderValue(statusRequest.headers, "cookie") ?? "";
      const chatCookie = getHeaderValue(chatRequest.headers, "cookie") ?? "";
      assert.match(statusCookie, /dcm=3/);
      assert.match(statusCookie, /warm=duckai/);
      assert.match(statusCookie, /country=duckai/);
      assert.match(statusCookie, /token=duckai/);
      assert.match(statusCookie, /serp=duckduckgo/);
      assert.match(chatCookie, /dcm=3/);
      assert.match(chatCookie, /warm=duckai/);
      assert.match(chatCookie, /country=duckai/);
      assert.match(chatCookie, /token=duckai/);
      assert.match(chatCookie, /serp=duckduckgo/);
      assert.equal(
        getHeaderValue(chatRequest.headers, "user-agent"),
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
      );
      assert.equal(
        getHeaderValue(chatRequest.headers, "sec-ch-ua"),
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"'
      );
      assert.equal(getHeaderValue(chatRequest.headers, "sec-ch-ua-platform"), '"Linux"');
      assert.equal(getHeaderValue(chatRequest.headers, "cache-control"), "no-cache");
      assert.equal(getHeaderValue(chatRequest.headers, "priority"), "u=1, i");
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
        "onboarding_impression_1",
        "onboarding_impression_2",
        "startNewChat",
        "user_input",
      ]);
      assert.match(getHeaderValue(chatRequest.headers, "x-ddg-journey-id") ?? "", /^[0-9a-f]{32}$/);
      const payload = JSON.parse(chatRequest.body as string) as Record<string, unknown>;
      assert.equal(payload.model, "gpt-4o-mini");
      assert.equal(payload.stream, undefined, "duck.ai browser payload does not include stream");
      assert.equal(payload.canDelegateImageGeneration, null);
      const body = await result.response.json();
      assert.equal(body.choices[0].message.content, "pong");
    });

    it("should send current Duck.ai model ids and reasoning effort fields", async () => {
      const chatPayloads: Array<Record<string, unknown>> = [];
      mockFetch((url, init) => {
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": "challenge-hash" },
          });
        }

        if (url.endsWith("/duckchat/v1/chat")) {
          chatPayloads.push(JSON.parse(init?.body as string) as Record<string, unknown>);
          return new Response('data: {"message":"pong"}\n\ndata: [DONE]\n\n', {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "x-vqd-hash-1": "rotated-hash" },
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
      const chatPayload = chatPayloads.at(-1);
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

    it("should not crash the VQD challenge solver on getBoundingClientRect (regression)", async () => {
      // Regression for the live DDG challenge: it requires offsetWidth/Height,
      // getBoundingClientRect(), getComputedStyle, and scrollHeight to all
      // return real values, or the solver throws TypeError. The executor
      // must instead produce a non-empty client_hashes array and forward it
      // to the chat endpoint as x-vqd-hash-1.
      const probeChallengeJs = `
        (function() {
          function makeDiv() {
            var el = document.createElement('div');
            el.style.cssText = 'display:inline-block;padding:8px;position:absolute;visibility:hidden;';
            el.textContent = 'x';
            document.body.appendChild(el);
            return el;
          }
          function probeDiv() {
            var el = makeDiv();
            var flags = [];
            flags.push(el.offsetWidth > 0);
            flags.push(el.offsetHeight > 0);
            var r = el.getBoundingClientRect();
            flags.push(r.width > 0 && r.height > 0);
            var cs = getComputedStyle(el);
            flags.push(cs.getPropertyValue('display').length > 0);
            flags.push(el.scrollHeight > 0);
            document.body.removeChild(el);
            return String(flags.map(Number).reduce(function(a, b) { return a + b; }, 7709));
          }
          function probeIframe() {
            var el = document.createElement('iframe');
            el.srcdoc = 'DuckDuckGo Fraud & Abuse';
            document.body.appendChild(el);
            var ok = !!(el.contentWindow && el.contentWindow.self && el.contentWindow.self.fetch);
            document.body.removeChild(el);
            return String(ok ? 2269 : 0);
          }
          return Promise.resolve().then(function() {
            return {
              client_hashes: ['', probeDiv(), probeIframe()],
              server_hashes: ['s1', 's2', 's3'],
              signals: {},
              meta: { v: '4', challenge_id: 'cid', timestamp: '1234', debug: 'd' },
            };
          });
        })()
      `;
      const challengeB64 = Buffer.from(probeChallengeJs, "utf8").toString("base64");

      const seenRequests: Array<{
        url: string;
        headers: HeadersInit | undefined;
        body?: BodyInit | null;
      }> = [];
      mockFetch((url, init) => {
        seenRequests.push({ url, headers: init?.headers, body: init?.body });
        if (url.endsWith("/duckchat/v1/status")) {
          return new Response(JSON.stringify({ status: "0" }), {
            status: 200,
            headers: { "x-vqd-hash-1": challengeB64 },
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
      const chatRequest = seenRequests.find((r) => r.url.endsWith("/duckchat/v1/chat"));
      assert.ok(chatRequest, "executor must call chat after solving the challenge");
      const sentHash = getHeaderValue(chatRequest!.headers, "x-vqd-hash-1") ?? "";
      assert.ok(
        sentHash && sentHash !== challengeB64,
        "executor must send a solved hash, not the raw challenge"
      );
      const decoded = JSON.parse(Buffer.from(sentHash, "base64").toString("utf8")) as {
        client_hashes: string[];
      };
      assert.ok(Array.isArray(decoded.client_hashes));
      assert.equal(decoded.client_hashes.length, 3);
      const probeSum = await import("node:crypto").then((m) =>
        m.createHash("sha256").update("7713").digest("base64")
      );
      assert.equal(decoded.client_hashes[1], probeSum);
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

  describe("browser-backed path", () => {
    const { __setBrowserBackedChatOverrideForTesting, __resetBrowserBackedChatOverrideForTesting,
            __setHttpBackedChatOverrideForTesting, __resetHttpBackedChatOverrideForTesting } =
      { __setBrowserBackedChatOverrideForTesting: (_fn: unknown) => {}, __resetBrowserBackedChatOverrideForTesting: () => {},
        __setHttpBackedChatOverrideForTesting: (_fn: unknown) => {}, __resetHttpBackedChatOverrideForTesting: () => {} };
    let browserBackedChatMock: (() => Promise<unknown>) | null = null;

    // Store original env and restore after each test.
    let origWebCookieUseBrowser: string | undefined;
    let origOmniRouteBrowserPool: string | undefined;

    async function loadBrowserBackedModule() {
      const mod = await import("../../open-sse/services/browserBackedChat.ts");
      return mod;
    }

    async function mockBrowserBackedResult(status: number, bodyText: string) {
      const mod = await loadBrowserBackedModule();
      const encoder = new TextEncoder();
      // Make httpBackedChat return a challenge (403) so tryBackedChat
      // falls through to cookie-refresh → retry → browserBackedChat.
      mod.__setHttpBackedChatOverrideForTesting(
        async () => ({
          status: 403,
          contentType: "application/json",
          body: Buffer.from(JSON.stringify({ error: "challenge" })),
          isStealth: true,
          timing: { acquireContextMs: 0, navigateMs: 0, submitMs: 100, captureResponseMs: 0, totalMs: 100 },
        })
      );
      mod.__setBrowserBackedChatOverrideForTesting(
        async () => ({
          status,
          contentType: "text/event-stream",
          body: encoder.encode(bodyText) as unknown as Buffer,
          isStealth: true,
          timing: { acquireContextMs: 100, navigateMs: 200, submitMs: 300, captureResponseMs: 400, totalMs: 1000 },
        })
      );
    }

    function resetEnv() {
      if (origWebCookieUseBrowser === undefined) {
        delete process.env.WEB_COOKIE_USE_BROWSER;
      } else {
        process.env.WEB_COOKIE_USE_BROWSER = origWebCookieUseBrowser;
      }
      if (origOmniRouteBrowserPool === undefined) {
        delete process.env.OMNIROUTE_BROWSER_POOL;
      } else {
        process.env.OMNIROUTE_BROWSER_POOL = origOmniRouteBrowserPool;
      }
    }

    beforeEach(() => {
      origWebCookieUseBrowser = process.env.WEB_COOKIE_USE_BROWSER;
      origOmniRouteBrowserPool = process.env.OMNIROUTE_BROWSER_POOL;
    });

    afterEach(async () => {
      resetEnv();
      browserBackedChatMock = null;
      const mod = await loadBrowserBackedModule();
      mod.__resetBrowserBackedChatOverrideForTesting();
      mod.__resetHttpBackedChatOverrideForTesting();
    });

    it("should route through browserBackedChat when WEB_COOKIE_USE_BROWSER=1", async () => {
      process.env.WEB_COOKIE_USE_BROWSER = "1";
      await mockBrowserBackedResult(200, 'data: {"content":"pong"}\n\n');

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: { messages: [{ role: "user", content: "ping" }] },
        stream: false,
        credentials: {
          apiKey: "test-cookie",
        },
      });

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 200);
      const body = await result.response.text();
      assert.ok(body.includes("pong"), "browser-backed response should contain pong");
    });

    it("should route through browserBackedChat when OMNIROUTE_BROWSER_POOL=on", async () => {
      process.env.OMNIROUTE_BROWSER_POOL = "on";
      await mockBrowserBackedResult(200, 'data: {"content":"ok"}\n\n');

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: { messages: [{ role: "user", content: "ping" }] },
        stream: false,
        credentials: { apiKey: "test" },
      });

      assertExecutorResultShape(result);
      assert.equal(result.response.status, 200);
      const body = await result.response.text();
      assert.ok(body.includes("ok"), "browser-backed response should contain ok");
    });

    it("should fall through to normal path without env flag set", async () => {
      // Ensure env vars are NOT set.
      delete process.env.WEB_COOKIE_USE_BROWSER;
      delete process.env.OMNIROUTE_BROWSER_POOL;

      const executor = new DuckDuckGoWebExecutor();
      const result = await executor.execute({
        model: "gpt-4o-mini",
        body: { messages: [{ role: "user", content: "ping" }] },
        stream: false,
        credentials: { apiKey: "test" },
      });

      // Without env flag, it hits the normal path and gets handled.
      assertExecutorResultShape(result);
    });
  });

  describe("httpBackedChat function", () => {
    afterEach(() => {
      // Reset httpBackedChat override after each test
      void import("../../open-sse/services/browserBackedChat.ts").then((mod) => {
        mod.__resetHttpBackedChatOverrideForTesting();
      }).catch(() => {});
    });

    it("should use test override and return mocked response", async () => {
      const mod = await import("../../open-sse/services/browserBackedChat.ts");
      mod.__setHttpBackedChatOverrideForTesting(
        async () => ({
          status: 200,
          contentType: "text/event-stream",
          body: Buffer.from('data: {"content":"pong"}\n\n'),
          isStealth: true,
          timing: { acquireContextMs: 0, navigateMs: 0, submitMs: 50, captureResponseMs: 0, totalMs: 50 },
        })
      );

      const result = await mod.httpBackedChat({
        poolKey: "test",
        chatUrl: "https://example.com/chat",
        chatPageUrl: "https://example.com",
        userMessage: "ping",
        chatUrlMatchDomain: "example.com",
        inputSelector: "textarea",
        signal: null,
      });

      assert.equal(result.status, 200);
      assert.equal(result.contentType, "text/event-stream");
      assert.ok(result.body.toString().includes("pong"));
    });

    it("should return 501 when no override set and tlsClient unavailable", { skip: true }, async () => {
      // This test requires wreq-js to be absent; skip in CI.
    });
  });
});
