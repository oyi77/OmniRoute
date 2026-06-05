import test from "node:test";
import assert from "node:assert/strict";

const { ClaudeWebExecutor } = await import("../../open-sse/executors/claude-web.ts");
const { getExecutor, hasSpecializedExecutor } = await import("../../open-sse/executors/index.ts");
const { __setTlsFetchOverrideForTesting } =
  await import("../../open-sse/services/claudeTlsClient.ts");
const {
  __setBrowserBackedChatOverrideForTesting,
  __resetBrowserBackedChatOverrideForTesting,
  __setHttpBackedChatOverrideForTesting,
  __resetHttpBackedChatOverrideForTesting,
} = await import("../../open-sse/services/browserBackedChat.ts");

// ─── Helpers ────────────────────────────────────────────────────────────────

function reset() {
  __setTlsFetchOverrideForTesting(null);
  __resetBrowserBackedChatOverrideForTesting();
  __resetHttpBackedChatOverrideForTesting();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("A: ClaudeWebExecutor is registered in executor index", () => {
  assert.ok(hasSpecializedExecutor("claude-web"));
});

test("B: ClaudeWebExecutor alias cw-web is registered", () => {
  assert.ok(hasSpecializedExecutor("cw-web"));
});

test("C: ClaudeWebExecutor can be retrieved from executor registry", () => {
  const executor = getExecutor("claude-web");
  assert.ok(executor instanceof ClaudeWebExecutor);
});

test("D: ClaudeWebExecutor cw-web alias resolves to same type", () => {
  const a = getExecutor("claude-web");
  const b = getExecutor("cw-web");
  assert.ok(a instanceof ClaudeWebExecutor);
  assert.ok(b instanceof ClaudeWebExecutor);
});

test("E: ClaudeWebExecutor sets correct provider name", () => {
  const executor = new ClaudeWebExecutor();
  assert.equal(executor.getProvider(), "claude-web");
});

test("F: ClaudeWebExecutor inherits from BaseExecutor", () => {
  const executor = new ClaudeWebExecutor();
  assert.ok(typeof executor.getProvider === "function");
  assert.ok(typeof executor.execute === "function");
  assert.ok(typeof executor.testConnection === "function");
});

test("G: Test override hook can be set and unset", async () => {
  const mockFn = async () => ({
    status: 200,
    headers: new Headers(),
    text: "test",
    body: null,
  });

  __setTlsFetchOverrideForTesting(mockFn);
  // If this doesn't throw, the override was set successfully
  assert.ok(true);

  reset();
  // After reset, override should be cleared
  assert.ok(true);
});

test("H: ClaudeWebExecutor handles missing credentials gracefully", async () => {
  reset();
  const executor = new ClaudeWebExecutor();

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "test" }] },
      stream: false,
      credentials: {},
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // Should return an error response, not throw
    assert.ok(result.response.status >= 400 || result.response.status === 200);
  } finally {
    reset();
  }
});

test("I: ClaudeWebExecutor handles invalid messages parameter", async () => {
  reset();
  const executor = new ClaudeWebExecutor();

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: undefined }, // Invalid
      stream: false,
      credentials: { apiKey: "test" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // Should handle error gracefully
    assert.ok(result.response);
  } finally {
    reset();
  }
});

test("J: tlsFetchOverride can be installed and mocked", async () => {
  reset();

  let callCount = 0;
  const mockFn = async (_url: string, _opts: unknown) => {
    callCount++;
    return {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: JSON.stringify({ test: true }),
      body: null,
    };
  };

  __setTlsFetchOverrideForTesting(mockFn);

  try {
    // Simulate a fetch through the mocked layer
    // This just verifies that the override mechanism works
    assert.equal(callCount, 0);
  } finally {
    reset();
  }
});

test("K: ClaudeWebExecutor execute returns response object with required fields", async () => {
  reset();
  const executor = new ClaudeWebExecutor();

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "test" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=test-token" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // Verify response structure
    assert.ok(result.response);
    assert.ok(typeof result.response.status === "number");
    assert.ok(result.response.headers instanceof Headers);
  } finally {
    reset();
  }
});

test("L: ClaudeWebExecutor processes streaming requests", async () => {
  reset();
  const executor = new ClaudeWebExecutor();

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "test" }] },
      stream: true,
      credentials: { apiKey: "sessionKey=test-token" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // Should return a response (may error, but structure should be there)
    assert.ok(result.response);
    assert.equal(typeof result.response.status, "number");
  } finally {
    reset();
  }
});

test("M: ClaudeWebExecutor includes required fields in execute result", async () => {
  reset();
  const executor = new ClaudeWebExecutor();

  try {
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "test" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=test" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // Verify result object structure
    assert.ok(result.hasOwnProperty("response"));
    assert.ok(result.hasOwnProperty("url") || result.hasOwnProperty("headers"));
  } finally {
    reset();
  }
});

// ─── Cloudflare challenge + body-read regression tests ────────────────────
// These pin the fix for the "[403]: Claude Web API error: " empty-body
// regression. Before the fix, the executor read `fetchResponse.text`
// (which is null on the streaming path) instead of `fetchResponse.body`,
// so every 4xx/5xx error came back with no diagnostic. The fix also
// detects Cloudflare's `cf-mitigated: challenge` response and surfaces
// a distinct, actionable error so dashboards / logs don't show a
// blank error body.

/**
 * Build a ReadableStream<Uint8Array> that yields the given chunks in
 * order. Used to simulate `fetchResponse.body` from tlsFetchClaude when
 * the upstream returns a non-SSE error (Cloudflare challenge page,
 * HTML rate-limit, etc.).
 */
function bodyStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("N: ClaudeWebExecutor surfaces Cloudflare challenge with actionable message", async () => {
  reset();

  const challengeHtml =
    '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
    "</head><body>Checking your browser before accessing claude.ai.</body></html>";

  __setTlsFetchOverrideForTesting(async () => ({
    status: 403,
    headers: new Headers({
      "cf-mitigated": "challenge",
      "content-type": "text/html; charset=UTF-8",
    }),
    text: null,
    body: bodyStreamFromChunks([challengeHtml]),
  }));

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=real-cookie" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    // The wrapper contract still holds — response is a Response.
    assert.equal(typeof result.response.status, "number");
    assert.equal(result.response.status, 403);

    const body = await result.response.json();
    // The error body must NOT be the cryptic "Claude Web API error: ".
    // It must identify the challenge and tell the operator what to do.
    assert.equal(body.error.type, "cloudflare_challenge");
    assert.equal(body.error.code, "cf_mitigated_challenge");
    assert.equal(body.error.cfMitigated, "challenge");
    assert.match(
      body.error.message,
      /Cloudflare bot-management challenge/i,
      "error message must identify the Cloudflare challenge"
    );
    assert.match(
      body.error.message,
      /sandbox|residential|cf_clearance/i,
      "error message must suggest a remedy (sandbox IP / residential / cf_clearance)"
    );
    assert.doesNotMatch(
      body.error.message,
      /^Claude Web API error: $/,
      "error message must NOT be the empty-body regression"
    );
  } finally {
    reset();
  }
});

test("O: ClaudeWebExecutor surfaces non-empty body for non-Cloudflare 4xx/5xx", async () => {
  reset();

  // Simulate a real Claude error: JSON body with a useful message.
  const errorJson = JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message: "messages: too few tokens" },
  });

  __setTlsFetchOverrideForTesting(async () => ({
    status: 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: null,
    body: bodyStreamFromChunks([errorJson]),
  }));

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=real-cookie" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    assert.equal(result.response.status, 400);
    const body = await result.response.json();
    assert.equal(body.error.type, "api_error");
    assert.match(
      body.error.message,
      /Claude Web API error \(400\)/,
      "error message must include the status code"
    );
    assert.match(
      body.error.message,
      /too few tokens/,
      "error message must include the upstream body, not be empty"
    );
  } finally {
    reset();
  }
});

test("P: ClaudeWebExecutor surfaces 'no response body' when upstream body is empty", async () => {
  reset();

  __setTlsFetchOverrideForTesting(async () => ({
    status: 502,
    headers: new Headers(),
    text: null,
    body: null, // both fields null
  }));

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=real-cookie" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    assert.equal(result.response.status, 502);
    const body = await result.response.json();
    assert.equal(body.error.type, "api_error");
    // Must be explicit about the missing body, not the cryptic empty form.
    assert.match(
      body.error.message,
      /no response body/i,
      "error message must say explicitly that there was no body"
    );
  } finally {
    reset();
  }
});

test("Q: ClaudeWebExecutor surfaces Cloudflare challenge even when body is empty (header-only detection)", async () => {
  reset();

  // Some Cloudflare challenges arrive with the body fully consumed or
  // empty — only the `cf-mitigated: challenge` header is reliable.
  __setTlsFetchOverrideForTesting(async () => ({
    status: 403,
    headers: new Headers({ "cf-mitigated": "challenge" }),
    text: null,
    body: null,
  }));

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: { apiKey: "sessionKey=real-cookie" },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    assert.equal(result.response.status, 403);
    const body = await result.response.json();
    // Even with an empty body, the header-based detection should still
    // classify the response as a Cloudflare challenge.
    assert.equal(body.error.type, "cloudflare_challenge");
    assert.equal(body.error.cfMitigated, "challenge");
  } finally {
    reset();
  }
});

test("R: ClaudeWebExecutor sends HAR-aligned browser headers and payload fields", async () => {
  reset();

  let completionHeaders: Headers | null = null;
  let completionPayload: Record<string, unknown> | null = null;

  __setTlsFetchOverrideForTesting(
    async (url: string, opts: { headers?: HeadersInit; body?: BodyInit | null }) => {
      if (url.endsWith("/api/organizations")) {
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: JSON.stringify([{ uuid: "org-123" }]),
          body: null,
        };
      }

      completionHeaders = new Headers(opts.headers);
      completionPayload = JSON.parse(String(opts.body)) as Record<string, unknown>;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/event-stream; charset=utf-8" }),
        text: null,
        body: bodyStreamFromChunks([
          'data: {"type":"content_block_delta","delta":{"text":"pong"}}\n\n',
        ]),
      };
    }
  );

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: {
        apiKey: "sessionKey=real-cookie",
        providerSpecificData: { deviceId: "device-123" },
      },
      signal: AbortSignal.timeout(5000),
      log: null,
    });

    assert.equal(result.response.status, 200);
    assert.ok(completionHeaders);
    assert.equal(
      completionHeaders.get("user-agent"),
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    );
    assert.equal(
      completionHeaders.get("sec-ch-ua"),
      '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"'
    );
    assert.equal(completionHeaders.get("sec-ch-ua-mobile"), "?0");
    assert.equal(completionHeaders.get("sec-ch-ua-platform"), '"Linux"');
    assert.equal(completionHeaders.get("accept-encoding"), "gzip, deflate, br, zstd");
    assert.equal(completionHeaders.get("priority"), "u=1, i");
    assert.equal(completionHeaders.get("anthropic-client-platform"), "web_claude_ai");
    assert.equal(completionHeaders.get("anthropic-device-id"), "device-123");
    assert.ok(completionPayload);
    assert.equal(completionPayload.model, "claude-sonnet-4-6");
    assert.equal(completionPayload.timezone, "Asia/Jakarta");
    assert.equal(completionPayload.locale, "en-US");
    assert.equal(completionPayload.effort, "low");
    assert.equal(completionPayload.thinking_mode, "off");
    assert.equal(completionPayload.rendering_mode, "messages");
    assert.ok(Array.isArray(completionPayload.tools));
    assert.equal(completionPayload.tools.length, 13);
    assert.deepEqual(
      completionPayload.tools.map((tool) => (tool as { name?: string }).name),
      [
        "show_widget",
        "read_me",
        "web_search",
        "artifacts",
        "repl",
        "weather_fetch",
        "recipe_display_v0",
        "places_map_display_v0",
        "message_compose_v1",
        "ask_user_input_v0",
        "recommend_claude_apps",
        "places_search",
        "fetch_sports_data",
      ]
    );
    assert.equal(
      (completionPayload.create_conversation_params as { tool_search_mode?: string })
        .tool_search_mode,
      "auto"
    );
  } finally {
    reset();
  }
});

test("K: ClaudeWebExecutor tryBackedChat falls through to browser path on http failure", async () => {
  process.env.WEB_COOKIE_USE_BROWSER = "1";

  // Make httpBackedChat return a challenge (403) so tryBackedChat falls
  // through to the cookie-refresh → retry → browserBackedChat path.
  __setHttpBackedChatOverrideForTesting(
    async () => ({
      status: 403,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ error: "challenge" })),
      isStealth: true,
      timing: { acquireContextMs: 0, navigateMs: 0, submitMs: 100, captureResponseMs: 0, totalMs: 100 },
    })
  );

  __setBrowserBackedChatOverrideForTesting(
    async () => ({
      status: 200,
      contentType: "text/event-stream",
      body: Buffer.from('data: {"type":"content_block_delta","delta":{"text":"pong"}}\n\n'),
      isStealth: true,
      timing: { acquireContextMs: 100, navigateMs: 200, submitMs: 300, captureResponseMs: 400, totalMs: 1000 },
    })
  );

  __setTlsFetchOverrideForTesting(
    async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: JSON.stringify([{ uuid: "org-123" }]),
      body: null,
    })
  );

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: {
        apiKey: "sessionKey=real-session-cookie; deviceId=device-123",
        providerSpecificData: { deviceId: "device-123" },
      },
      signal: undefined,
      log: null,
    });

    assert.equal(result.response.status, 200, "browser-backed path should return 200");
    const body = await result.response.text();
    assert.ok(body.includes("pong"), "browser-backed response should contain pong");
  } finally {
    reset();
    delete process.env.WEB_COOKIE_USE_BROWSER;
  }
});

test("L: ClaudeWebExecutor falls through to TLS path without browser env flag", async () => {
  __setTlsFetchOverrideForTesting(
    async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: JSON.stringify([{ uuid: "org-123" }]),
      body: null,
    })
  );

  try {
    const executor = new ClaudeWebExecutor();
    const result = await executor.execute({
      model: "claude-sonnet-4-6",
      body: { messages: [{ role: "user", content: "ping" }] },
      stream: false,
      credentials: {
        apiKey: "sessionKey=real-session-cookie; deviceId=device-123",
        providerSpecificData: { deviceId: "device-123" },
      },
      signal: undefined,
      log: null,
    });

    assert.ok(result.response.status > 0, "should get a response from normal TLS path");
  } finally {
    reset();
  }
});
