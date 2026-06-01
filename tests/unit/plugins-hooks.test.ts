import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  registerHook,
  unregisterHooks,
  unregisterHook,
  emitHook,
  emitHookBlocking,
  runOnRequest,
  runOnResponse,
  runOnError,
  getHooks,
  getActiveEvents,
  resetHooks,
  BUILTIN_EVENTS,
} from "../../src/lib/plugins/hooks.ts";

beforeEach(() => {
  resetHooks();
});

describe("BUILTIN_EVENTS", () => {
  it("contains all 10 events", () => {
    assert.equal(BUILTIN_EVENTS.length, 10);
    assert.ok(BUILTIN_EVENTS.includes("onRequest"));
    assert.ok(BUILTIN_EVENTS.includes("onResponse"));
    assert.ok(BUILTIN_EVENTS.includes("onError"));
    assert.ok(BUILTIN_EVENTS.includes("onModelSelect"));
    assert.ok(BUILTIN_EVENTS.includes("onComboResolve"));
    assert.ok(BUILTIN_EVENTS.includes("onRateLimit"));
    assert.ok(BUILTIN_EVENTS.includes("onQuotaExhaust"));
    assert.ok(BUILTIN_EVENTS.includes("onProviderError"));
    assert.ok(BUILTIN_EVENTS.includes("onStreamStart"));
    assert.ok(BUILTIN_EVENTS.includes("onStreamEnd"));
  });
});

describe("registerHook", () => {
  it("registers a handler", () => {
    registerHook("onRequest", "p1", () => {});
    const hooks = getHooks("onRequest");
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].pluginName, "p1");
  });

  it("sorts by priority", () => {
    registerHook("onRequest", "low", () => {}, 200);
    registerHook("onRequest", "high", () => {}, 10);
    registerHook("onRequest", "mid", () => {}, 100);
    const hooks = getHooks("onRequest");
    assert.equal(hooks[0].pluginName, "high");
    assert.equal(hooks[1].pluginName, "mid");
    assert.equal(hooks[2].pluginName, "low");
  });

  it("prevents duplicate registration", () => {
    const handler = () => {};
    registerHook("onRequest", "p1", handler);
    registerHook("onRequest", "p1", handler);
    assert.equal(getHooks("onRequest").length, 1);
  });

  it("allows same plugin with different handlers", () => {
    registerHook("onRequest", "p1", () => {});
    registerHook("onRequest", "p1", () => {});
    assert.equal(getHooks("onRequest").length, 2);
  });
});

describe("unregisterHooks", () => {
  it("removes all handlers for a plugin", () => {
    registerHook("onRequest", "p1", () => {});
    registerHook("onResponse", "p1", () => {});
    registerHook("onRequest", "p2", () => {});
    unregisterHooks("p1");
    assert.equal(getHooks("onRequest").length, 1);
    assert.equal(getHooks("onResponse").length, 0);
    assert.equal(getHooks("onRequest")[0].pluginName, "p2");
  });

  it("no-op for unknown plugin", () => {
    registerHook("onRequest", "p1", () => {});
    unregisterHooks("unknown");
    assert.equal(getHooks("onRequest").length, 1);
  });
});

describe("unregisterHook", () => {
  it("removes specific event handler", () => {
    registerHook("onRequest", "p1", () => {});
    registerHook("onResponse", "p1", () => {});
    unregisterHook("onRequest", "p1");
    assert.equal(getHooks("onRequest").length, 0);
    assert.equal(getHooks("onResponse").length, 1);
  });
});

describe("emitHook", () => {
  it("calls all handlers", async () => {
    const calls: string[] = [];
    registerHook("onRequest", "p1", () => { calls.push("p1"); });
    registerHook("onRequest", "p2", () => { calls.push("p2"); });
    await emitHook("onRequest", {});
    assert.deepEqual(calls, ["p1", "p2"]);
  });

  it("swallows handler errors", async () => {
    registerHook("onRequest", "p1", () => { throw new Error("boom"); });
    registerHook("onRequest", "p2", () => {});
    await emitHook("onRequest", {}); // should not throw
  });

  it("supports async handlers", async () => {
    const calls: string[] = [];
    registerHook("onRequest", "p1", async () => { calls.push("async"); });
    await emitHook("onRequest", {});
    assert.deepEqual(calls, ["async"]);
  });

  it("no-op for unregistered event", async () => {
    await emitHook("nonexistent", {}); // should not throw
  });
});

describe("emitHookBlocking", () => {
  it("chains body/metadata through handlers", async () => {
    registerHook("onRequest", "p1", (payload: any) => ({
      body: { ...payload.body, added: true },
      metadata: { p1: true },
    }));
    registerHook("onRequest", "p2", (payload: any) => ({
      metadata: { p2: true },
    }));
    const result = await emitHookBlocking("onRequest", { body: { original: true }, metadata: {} });
    assert.equal(result.blocked, undefined);
    assert.deepEqual(result.body, { original: true, added: true });
    assert.deepEqual(result.metadata, { p1: true, p2: true });
  });

  it("returns early on blocked", async () => {
    registerHook("onRequest", "p1", () => ({ blocked: true, response: { error: "denied" } }));
    registerHook("onRequest", "p2", () => ({ metadata: { p2: true } }));
    const result = await emitHookBlocking("onRequest", {});
    assert.equal(result.blocked, true);
  });

  it("swallows handler errors", async () => {
    registerHook("onRequest", "p1", () => { throw new Error("boom"); });
    const result = await emitHookBlocking("onRequest", {});
    assert.equal(result.blocked, undefined);
  });
});

describe("runOnRequest", () => {
  it("delegates to emitHookBlocking", async () => {
    registerHook("onRequest", "p1", () => ({ metadata: { ran: true } }));
    const result = await runOnRequest({ requestId: "r1", body: {}, model: "m", metadata: {} } as any);
    assert.equal(result.blocked, undefined);
    assert.deepEqual(result.metadata, { ran: true });
  });
});

describe("runOnResponse", () => {
  it("chains response through plugins", async () => {
    registerHook("onResponse", "p1", (payload: any) => ({ response: { ...payload.response, p1: true } }));
    registerHook("onResponse", "p2", (payload: any) => ({ response: { ...payload.response, p2: true } }));
    const result = await runOnResponse({} as any, { original: true });
    assert.deepEqual(result, { original: true, p1: true, p2: true });
  });

  it("returns original if no plugins modify", async () => {
    registerHook("onResponse", "p1", () => {});
    const result = await runOnResponse({} as any, { original: true });
    assert.deepEqual(result, { original: true });
  });
});

describe("runOnError", () => {
  it("calls error handlers", async () => {
    const calls: string[] = [];
    registerHook("onError", "p1", () => { calls.push("err"); });
    await runOnError({} as any, new Error("test"));
    assert.deepEqual(calls, ["err"]);
  });

  it("swallows handler errors", async () => {
    registerHook("onError", "p1", () => { throw new Error("boom"); });
    await runOnError({} as any, new Error("test")); // should not throw
  });
});

describe("getHooks / getActiveEvents", () => {
  it("getHooks returns empty for unregistered event", () => {
    assert.deepEqual(getHooks("nonexistent"), []);
  });

  it("getActiveEvents returns events with handlers", () => {
    registerHook("onRequest", "p1", () => {});
    registerHook("onError", "p1", () => {});
    const events = getActiveEvents();
    assert.ok(events.includes("onRequest"));
    assert.ok(events.includes("onError"));
    assert.ok(!events.includes("onResponse"));
  });
});

describe("resetHooks", () => {
  it("clears all hooks", () => {
    registerHook("onRequest", "p1", () => {});
    registerHook("onResponse", "p2", () => {});
    resetHooks();
    assert.deepEqual(getHooks("onRequest"), []);
    assert.deepEqual(getHooks("onResponse"), []);
    assert.deepEqual(getActiveEvents(), []);
  });
});
