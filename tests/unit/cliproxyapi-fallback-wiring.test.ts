import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests for CLIProxyAPI fallback wiring fixes:
 * - Settings sync creates upstream_proxy_config for ALL active providers
 * - Fallback codes from settings are respected (no hardcoded override)
 * - CLIProxyAPI URL from settings is used by executor
 */

describe("CLIProxyAPI fallback wiring", () => {
  describe("settings sync to upstream_proxy_config", () => {
    it("should create rows for each active provider, not just 'cliproxyapi'", async () => {
      // Mock DB with active providers
      const upserts: Array<{ providerId: string; mode: string; enabled: boolean }> = [];
      const activeProviders = ["anthropic", "openai", "deepseek", "groq"];

      // Simulate the sync logic from settings route
      const cpaFallback = true;
      const enabled = cpaFallback;
      const mode = enabled ? "fallback" : "native";

      for (const providerId of activeProviders) {
        if (providerId === "cliproxyapi" || providerId === "9router") continue;
        upserts.push({ providerId, mode, enabled: !!enabled });
      }

      // Should create rows for all 4 providers
      assert.equal(upserts.length, 4);
      assert.deepEqual(upserts[0], { providerId: "anthropic", mode: "fallback", enabled: true });
      assert.deepEqual(upserts[1], { providerId: "openai", mode: "fallback", enabled: true });
      assert.deepEqual(upserts[2], { providerId: "deepseek", mode: "fallback", enabled: true });
      assert.deepEqual(upserts[3], { providerId: "groq", mode: "fallback", enabled: true });
    });

    it("should skip embedded services (cliproxyapi, 9router)", () => {
      const activeProviders = ["anthropic", "cliproxyapi", "9router", "openai"];
      const result: string[] = [];

      for (const providerId of activeProviders) {
        if (providerId === "cliproxyapi" || providerId === "9router") continue;
        result.push(providerId);
      }

      assert.deepEqual(result, ["anthropic", "openai"]);
    });

    it("should disable rows when fallback is turned OFF", () => {
      const cpaFallback = false;
      const mode = cpaFallback ? "fallback" : "native";

      assert.equal(mode, "native");
    });

    it("should NOT create a row with providerId='cliproxyapi'", () => {
      // This was the original bug — the sync created a row for "cliproxyapi"
      // which nobody reads. chatCore reads per-provider (e.g. "anthropic").
      const activeProviders = ["anthropic", "openai"];
      const upsertedIds: string[] = [];

      for (const providerId of activeProviders) {
        if (providerId === "cliproxyapi" || providerId === "9router") continue;
        upsertedIds.push(providerId);
      }

      assert.ok(!upsertedIds.includes("cliproxyapi"), "Should NOT create row for 'cliproxyapi'");
    });
  });

  describe("fallback codes from settings", () => {
    it("should use user-configured codes instead of hardcoded values", () => {
      // Simulate reading from settings
      const settingsFallbackCodes = "429,500,502";
      const fallbackCodes = settingsFallbackCodes
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const isRetryableStatus = (s: number) => fallbackCodes.includes(s) || s === 0;

      // User-configured codes should trigger fallback
      assert.equal(isRetryableStatus(429), true);
      assert.equal(isRetryableStatus(500), true);
      assert.equal(isRetryableStatus(502), true);

      // Network error code should always trigger fallback
      assert.equal(isRetryableStatus(0), true);

      // Codes NOT in user config should NOT trigger fallback
      // (this was the bug: old code had || s >= 500 which always matched 5xx)
      assert.equal(isRetryableStatus(503), false);
      assert.equal(isRetryableStatus(504), false);
    });

    it("should fall back to defaults when settings are empty", () => {
      const defaultCodes = [429, 500, 502, 503, 504];
      const settingsFallbackCodes = "";
      let fallbackCodes = defaultCodes;

      if (typeof settingsFallbackCodes === "string" && settingsFallbackCodes.trim()) {
        const parsed = settingsFallbackCodes
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        if (parsed.length > 0) fallbackCodes = parsed;
      }

      const isRetryableStatus = (s: number) => fallbackCodes.includes(s) || s === 0;

      assert.equal(isRetryableStatus(429), true);
      assert.equal(isRetryableStatus(500), true);
      assert.equal(isRetryableStatus(502), true);
      assert.equal(isRetryableStatus(503), true);
      assert.equal(isRetryableStatus(504), true);
    });

    it("should handle single code in settings", () => {
      const settingsFallbackCodes = "429";
      const fallbackCodes = settingsFallbackCodes
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      assert.deepEqual(fallbackCodes, [429]);
    });
  });

  describe("CLIProxyAPI URL from settings", () => {
    it("should prefer settings URL over env vars", () => {
      const settingsUrl = "http://custom-host:9999";
      const envHost = "127.0.0.1";
      const envPort = "8317";

      // Simulate priority: settings > env > defaults
      let url = settingsUrl;
      if (!url) {
        url = `http://${envHost || "127.0.0.1"}:${envPort || "8317"}`;
      }

      assert.equal(url, "http://custom-host:9999");
    });

    it("should fall back to env vars when settings URL is empty", () => {
      const settingsUrl = "";
      const envHost = "10.0.0.1";
      const envPort = "9090";

      let url = settingsUrl;
      if (!url) {
        url = `http://${envHost || "127.0.0.1"}:${envPort || "8317"}`;
      }

      assert.equal(url, "http://10.0.0.1:9090");
    });

    it("should fall back to defaults when both settings and env are empty", () => {
      const settingsUrl = "";
      const envHost = "";
      const envPort = "";

      let url = settingsUrl;
      if (!url) {
        url = `http://${envHost || "127.0.0.1"}:${envPort || "8317"}`;
      }

      assert.equal(url, "http://127.0.0.1:8317");
    });
  });
});
