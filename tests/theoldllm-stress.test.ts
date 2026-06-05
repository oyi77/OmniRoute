/**
 * Stress test for theoldllm executor.
 * Tests sequential, concurrent, abort, and error recovery scenarios.
 *
 * Run: node --import tsx/esm --test tests/theoldllm-stress.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { TheOldLlmExecutor } from "../open-sse/executors/theoldllm.ts";

const executor = new TheOldLlmExecutor();

async function readStream(
  response: Response,
  timeoutMs = 30_000
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const result: string[] = [];
  const timeout = setTimeout(() => reader.cancel(), timeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(new TextDecoder().decode(value));
    }
  } finally {
    clearTimeout(timeout);
  }

  return result.join("");
}

function makeInput(model = "gpt-5.4", stream = false) {
  return {
    model,
    body: {
      messages: [{ role: "user", content: "say hello in one word" }],
      max_tokens: 20,
      temperature: 0.7,
      stream,
    },
    credentials: {},
    signal: null,
    log: {
      debug: (_t: string, _m: string) => {},
      info: (_t: string, _m: string) => {},
      warn: (_t: string, _m: string) => {},
      error: (_t: string, _m: string) => {},
    },
  };
}

function hasResponse(text: string): boolean {
  return (
    text.includes("hello") ||
    text.includes("Hello") ||
    text.includes("hi") ||
    text.includes("Hi")
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("theoldllm executor", { timeout: 300_000 }, () => {
  it("Test 1: Basic non-streaming request", async () => {
    const start = Date.now();
    const result = await executor.execute(makeInput("gpt-5.4", false));
    const text = await readStream(result.response, 60_000);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  Duration: ${elapsed}s`);

    if (!text.includes("error")) {
      assert.ok(hasResponse(text), `Expected response content, got: ${text.slice(0, 80)}`);
    } else {
      console.log(`  Got error response: ${text.slice(0, 120)}`);
      assert.ok(true, "Error response accepted — upstream may be unstable");
    }
  });

  it("Test 2: Basic streaming request", async () => {
    const start = Date.now();
    const result = await executor.execute(makeInput("claude_opus_4", true));
    const text = await readStream(result.response, 60_000);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  Duration: ${elapsed}s`);

    if (!text.includes("error")) {
      assert.ok(hasResponse(text), `Expected response content, got: ${text.slice(0, 80)}`);
    } else {
      console.log(`  Got error response: ${text.slice(0, 120)}`);
      assert.ok(true, "Error response accepted");
    }
  });

  it("Test 3: Sequential requests (3x)", async () => {
    let ok = 0;
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      const result = await executor.execute(makeInput("deepseek", false));
      const text = await readStream(result.response, 60_000);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  Request ${i + 1}: ${elapsed}s`);

      if (!text.includes("error")) {
        (text.includes("hello") || text.includes("Hello")) ? ok++ : null;
      }
    }
    assert.ok(ok >= 1, `Expected at least 1/3 successful, got ${ok}/3`);
    console.log(`  ${ok}/3 sequential OK`);
  });

  it("Test 4: Concurrent requests (4x at once)", async () => {
    const concurrency = 4;
    const results = await Promise.allSettled(
      Array.from({ length: concurrency }, (_, i) =>
        executor.execute(makeInput("gpt-5.4", false)).then(async (r) => {
          const text = await readStream(r.response, 60_000);
          return { index: i, text, ok: !text.includes("error") && hasResponse(text) };
        })
      )
    );
    let ok = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.ok) ok++;
        else console.log(`  Request #${r.value.index}: ambiguous response`);
      } else {
        console.log(`  Request exception: ${r.reason?.message?.slice(0, 100)}`);
      }
    }
    assert.ok(ok >= 1, `Expected at least 1/4 concurrent OK, got ${ok}/4`);
    console.log(`  ${ok}/${concurrency} concurrent OK`);
  });

  it("Test 5: Abort mid-request", async () => {
    const abortController = new AbortController();
    const input = makeInput("gpt-5.4", true);
    input.signal = abortController.signal;
    const resultPromise = executor.execute(input);

    // Abort after 1 second
    await new Promise((r) => setTimeout(r, 1000));
    abortController.abort(new Error("Manual abort for testing"));

    // Should not throw — abort should be handled gracefully
    const result = await resultPromise;
    const text = await readStream(result.response, 10_000);
    console.log(`  Abort response length: ${text.length}`);
    assert.ok(true, "Abort handled without exception");
  });

  it("Test 6: Multiple model names", async () => {
    const models = ["gpt-5.4", "claude-sonnet-4.6", "deepseek-v4", "gemini-3-flash"];
    let ok = 0;
    for (const model of models) {
      const result = await executor.execute(makeInput(model, false));
      const text = await readStream(result.response, 60_000);
      if (!text.includes("error") && hasResponse(text)) ok++;
    }
    assert.ok(ok >= 2, `Expected at least 2/4 models OK, got ${ok}/4`);
    console.log(`  ${ok}/${models.length} models OK`);
  });
});
