/**
 * Tests for provider validation fixes:
 * - Bug 1: `theoldllm` and `chipotle` no-auth providers not in providerAllowsOptionalApiKey
 * - Bug 2: `kimi` API key provider incorrectly routed through KimiWebExecutor
 */
import test from "node:test";
import assert from "node:assert/strict";

const { providerAllowsOptionalApiKey } = await import(
  "../../src/shared/constants/providers.ts"
);
const { hasSpecializedExecutor } = await import(
  "../../open-sse/executors/index.ts"
);

// Bug 1: theoldllm and chipotle were missing from providerAllowsOptionalApiKey
test("theoldllm is recognized as allowing optional API key (no-auth provider)", () => {
  assert.equal(providerAllowsOptionalApiKey("theoldllm"), true);
});

test("chipotle is recognized as allowing optional API key (no-auth provider)", () => {
  assert.equal(providerAllowsOptionalApiKey("chipotle"), true);
});

// Bug 2: kimi API key provider should NOT have a specialized web-cookie executor
test("kimi API key provider does not have a specialized web-cookie executor", () => {
  // kimi should fall through to DefaultExecutor (OpenAI format)
  // because it is an API key provider, not a web-cookie provider
  assert.equal(hasSpecializedExecutor("kimi"), false);
});

// kimi-web still has its specialized executor (no regression)
test("kimi-web still has its specialized web-cookie executor", () => {
  assert.equal(hasSpecializedExecutor("kimi-web"), true);
});

// kimi-coding-apikey still has its specialized executor (no regression)
test("kimi-coding-apikey still has its specialized executor", () => {
  assert.equal(hasSpecializedExecutor("kimi-coding-apikey"), true);
});
