import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const TESTS_DIR = path.dirname(THIS_FILE);
const REPO_ROOT = path.resolve(TESTS_DIR, "../..");

const TEST_LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-cli-logs-"));
const TEST_LOG_PATH = path.join(TEST_LOG_DIR, "app.log");

const originalLogFilePath = process.env.APP_LOG_FILE_PATH;
const originalApiKey = process.env.OMNIROUTE_API_KEY;
process.env.APP_LOG_FILE_PATH = TEST_LOG_PATH;
process.env.OMNIROUTE_API_KEY = "test-cli-token-12345";

const route = await import("../../src/app/api/cli-tools/logs/route.ts");

function makeRequest(query: string): Request {
  return new Request(`http://localhost/api/cli-tools/logs?${query}`, {
    headers: { Authorization: "Bearer test-cli-token-12345" },
  });
}

test("logs endpoint returns 200 and empty array when log file does not exist", async () => {
  if (fs.existsSync(TEST_LOG_PATH)) fs.unlinkSync(TEST_LOG_PATH);

  const response = await route.GET(makeRequest("lines=10"));
  const body = (await response.json()) as any;

  assert.equal(response.status, 200);
  assert.deepEqual(body, []);
});

test("logs endpoint returns filtered JSON array for non-follow mode", async () => {
  const now = new Date();

  fs.writeFileSync(
    TEST_LOG_PATH,
    [
      JSON.stringify({
        time: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        level: "error",
        msg: "too old",
      }),
      JSON.stringify({ time: now.toISOString(), level: "info", msg: "info message" }),
      JSON.stringify({ time: now.toISOString(), level: "warn", msg: "warning message" }),
      JSON.stringify({ time: now.toISOString(), level: "error", msg: "error message" }),
      "not-json-line",
    ].join("\n") + "\n",
    "utf8"
  );

  const response = await route.GET(makeRequest("lines=10&filter=error,warn"));
  const body = (await response.json()) as any;

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2);
  const levels = body.map((e: any) => e.level);
  assert.ok(levels.includes("warn"));
  assert.ok(levels.includes("error"));
});

test("logs endpoint respects lines limit for non-follow mode", async () => {
  const now = new Date();
  const entries = Array.from({ length: 10 }, (_, i) => ({
    time: new Date(now.getTime() - i * 60 * 1000).toISOString(),
    level: "info",
    msg: `message ${i}`,
  }));

  fs.writeFileSync(TEST_LOG_PATH, entries.reverse().map(JSON.stringify).join("\n") + "\n", "utf8");

  const response = await route.GET(makeRequest("lines=3"));
  const body = (await response.json()) as any;

  assert.equal(response.status, 200);
  assert.equal(body.length, 3);
  assert.equal(body[0].msg, "message 0");
  assert.equal(body[2].msg, "message 2");
});

test("logs follow mode returns streaming response with correct headers", async () => {
  fs.writeFileSync(
    TEST_LOG_PATH,
    JSON.stringify({ time: new Date().toISOString(), level: "info", msg: "initial" }) + "\n",
    "utf8"
  );

  const response = await route.GET(makeRequest("follow=true"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type")?.includes("text/plain"), true);
  assert.ok(response.body !== null);
});

test("logs endpoint normalizes numeric pino levels (30=info, 40=warn, 50=error)", async () => {
  const now = new Date();
  fs.writeFileSync(
    TEST_LOG_PATH,
    [
      JSON.stringify({ time: now.toISOString(), level: 30, msg: "info numeric level" }),
      JSON.stringify({ time: now.toISOString(), level: 40, msg: "warn numeric level" }),
      JSON.stringify({ time: now.toISOString(), level: 50, msg: "error numeric level" }),
    ].join("\n") + "\n",
    "utf8"
  );

  const response = await route.GET(makeRequest("filter=info"));
  const body = (await response.json()) as any;

  assert.equal(response.status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].level, "info");
});

test.after(() => {
  if (originalLogFilePath === undefined) {
    delete process.env.APP_LOG_FILE_PATH;
  } else {
    process.env.APP_LOG_FILE_PATH = originalLogFilePath;
  }
  if (originalApiKey === undefined) {
    delete process.env.OMNIROUTE_API_KEY;
  } else {
    process.env.OMNIROUTE_API_KEY = originalApiKey;
  }
  fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
});
