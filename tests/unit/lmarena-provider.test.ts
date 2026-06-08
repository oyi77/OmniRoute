/**
 * LMArena Provider — Unit Tests (Phase 2A of issue #3368)
 *
 * Run: node --import tsx/esm --test tests/unit/lmarena-provider.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WEB_COOKIE_PROVIDERS } from "../../src/shared/constants/providers.ts";
import {
  getWebSessionCredentialRequirement,
  requiresWebSessionCredential,
  hasUsableWebSessionCredential,
} from "../../src/shared/providers/webSessionCredentials.ts";
import { LMArenaExecutor } from "../../open-sse/executors/lmarena.ts";

describe("LMArena Provider Definition", () => {
  it("is registered in WEB_COOKIE_PROVIDERS", () => {
    assert.ok(WEB_COOKIE_PROVIDERS.lmarena, "lmarena should be in WEB_COOKIE_PROVIDERS");
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.id, "lmarena");
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.alias, "lma");
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.name, "LMArena (Free)");
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.website, "https://lmarena.ai");
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.hasFree, true);
    assert.equal(WEB_COOKIE_PROVIDERS.lmarena.riskNoticeVariant, "webCookie");
  });

  it("has correct metadata", () => {
    const provider = WEB_COOKIE_PROVIDERS.lmarena;
    assert.ok(provider.freeNote, "Should have freeNote");
    assert.ok(provider.authHint, "Should have authHint");
    assert.ok(provider.icon, "Should have icon");
    assert.ok(provider.color, "Should have color");
    assert.ok(provider.textIcon, "Should have textIcon");
  });
});

describe("LMArena Credential Requirements", () => {
  it("requires web session credential", () => {
    assert.equal(requiresWebSessionCredential("lmarena"), true);
  });

  it("has correct credential requirement", () => {
    const req = getWebSessionCredentialRequirement("lmarena");
    assert.ok(req, "Should have credential requirement");
    assert.equal(req.kind, "cookie");
    assert.equal(req.credentialName, "session");
    assert.ok(req.placeholder.includes("lmarena.ai"));
    assert.equal(req.acceptsFullCookieHeader, true);
    assert.ok(req.storageKeys.includes("cookie"));
    assert.ok(req.storageKeys.includes("session"));
  });

  it("validates usable credentials correctly", () => {
    assert.equal(
      hasUsableWebSessionCredential("lmarena", { cookie: "session=abc123" }),
      true
    );
    assert.equal(
      hasUsableWebSessionCredential("lmarena", { session: "abc123" }),
      true
    );
    assert.equal(
      hasUsableWebSessionCredential("lmarena", { cookie: "" }),
      false
    );
    assert.equal(
      hasUsableWebSessionCredential("lmarena", {}),
      false
    );
  });
});

describe("LMArena Executor", () => {
  it("can be instantiated", () => {
    const executor = new LMArenaExecutor();
    assert.ok(executor, "Executor should be instantiated");
  });

  it("has correct provider ID", () => {
    const executor = new LMArenaExecutor();
    assert.equal((executor as any).provider, "lmarena");
  });

  it("builds correct URL", () => {
    const executor = new LMArenaExecutor();
    const url = (executor as any).buildUrl("gpt-4", {});
    assert.ok(url.includes("lmarena.ai"), "URL should include lmarena.ai");
  });

  it("builds headers with cookie", () => {
    const executor = new LMArenaExecutor();
    const headers = (executor as any).buildHeaders("gpt-4", { cookie: "session=abc123" }, {});
    assert.ok(headers.Cookie, "Should have Cookie header");
    assert.equal(headers.Cookie, "session=abc123");
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers.Accept, "text/event-stream");
  });

  it("builds headers without cookie when not provided", () => {
    const executor = new LMArenaExecutor();
    const headers = (executor as any).buildHeaders("gpt-4", {}, {});
    assert.ok(!headers.Cookie, "Should not have Cookie header when no cookie provided");
  });

  it("reads cookie from credentials correctly", () => {
    const executor = new LMArenaExecutor();

    // Direct cookie field
    let headers = (executor as any).buildHeaders("gpt-4", { cookie: "session=abc" }, {});
    assert.equal(headers.Cookie, "session=abc");

    // apiKey field (dashboard form)
    headers = (executor as any).buildHeaders("gpt-4", { apiKey: "session=def" }, {});
    assert.equal(headers.Cookie, "session=def");

    // providerSpecificData.cookie
    headers = (executor as any).buildHeaders(
      "gpt-4",
      { providerSpecificData: { cookie: "session=ghi" } },
      {}
    );
    assert.equal(headers.Cookie, "session=ghi");

    // Priority: direct > apiKey > providerSpecificData
    headers = (executor as any).buildHeaders(
      "gpt-4",
      { cookie: "session=abc", apiKey: "session=def" },
      {}
    );
    assert.equal(headers.Cookie, "session=abc");
  });
});
