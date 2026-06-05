# Providers — Web Providers

## claude-web

Web-cookie-based provider for **Claude AI** (`claude.ai`) using session cookie authentication.

### How It Works

1. User pastes their `claude.ai` session cookies into the OmniRoute dashboard
2. `ClaudeWebExecutor` transforms OpenAI-format requests to Claude Web API format
3. Requests are sent via **`tls-client-node`** with a **Chrome 146 TLS fingerprint** aligned to the browser headers
4. Responses are streamed back via SSE (`text/event-stream`)

### Required Cookies

| Cookie         | Purpose                        | Source                                 |
| -------------- | ------------------------------ | -------------------------------------- |
| `sessionKey`   | Main authentication            | `claude.ai` browser session            |
| `routingHint`  | Anthropic routing              | `claude.ai` browser session            |
| `cf_clearance` | Cloudflare Turnstile clearance | Auto-set by Cloudflare after challenge |
| `__cf_bm`      | Cloudflare bot management      | Auto-set by Cloudflare                 |
| `_cfuvid`      | Cloudflare visitor ID          | Auto-set by Cloudflare                 |

> **Note**: `cf_clearance` is bound to the TLS fingerprint, IP reputation, and session context of the browser that solved Cloudflare's Turnstile challenge. The `tls-client-node` library (via `claudeTlsClient.ts`) uses a Chrome 146 TLS handshake aligned with OmniRoute's Claude Web headers, but Cloudflare can still reject datacenter / VPS IPs with `cf-mitigated: challenge`.

### Known Limitations

- `claude-web` can return `cloudflare_challenge` / `cf_mitigated_challenge` when Cloudflare rejects the current IP, even with valid cookies. This is normally IP/session-bound; use a residential network/proxy, run OmniRoute from the same network where the cookie was issued, or use the official `claude` provider.
- `cf_clearance` copied from one machine or IP may not work from another machine or VPS because Cloudflare binds clearance to more than the cookie string.
- **Browser-backed execution is the proven working path.** Set `WEB_COOKIE_USE_BROWSER=1` to enable browser-backed chat. The executor routes requests through `browserBackedChat()` (Playwright/Cloakbrowser) or `httpBackedChat()` (tlsClient) instead of the TLS client directly. The browser path solves Cloudflare Turnstile natively and reliably returns `HTTP 200` from datacenter/VPS IPs where the Node TLS path gets `cf_mitigated`.
  - **Two paths, same interface:**
    - `browserBackedChat()` — full Playwright/Cloakbrowser. Launches Chromium, navigates to the chat page, types the message, clicks Send, captures the SSE response. ~10-25s per request, solves all anti-bot challenges. Requires `cloakbrowser` or `playwright` installed.
    - `httpBackedChat()` — lightweight TLS-client alternative. Makes a direct HTTP POST with Chrome 124 TLS fingerprint and browser-emulated headers using `wreq-js`. ~0.5-2s per request, ~10-50x faster than Playwright. Does NOT solve Turnstile challenges — only passes `cf_clearance` cookies that are already valid for the current TLS fingerprint and IP.
  - **Opt-in only**: `browserBackedChat()` and `httpBackedChat()` are opt-in via `WEB_COOKIE_USE_BROWSER=1` or `OMNIROUTE_BROWSER_POOL=on`. The default `tls-client-node` Chrome 146 path remains the lightweight default for all requests.
  - **Test coverage**: 45 unit tests (DDG 25, Claude 20) covering env-flag gating, browser override, httpBacked override, and TLS fallback.

### API Reference

**Endpoint**: `POST /api/organizations/{orgId}/chat_conversations/{convId}/completion`

**Required Headers**:

```
accept: text/event-stream
anthropic-client-platform: web_claude_ai
anthropic-device-id: <uuid>
content-type: application/json
Referer: https://claude.ai/chat/{convId}
```

**Request Body**:

```json
{
  "prompt": "user message",
  "model": "claude-sonnet-4-6",
  "timezone": "Asia/Jakarta",
  "locale": "en-US",
  "personalized_styles": [...],
  "tools": [...],
  "rendering_mode": "messages",
  "create_conversation_params": {
    "name": "",
    "model": "claude-sonnet-4-6",
    "is_temporary": false
  }
}
```

### Architecture

```
User Cookies (claude.ai)
    ↓
OmniRoute Dashboard
    ↓
ClaudeWebExecutor (open-sse/executors/claude-web.ts)
    ↓ Request transformation (OpenAI → Claude Web format)
    ↓
tlsFetchClaude() (open-sse/services/claudeTlsClient.ts)
    ↓ Chrome 146 TLS fingerprint spoofing
    ↓
tls-client-node (Go native binding, koffi)
    ↓
claude.ai API
    ↓ SSE stream
```

### Files

| File                                                  | Purpose                                      |
| ----------------------------------------------------- | -------------------------------------------- |
| `src/shared/constants/providers.ts`                   | Provider registration (WEB_COOKIE_PROVIDERS) |
| `src/lib/providers/wrappers/claudeWeb.ts`             | Type definitions + cookie utilities          |
| `open-sse/executors/claude-web.ts`                    | Executor implementation                      |
| `open-sse/executors/index.ts`                         | Executor registration                        |
| `open-sse/services/claudeTlsClient.ts`                | TLS fingerprint spoofing via tls-client-node |
| `open-sse/services/__tests__/claudeTlsClient.test.ts` | TLS client tests                             |
| `tests/unit/claude-web.test.ts`                       | Executor tests                               |

### Testing

```bash
# Unit tests
node --import tsx/esm --test tests/unit/claude-web.test.ts

# TLS client tests
npx vitest run open-sse/services/__tests__/claudeTlsClient.test.ts
```

### Setup

1. Start OmniRoute: `omniroute`
2. Go to Dashboard → Providers → Add Provider
3. Select "Web Cookie" category
4. Choose "Claude Web"
5. Paste your full cookie header from `claude.ai` browser DevTools (Network tab → Copy as fetch → Cookie header)

## duckduckgo-web

Anonymous provider for **Duck.ai by DuckDuckGo** (`duck.ai`) using browser-shaped warm-up requests, VQD challenge solving, and Duck.ai's SSE chat endpoint.

### Known Limitations

- `duckduckgo-web` is anonymous and can return `ERR_RATE_LIMIT`, `ERR_CHALLENGE`, or `ERR_BN_LIMIT` when Duck.ai rejects the current IP/session. These responses are enforced upstream and can happen even when the request shape matches a browser.
- Some Duck.ai models may be unavailable or more aggressively rate-limited from datacenter/VPS networks. Use combo fallback, wait for the upstream limit to reset, or route through a network with a better IP reputation.
- The executor surfaces these upstream failures as structured JSON errors so combo routing can fall back to the next provider.
- **VQD challenge requires a real browser environment.** The chat endpoint validates the VQD challenge solution against values that only a real browser can produce (DOM layout measurements like `offsetWidth/Height`, `getBoundingClientRect`, `getComputedStyle`, and iframe `contentWindow` probe results). OmniRoute ships a Node `vm`-based solver with browser stub objects that lets the challenge JavaScript run end-to-end and produces a structurally valid `client_hashes` array, but the server can still detect the stub values and reject the request (`ERR_CHALLENGE` with `overrideCode: "08a0"`). The only way to get a real `HTTP 200` against the chat endpoint is to run the same request from a real Chrome 146 / Vivaldi browser context (e.g. a real browser-backed executor, or by harvesting a fresh `x-vqd-hash-1` from a browser session and replaying it within the validity window). Maintained references such as `p2d-duck` exhibit the same Node-side failure mode from the same IP.
- **Browser-backed execution is the proven working path.** Set `WEB_COOKIE_USE_BROWSER=1` to enable browser-backed chat. The executor routes requests through `browserBackedChat()` (Playwright/Cloakbrowser) or `httpBackedChat()` (tlsClient). The browser path solves the VQD challenge natively and returns `HTTP 200` SSE where the Node TLS path gets `ERR_CHALLENGE`. No cookies are required; the VQD challenge is solved natively by the browser.
  - **Two paths, same interface:**
    - `browserBackedChat()` — full Playwright/Cloakbrowser. Launches Chromium, navigates to `duck.ai/chat`, types the message, clicks Send, captures the SSE response. ~10-25s per request. Solves VQD natively. Requires `cloakbrowser` (Playwright-compatible stealth Chromium) — the Playwright fallback does NOT bypass DDG's VQD check.
    - `httpBackedChat()` — lightweight TLS-client alternative. Direct HTTP POST with Chrome 124 fingerprint + browser-emulated headers + VQD headers from `duckduckgo-web.ts`. ~0.5-2s per request (~10-50x faster). Does NOT solve VQD challenges — only works when a fresh `x-vqd-hash-1` is available and valid.
  - **Opt-in only**: Both paths are opt-in via `WEB_COOKIE_USE_BROWSER=1` or `OMNIROUTE_BROWSER_POOL=on`. The Node-based VQD solver + TLS client remains the lightweight default.
  - **Test coverage**: 25 unit tests covering env-flag gating, browser override, httpBacked override, and TLS fallback.

### Testing

```bash
node --import tsx/esm --test tests/unit/duckduckgo-web-executor.test.ts
```
