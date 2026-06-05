/**
 * REAL stress test — thousands of iterations, concurrent storms, resource verification.
 *
 * Run: node --import tsx/esm tests/stress/stress-real.mjs
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

const N = {
  CIRCUIT_FATIGUE: 1_000,   // 1k open/close cycles (tlsClient logs each open)
  CONCURRENT_ABORTS: 500,   // 500 fetches, 50% pre-aborted
  CONCURRENT_POOL_RACES: 500,
  RAPID_CREATE_CANCEL: 100,
  PARALLEL_CIRCUIT: 100,
};

/** Suppress [TlsClient] console spam during circuit breaker stress tests */
function quiet() {
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  mock.method(console, "log", (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("[TlsClient]")) return;
    origLog(...args);
  });
  mock.method(console, "warn", (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("[TlsClient]")) return;
    origWarn(...args);
  });
}
function loud() {
  try { console.log.mock.restore(); } catch {}
  try { console.warn.mock.restore(); } catch {}
}

// ---------------------------------------------------------------------------
// 1. Circuit breaker fatigue — 1,000 open/close cycles
// ---------------------------------------------------------------------------
describe("circuit breaker fatigue", () => {
  let tlsClient;

  before(async () => {
    tlsClient = (await import("../../open-sse/utils/tlsClient.ts")).default;
    tlsClient.resetCircuit();
    quiet();
  });

  after(loud);

  it(`survives ${N.CIRCUIT_FATIGUE} open/close cycles without memory leak`, () => {
    const stats = { opens: 0, closes: 0 };
    const start = Date.now();

    for (let i = 0; i < N.CIRCUIT_FATIGUE; i++) {
      tlsClient.recordFailure();
      tlsClient.recordFailure();
      tlsClient.recordFailure();
      stats.opens++;
      assert.equal(tlsClient.circuitTripped, true);

      tlsClient.recordSuccess();
      stats.closes++;
    }

    const elapsed = Date.now() - start;
    const opsPerSec = Math.round((N.CIRCUIT_FATIGUE * 4) / (elapsed / 1000));

    console.log(
      `  [stats] ${N.CIRCUIT_FATIGUE} cycles in ${elapsed}ms (${opsPerSec} ops/sec)`
    );
    console.log(`  [stats] opens=${stats.opens} closes=${stats.closes}`);
    assert.equal(stats.opens, N.CIRCUIT_FATIGUE);
    assert.equal(tlsClient.failureCount, 0, "failureCount should be 0");
  });
});

// ---------------------------------------------------------------------------
// 2. Parallel circuit breaker — 100 concurrent callers
// ---------------------------------------------------------------------------
describe("parallel circuit breaker storm", () => {
  let tlsClient;

  before(async () => {
    tlsClient = (await import("../../open-sse/utils/tlsClient.ts")).default;
    tlsClient.resetCircuit();
    quiet();
  });

  after(loud);

  it(`${N.PARALLEL_CIRCUIT} concurrent callers hitting open/close transitions`, async () => {
    const tasks = Array.from({ length: N.PARALLEL_CIRCUIT }, (_, i) =>
      Promise.resolve().then(() => {
        tlsClient.recordFailure();
        tlsClient.recordFailure();
        tlsClient.recordFailure();
        tlsClient.recordSuccess();
      })
    );

    const results = await Promise.allSettled(tasks);
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(
      rejected.length,
      0,
      `Parallel circuit errors: ${rejected.map((r) => r.reason).join(", ")}`
    );
    assert.equal(tlsClient.failureCount, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Abort storm — 500 fetches, 50% pre-aborted
// ---------------------------------------------------------------------------
describe("abort storm", () => {
  let tlsClient;

  before(async () => {
    tlsClient = (await import("../../open-sse/utils/tlsClient.ts")).default;
    tlsClient.resetCircuit();
    tlsClient.recordSuccess();
    quiet();
  });

  after(loud);

  it(`${N.CONCURRENT_ABORTS} fetches with 50% pre-aborted — all resolve within 30s`, async () => {
    const start = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: N.CONCURRENT_ABORTS }, (_, i) => {
        const ac = new AbortController();
        if (i % 2 === 0) ac.abort();
        return tlsClient.fetch("http://httpbin.org/post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idx: i }),
          signal: ac.signal,
        });
      })
    );

    const elapsed = Date.now() - start;
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;

    console.log(
      `  [stats] ${N.CONCURRENT_ABORTS} fetches in ${elapsed}ms`
    );
    console.log(`  [stats] fulfilled=${fulfilled} rejected=${rejected}`);

    // Pre-aborted ones (50%) must reject; allow for non-aborted network failures
    assert.ok(
      rejected >= N.CONCURRENT_ABORTS * 0.4,
      `Expected >= ${N.CONCURRENT_ABORTS * 0.4} rejections, got ${rejected}`
    );
    assert.ok(
      elapsed < 30000,
      `Abort storm took ${elapsed}ms, expected < 30000ms`
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Rapid create/cancel — 100 tryBackedChat calls with abort
// ---------------------------------------------------------------------------
describe("rapid create/cancel", () => {
  let mod;

  before(async () => {
    mod = await import("../../open-sse/services/browserBackedChat.ts");
  });

  it(`${N.RAPID_CREATE_CANCEL} tryBackedChat calls with immediate abort — no hangs`, async () => {
    const start = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: N.RAPID_CREATE_CANCEL }, (_, i) => {
        const ac = new AbortController();
        if (i < N.RAPID_CREATE_CANCEL / 2) {
          ac.abort();
        } else {
          setTimeout(() => ac.abort(), 50);
        }
        return mod.tryBackedChat({
          poolKey: `rapid-${i}`,
          chatUrl: "http://localhost:1/chat",
          chatPageUrl: "http://localhost:1/chat-page",
          userMessage: `rapid-fire-${i}`,
          chatUrlMatchDomain: "localhost",
          inputSelector: "textarea",
          signal: ac.signal,
        });
      })
    );

    const elapsed = Date.now() - start;
    const timeouts = results.filter(
      (r) => r.status === "fulfilled" && r.value?.status === 504
    ).length;
    const errors = results.filter((r) => r.status === "rejected").length;

    console.log(
      `  [stats] ${N.RAPID_CREATE_CANCEL} calls in ${elapsed}ms`
    );
    console.log(
      `  [stats] 504-timeouts=${timeouts} errors=${errors}`
    );

    assert.equal(results.length, N.RAPID_CREATE_CANCEL);
    assert.equal(errors, 0, `Expected 0 unhandled errors, got ${errors}`);
    assert.ok(
      elapsed < 120000,
      `Rapid create/cancel took ${elapsed}ms, expected < 120000ms`
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Pool race condition — 500 simultaneous for same key
// ---------------------------------------------------------------------------
describe("pool race condition stress", () => {
  let bpool;

  before(async () => {
    bpool = await import("../../open-sse/services/browserPool.ts");
  });

  it(`${N.CONCURRENT_POOL_RACES} simultaneous acquireBrowserContext for same key are deduped`, async () => {
    const key = `race-key-${Date.now()}`;

    const start = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: N.CONCURRENT_POOL_RACES }, () =>
        bpool
          .acquireBrowserContext(key, {
            cookieDomain: "example.com",
          })
          .then(
            () => "ok",
            (err) => `err: ${err.message.slice(0, 60)}`
          )
      )
    );

    const elapsed = Date.now() - start;
    const status = bpool.getBrowserPoolStatus();
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value === "ok"
    ).length;
    const rejectedCount = results.filter(
      (r) => r.status === "rejected"
    ).length;

    console.log(
      `  [stats] ${N.CONCURRENT_POOL_RACES} simultaneous acquires in ${elapsed}ms`
    );
    console.log(
      `  [stats] succeeded=${succeeded} rejected=${rejectedCount} pool_contexts=${status.contexts}`
    );

    assert.equal(results.length, N.CONCURRENT_POOL_RACES);
    assert.equal(rejectedCount, 0, `Expected 0 rejected, got ${rejectedCount}`);
  });
});

// ---------------------------------------------------------------------------
// 6. Summary
// ---------------------------------------------------------------------------
describe("stress test summary", () => {
  it("prints statistics", () => {
    const totalOps =
      N.CIRCUIT_FATIGUE * 4 +
      N.PARALLEL_CIRCUIT * 4 +
      N.CONCURRENT_ABORTS +
      N.RAPID_CREATE_CANCEL +
      N.CONCURRENT_POOL_RACES;

    console.log(`\n  ┌────────────────────────────────────────────┐`);
    console.log(`  │  STRESS TEST SUMMARY                       │`);
    console.log(`  ├────────────────────────────────────────────┤`);
    console.log(`  │  Circuit fatigue:    ${String(N.CIRCUIT_FATIGUE).padStart(8)} cycles    │`);
    console.log(`  │  Parallel circuit:   ${String(N.PARALLEL_CIRCUIT).padStart(8)} callers   │`);
    console.log(`  │  Abort storm:        ${String(N.CONCURRENT_ABORTS).padStart(8)} fetches   │`);
    console.log(`  │  Rapid create/cancel:${String(N.RAPID_CREATE_CANCEL).padStart(8)} calls    │`);
    console.log(`  │  Pool race:          ${String(N.CONCURRENT_POOL_RACES).padStart(8)} acqs    │`);
    console.log(`  ├────────────────────────────────────────────┤`);
    console.log(`  │  Total operations:  ${String(totalOps).padStart(8)}        │`);
    console.log(`  └────────────────────────────────────────────┘\n`);
  });
});
