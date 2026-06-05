import { BaseExecutor, type ExecuteInput } from "./base.ts";
import type { ProviderCredentials } from "./base.ts";

// ── Types ────────────────────────────────────────────────────────────────

type BrowserRef = import("playwright").Browser;
type PageRef = import("playwright").Page;

interface TokenCaptureResult {
  token: string;
}

// ── Browser singleton ────────────────────────────────────────────────────

let _browser: Promise<BrowserRef> | null = null;
let _browserCleanupRegistered = false;

function registerBrowserCleanup(): void {
  if (_browserCleanupRegistered) return;
  _browserCleanupRegistered = true;

  const cleanup = () => {
    if (_browser) {
      _browser.then((b) => b.close().catch(() => {})).catch(() => {});
      _browser = null;
    }
  };

  process.on("exit", cleanup);
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
}

function getPageTimeoutMs(): number {
  const raw = process.env.THEOLDLLM_PAGE_TIMEOUT_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 50_000) return n;
  }
  return 90_000;
}

function getNavTimeoutMs(): number {
  const raw = process.env.THEOLDLLM_NAV_TIMEOUT_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 5_000) return n;
  }
  return 30_000;
}

async function getBrowser(): Promise<BrowserRef> {
  if (_browser) {
    try {
      const b = await _browser;
      if (b.isConnected()) return b;
    } catch {
      _browser = null;
    }
  }

  registerBrowserCleanup();

  _browser = (async () => {
    const { chromium } = await import("playwright");
    return await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1280,1024",
      ],
    });
  })();

  return _browser;
}

/** Create a fresh page, navigate to the SPA, wait for initialization. */
async function createPage(browser: BrowserRef): Promise<PageRef> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1024 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    (window as any).chrome = { runtime: {} };
  });

  const page = await context.newPage();

  await page.goto("https://theoldllm.vercel.app/", {
    waitUntil: "domcontentloaded",
    timeout: getNavTimeoutMs(),
  });

  const textareaFound = await page
    .waitForSelector("textarea", { timeout: getNavTimeoutMs() })
    .then(() => true)
    .catch(() => false);

  if (!textareaFound) {
    const newChat = page.locator("button", { hasText: "New chat" });
    await newChat.first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
    const visible = await newChat.first().isVisible().catch(() => false);
    if (visible) {
      await newChat.first().click();
      await page.waitForTimeout(1_500);
      await page.waitForSelector("textarea", { timeout: 10_000 }).catch(() => {});
    }
  }

  // The SPA needs ~3s to fully initialize (React hydration, heartbeat,
  // Turnstile, event handlers). With less, Enter key events are ignored.
  await page.waitForTimeout(3_000);

  return page;
}

/**
 * Trigger the SPA's send flow to capture a valid x-request-token.
 * Fills the textarea, presses Enter, intercepts the /api/chatgpt request,
 * captures the token, and aborts the request so the token is not consumed.
 */
async function captureToken(page: PageRef): Promise<TokenCaptureResult> {
  return new Promise<TokenCaptureResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Token capture timed out after 25s"));
    }, 25_000);

    page.route("**/api/chatgpt", async (route) => {
      clearTimeout(timeout);
      const token = route.request().headers()["x-request-token"];
      try {
        await route.abort("blockedbyclient");
      } catch {
        // ignore if already fulfilled
      }
      resolve({ token });
    });

    (async () => {
      try {
        const ta = page.locator("textarea").first();
        await ta.waitFor({ state: "visible", timeout: 10_000 });
        await ta.click();
        await ta.fill("hello");
        await page.waitForTimeout(300);
        await ta.press("Enter");
      } catch (err) {
        clearTimeout(timeout);
        reject(new Error(`Failed to trigger SPA send: ${err instanceof Error ? err.message : String(err)}`));
      }
    })();
  });
}

/**
 * Map user-facing model names to the SPA-internal model identifiers.
 *
 * Confirmed working models (from direct API tests):
 *   GPT_5_4, GPT_5_3, GPT_5_2, GPT_5_1, GPT_5
 *   CLAUDE_4_6_OPUS, CLAUDE_4_6_SONNET, CLAUDE_4_5_HAIKU
 *
 * Non-working (return 400 "Model not supported"):
 *   OpenAI variants: OPENROUTER_GPT_4O, O4_MINI, O3_MINI
 *   Google Gemini: GEMINI_3_PRO, GEMINI_2_5_PRO, GEMINI_2_0_FLASH, etc.
 *   DeepSeek: DEEPSEEK_V4, TOGETHER_DEEPSEEK_R1, OPENROUTER_DEEPSEEK_R1, etc.
 *   Perplexity: SONAR_PRO, SONAR_DEEP_RESEARCH
 *   xAI: OPENROUTER_GROK_4
 *   OpenRouter: OPENROUTER_WEB_SEARCH
 *
 * Anything not in the working set falls back to GPT_5_4.
 */
const WORKING_MODELS: Record<string, string> = {
  "gpt-5.4": "GPT_5_4",
  "gpt-5.3": "GPT_5_3",
  "gpt-5.2": "GPT_5_2",
  "gpt-5.1": "GPT_5_1",
  "gpt-5": "GPT_5",
  "gpt5_4": "GPT_5_4",
  "gpt5_3": "GPT_5_3",
  "gpt5_2": "GPT_5_2",
  "gpt5_1": "GPT_5_1",
};

const CLAUDE_NAMES: Record<string, string> = {
  "claude-4.6-opus": "CLAUDE_4_6_OPUS",
  "claude-4.6-sonnet": "CLAUDE_4_6_SONNET",
  "claude-4.5-haiku": "CLAUDE_4_5_HAIKU",
  "claude_opus_4": "CLAUDE_4_6_OPUS",
  "claude_sonnet_4": "CLAUDE_4_6_SONNET",
  "claude_haiku_3_5": "CLAUDE_4_5_HAIKU",
  "claude opus 4": "CLAUDE_4_6_OPUS",
  "claude sonnet 4": "CLAUDE_4_6_SONNET",
  "claude haiku 3.5": "CLAUDE_4_5_HAIKU",
};

function mapModel(model: string): string {
  const normalized = model.toLowerCase().trim();

  // Direct match on known GPT names
  const gptKey = normalized.replace(/[_\s]+/g, "-");
  if (WORKING_MODELS[gptKey]) return WORKING_MODELS[gptKey];

  // Try replacing hyphens with underscores
  const gptKey2 = normalized.replace(/[-\s]+/g, "_");
  if (WORKING_MODELS[gptKey2]) return WORKING_MODELS[gptKey2];

  // Claude names
  if (CLAUDE_NAMES[normalized]) return CLAUDE_NAMES[normalized];

  // Fuzzy Claude detection
  if (normalized.includes("claude")) {
    if (normalized.includes("opus")) return "CLAUDE_4_6_OPUS";
    if (normalized.includes("sonnet")) return "CLAUDE_4_6_SONNET";
    if (normalized.includes("haiku")) return "CLAUDE_4_5_HAIKU";
  }

  // GPT-5 family (any GPT-5 variant → GPT_5_4)
  if (normalized.includes("gpt") && normalized.includes("5")) return "GPT_5_4";

  // Fallback for unsupported models
  return "GPT_5_4";
}

function buildNonStreamingResponse(sseText: string, model: string): string {
  let fullContent = "";
  let finishReason = "stop";
  for (const line of sseText.split("\n")) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      try {
        const parsed = JSON.parse(line.slice(6));
        const delta =
          parsed.choices?.[0]?.delta?.content ||
          parsed.choices?.[0]?.delta?.text ||
          "";
        fullContent += delta;
        if (parsed.choices?.[0]?.finish_reason) {
          finishReason = parsed.choices?.[0]?.finish_reason;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }

  return JSON.stringify({
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: mapModel(model),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: fullContent,
        },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

function buildErrorBody(status: number, bodyText: string): string {
  let detail = bodyText;
  for (const line of bodyText.split("\n")) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) {
          detail = JSON.stringify(parsed.error);
          break;
        }
        if (parsed.choices?.[0]?.delta?.content) {
          detail = parsed.choices[0].delta.content;
        }
      } catch {
        // use full body
      }
    }
  }
  return JSON.stringify({
    error: {
      message: detail,
      type: "upstream_error",
      code: `HTTP_${status}`,
    },
  });
}

// ── Per-instance request queue to serialize page access ──────────────────

class RequestQueue {
  private _queue: Array<{
    execute: () => Promise<void>;
    reject: (err: unknown) => void;
  }> = [];
  private _running = false;

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({
        execute: async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        reject: (err) => reject(err),
      });
      this._drain();
    });
  }

  private _drain(): void {
    if (this._running || this._queue.length === 0) return;
    this._running = true;
    const next = this._queue.shift()!;
    Promise.resolve(next.execute())
      .catch(() => {}) // handled inside execute
      .finally(() => {
        this._running = false;
        this._drain();
      });
  }

  get pending(): number {
    return this._queue.length;
  }
}

// ── Executor ─────────────────────────────────────────────────────────────

export class TheOldLlmExecutor extends BaseExecutor {
  private _requestQueue = new RequestQueue();

  constructor() {
    super("theoldllm", {
      format: "openai",
    });
  }

  buildUrl(_model: string, _stream: boolean): string {
    return "https://theoldllm.vercel.app/api/chatgpt";
  }

  buildHeaders(_credentials: ProviderCredentials): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Client-Version": "3.8.4",
    };
  }

  transformRequest(model: string, body: unknown, _stream: boolean): unknown {
    if (typeof body === "object" && body !== null) {
      const mapped = mapModel(model);
      return { ...(body as Record<string, unknown>), model: mapped };
    }
    return body;
  }

  async execute(input: ExecuteInput): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: unknown;
  }> {
    const { model, stream, body, signal, log } = input;
    const bodyStr = JSON.stringify(body);

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const execPromise = this._requestQueue.enqueue(async () => {
      const abortController = new AbortController();
      const overallTimer = setTimeout(() => {
        abortController.abort(new Error("Request timed out"));
      }, getPageTimeoutMs());

      signal?.addEventListener(
        "abort",
        () => {
          abortController.abort(signal.reason);
        },
        { once: true }
      );

      let page: PageRef | null = null;

      try {
        const browser = await getBrowser();

        // Phase 1: Create and initialize a fresh page
        page = await createPage(browser);

        // Phase 2: Capture token via SPA send flow
        log?.info?.("THEOLDLLM", "Capturing token via SPA send flow...");
        let capture: TokenCaptureResult;
        try {
          capture = await captureToken(page);
        } catch (tokenErr) {
          throw new Error(
            `Token capture failed: ${tokenErr instanceof Error ? tokenErr.message : String(tokenErr)}`
          );
        }
        log?.info?.("THEOLDLLM", `Token captured: ${capture.token.slice(0, 20)}...`);

        // Phase 3: Remove route interception
        await page.unroute("**/api/chatgpt").catch(() => {});

        // Phase 4: Build the request body and make the API call
        const rawModel = mapModel(model);
        const reqBody = JSON.parse(bodyStr);
        reqBody.model = rawModel;
        reqBody.stream = true;

        const requestArgs = {
          token: capture.token,
          body: JSON.stringify(reqBody),
        };

        // Use response.text() inside page context — this avoids
        // exposeFunction + ReadableStream compatibility issues.
        const result = await page.evaluate(
          async (args: { token: string; body: string }) => {
            try {
              const resp = await fetch("/api/chatgpt", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Client-Version": "3.8.4",
                  "X-Request-Token": args.token,
                },
                body: args.body,
              });
              const text = await resp.text();
              return { status: resp.status, body: text };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                status: 500,
                body: JSON.stringify({
                  error: { message: msg, type: "upstream_error", code: "FETCH_ERROR" },
                }),
              };
            }
          },
          requestArgs
        );

        // Phase 5: Write the response to the output stream
        if (result.status === 200 && result.body) {
          if (stream) {
            // Forward raw SSE text as chunks
            writer.write(encoder.encode(result.body)).catch(() => {});
          } else {
            // Parse SSE into a JSON chat completion response
            const jsonBody = buildNonStreamingResponse(result.body, model);
            writer.write(encoder.encode(jsonBody)).catch(() => {});
          }
        } else {
          const errBody = buildErrorBody(result.status, result.body || "");
          writer.write(encoder.encode(errBody)).catch(() => {});
        }

        writer.close().catch(() => {});
        clearTimeout(overallTimer);
      } catch (err) {
        clearTimeout(overallTimer);
        const msg = err instanceof Error ? err.message : String(err);
        log?.error?.("THEOLDLLM", `Executor error: ${msg}`);

        try {
          const errBody = JSON.stringify({
            error: {
              message: msg,
              type: "upstream_error",
              code: "EXECUTOR_ERROR",
            },
          });
          await writer.write(encoder.encode(errBody));
        } catch {
          // ignore write errors on closed stream
        }
        writer.close().catch(() => {});
      } finally {
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch {
            // ignore
          }
        }
      }
    });

    return {
      response: new Response(readable, {
        status: 200,
        headers: {
          "Content-Type": stream ? "text/event-stream" : "application/json",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }),
      url: this.buildUrl(model, stream),
      headers: this.buildHeaders(input.credentials),
      transformedBody: body,
    };
  }
}

export default TheOldLlmExecutor;
