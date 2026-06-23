/**
 * ChatGptWebExecutor — ChatGPT Web Session Provider
 *
 * Routes requests through chatgpt.com's internal SSE API using a Plus/Pro
 * subscription session cookie, translating between OpenAI chat completions
 * format and ChatGPT's internal protocol.
 *
 * Auth pipeline (per request):
 *   1. exchangeSession()          GET  /api/auth/session       cookie → JWT accessToken (cached ~5min)
 *   2. prepareChatRequirements()  POST /backend-api/sentinel/chat-requirements
 *                                                              → { proofofwork.seed, difficulty, persona }
 *   3. solveProofOfWork()         SHA3-512 hash loop           → "gAAAAAB…" sentinel proof token
 *   4. fetch /backend-api/conversation                         with Bearer + sentinel-proof-token + browser UA
 *
 * Response is the standard ChatGPT SSE format (cumulative `parts[0]` strings, not deltas).
 */

import { BaseExecutor, type ExecuteInput, type ProviderCredentials } from "./base.ts";
import { describeChatGptWebHttpError } from "./chatgptWebErrors.ts";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import {
  tlsFetchChatGpt,
  TlsClientUnavailableError,
  type TlsFetchResult,
} from "../services/chatgptTlsClient.ts";
import {
  storeChatGptImage,
  getChatGptImageConversationContext,
  __resetChatGptImageCacheForTesting,
  type ChatGptImageConversationContext,
} from "../services/chatgptImageCache.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const CHATGPT_BASE = "https://chatgpt.com";
const SESSION_URL = `${CHATGPT_BASE}/api/auth/session`;
const SENTINEL_PREPARE_URL = `${CHATGPT_BASE}/backend-api/sentinel/chat-requirements/prepare`;
const SENTINEL_CR_URL = `${CHATGPT_BASE}/backend-api/sentinel/chat-requirements`;
const CONV_URL = `${CHATGPT_BASE}/backend-api/f/conversation`;
const USER_LAST_USED_MODEL_CONFIG_URL = `${CHATGPT_BASE}/backend-api/settings/user_last_used_model_config`;

const CHATGPT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0";

// Captured from a real chatgpt.com browser session (April 2026).
const OAI_CLIENT_VERSION = "prod-81e0c5cdf6140e8c5db714d613337f4aeab94029";
const OAI_CLIENT_BUILD_NUMBER = "6128297";

// Per-cookie device ID. The browser stores a persistent `oai-did` cookie that
// uniquely identifies the device for OpenAI's risk model — we derive a stable
// UUID from a hash of the session cookie so that each account/connection gets
// its own device id, but it doesn't change between requests.
const deviceIdCache = new Map<string, string>();
function deviceIdFor(cookie: string): string {
  const key = cookieKey(cookie);
  let id = deviceIdCache.get(key);
  if (!id) {
    // Synthesize a UUID v4-shaped string from a SHA-256 of the cookie. Stable,
    // deterministic per cookie, no PII (the cookie's already secret).
    // Not a password hash — SHA-256 is used to derive a stable UUID from the
    // session cookie for device-id fingerprinting. The output is a cache key.
    const h = createHash("sha256").update(cookie).digest("hex"); // lgtm[js/insufficient-password-hash]
    id =
      `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-` +
      `${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-` +
      h.slice(20, 32);
    if (deviceIdCache.size >= 200) {
      const first = deviceIdCache.keys().next().value;
      if (first) deviceIdCache.delete(first);
    }
    deviceIdCache.set(key, id);
  }
  return id;
}

// OmniRoute model ID → ChatGPT internal slug. OmniRoute uses dot-form IDs
// (e.g. "gpt-5.3-instant"), ChatGPT's web routes use dash-form
// (e.g. "gpt-5-3-instant"). The slug catalog comes from
// /backend-api/models on a logged-in account; "gpt-5-4-t-mini" is ChatGPT's
// abbreviated slug for "GPT-5.4 Thinking Mini".
const MODEL_MAP: Record<string, string> = {
  "gpt-5.3-instant": "gpt-5-3-instant",
  "gpt-5.3": "gpt-5-3",
  "gpt-5.3-mini": "gpt-5-3-mini",
  "gpt-5.5-thinking": "gpt-5-5-thinking",
  "gpt-5.4-thinking": "gpt-5-4-thinking",
  "gpt-5.4-thinking-mini": "gpt-5-4-t-mini",
  "gpt-5.2-instant": "gpt-5-2-instant",
  "gpt-5.2": "gpt-5-2",
  "gpt-5.2-thinking": "gpt-5-2-thinking",
  "gpt-5.1": "gpt-5-1",
  "gpt-5": "gpt-5",
  "gpt-5-mini": "gpt-5-mini",
  o3: "o3",
};

/** Set of chatgpt.com slugs that the user_last_used_model_config endpoint
 * accepts a `thinking_effort` value for, derived from MODEL_MAP so adding a
 * new thinking entry there automatically extends this set. Includes the
 * abbreviated slug `gpt-5-4-t-mini` (no literal "thinking" substring) — the
 * reason this set exists at all rather than a substring match.
 *
 * Derived from MODEL_MAP keys (always dot-form) that contain "thinking" or
 * are the `o3` reasoning model; the values are the chatgpt.com-side slugs. */
const THINKING_CAPABLE_SLUGS: ReadonlySet<string> = new Set(
  Object.entries(MODEL_MAP)
    .filter(([k]) => k.includes("thinking") || k === "o3")
    .map(([, v]) => v)
);

// ─── Browser-like default headers ──────────────────────────────────────────

function browserHeaders(): Record<string, string> {
  return {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Origin: CHATGPT_BASE,
    Pragma: "no-cache",
    Referer: `${CHATGPT_BASE}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": CHATGPT_USER_AGENT,
  };
}

/** Headers ChatGPT's web client sends on backend-api requests. */
function oaiHeaders(sessionId: string, deviceId: string): Record<string, string> {
  return {
    "OAI-Language": "en-US",
    "OAI-Device-Id": deviceId,
    "OAI-Client-Version": OAI_CLIENT_VERSION,
    "OAI-Client-Build-Number": OAI_CLIENT_BUILD_NUMBER,
    "OAI-Session-Id": sessionId,
  };
}

// ─── Session token cache ────────────────────────────────────────────────────

interface TokenEntry {
  accessToken: string;
  accountId: string | null;
  expiresAt: number;
  refreshedCookie?: string;
}

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5min — accessTokens are short-lived
const tokenCache = new Map<string, TokenEntry>();

function cookieKey(cookie: string): string {
  // SHA-256 prefix (64 bits). Used as the Map key for tokenCache and
  // warmupCache; the previous 32-bit FNV-1a was small enough that a
  // birthday-paradox collision could surface one user's cached accessToken
  // to another's request. 64 bits is overkill for the 200-entry cache but
  // costs essentially nothing.
  // Not a password hash — SHA-256 is used to derive a short, collision-resistant
  // cache key from the session cookie. The output is a map lookup key.
  return createHash("sha256").update(cookie).digest("hex").slice(0, 16); // lgtm[js/insufficient-password-hash]
}

function tokenLookup(cookie: string): TokenEntry | null {
  const entry = tokenCache.get(cookieKey(cookie));
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    tokenCache.delete(cookieKey(cookie));
    return null;
  }
  return entry;
}

const TOKEN_CACHE_MAX = 200;

function tokenStore(cookie: string, entry: TokenEntry): void {
  // Bound the cache to TOKEN_CACHE_MAX entries (FIFO). Same shape as the
  // image cache and warmup cache — drop the oldest before inserting.
  if (tokenCache.size >= TOKEN_CACHE_MAX && !tokenCache.has(cookieKey(cookie))) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }
  tokenCache.set(cookieKey(cookie), entry);
}

// Conversation continuity is intentionally not cached. Open WebUI and most
// OpenAI-API-style clients re-send the full history each turn, so each
// request just starts a fresh conversation. Temporary Chat mode is the
// default; it gets disabled per-request only for image-gen prompts, since
// that mode rejects the image_gen tool.

// ─── /api/auth/session — exchange cookie for JWT ────────────────────────────

interface SessionResponse {
  accessToken?: string;
  expires?: string;
  user?: { id?: string };
}

// Session-token family — NextAuth uses one of these depending on token size:
//   __Secure-next-auth.session-token            (unchunked, < 4KB)
//   __Secure-next-auth.session-token.0          (chunked, first piece)
//   __Secure-next-auth.session-token.N          (chunked, additional pieces)
// Rotation can change the shape (unchunked → chunked or vice versa). When
// that happens, every old family member must be dropped — keeping the stale
// variant alongside the new one would send both, and depending on parser
// precedence the server could read the stale value and fail auth.
const SESSION_TOKEN_FAMILY_RE = /^__Secure-next-auth\.session-token(?:\.\d+)?$/;

/**
 * Merge any rotated session-token chunks from a Set-Cookie response into the
 * original cookie blob, preserving every other cookie the caller pasted
 * (cf_clearance, __cf_bm, _cfuvid, _puid, ...). Returns null if no rotation
 * occurred or the rotated chunks match what's already there.
 *
 * Returning only the matched session-token chunks here was a bug: when the
 * caller pastes a full DevTools Cookie line (the recommended form), the
 * Cloudflare cookies are required for subsequent requests, and dropping
 * them re-triggers `cf-mitigated: challenge`.
 */
function mergeRefreshedCookie(
  originalCookie: string,
  setCookieHeader: string | null
): string | null {
  if (!setCookieHeader) return null;
  const matches = Array.from(
    setCookieHeader.matchAll(/(__Secure-next-auth\.session-token(?:\.\d+)?)=([^;,\s]+)/g)
  );
  if (matches.length === 0) return null;

  const refreshed = new Map<string, string>();
  for (const m of matches) refreshed.set(m[1], m[2]);

  let blob = originalCookie.trim();
  if (/^cookie\s*:\s*/i.test(blob)) blob = blob.replace(/^cookie\s*:\s*/i, "");

  // Bare value (no `=`): the original was just the session-token contents.
  // Replace with the new chunked form.
  if (!/=/.test(blob)) {
    return Array.from(refreshed, ([k, v]) => `${k}=${v}`).join("; ");
  }

  const pairs = blob.split(/;\s*/).filter(Boolean);
  const result: string[] = [];
  let mutated = false;
  let droppedStale = false;
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) {
      result.push(pair);
      continue;
    }
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1);
    // Drop ALL session-token-family members from the original — we'll
    // append the refreshed set below. This handles unchunked→chunked and
    // chunked→unchunked rotations, where keeping the old name would leave
    // the stale token visible alongside the new one.
    if (SESSION_TOKEN_FAMILY_RE.test(name)) {
      if (!refreshed.has(name) || refreshed.get(name) !== value) mutated = true;
      droppedStale = true;
      continue;
    }
    result.push(`${name}=${value}`);
  }
  // Append the full refreshed family.
  for (const [name, value] of refreshed) {
    result.push(`${name}=${value}`);
  }
  if (!droppedStale) mutated = true; // refreshed chunks were entirely new
  return mutated ? result.join("; ") : null;
}

/**
 * Build the Cookie header value from whatever the user pasted.
 *
 * Accepts:
 *   - A bare value:                       "eyJhbGc..."  →  prepended with __Secure-next-auth.session-token=
 *   - An unchunked cookie line:           "__Secure-next-auth.session-token=eyJ..."
 *   - A chunked cookie line:              "__Secure-next-auth.session-token.0=...; __Secure-next-auth.session-token.1=..."
 *   - The full DevTools cookie header:    "Cookie: __Secure-next-auth.session-token.0=...; cf_clearance=..."
 *
 * If the user pastes a chunked token, we pass the cookies through verbatim —
 * NextAuth's server reassembles them on its side.
 */
function buildSessionCookieHeader(rawInput: string): string {
  let s = rawInput.trim();
  if (/^cookie\s*:\s*/i.test(s)) s = s.replace(/^cookie\s*:\s*/i, "");
  if (/__Secure-next-auth\.session-token(?:\.\d+)?\s*=/.test(s)) {
    return s;
  }
  return `__Secure-next-auth.session-token=${s}`;
}

async function exchangeSession(
  cookie: string,
  signal: AbortSignal | null | undefined
): Promise<TokenEntry> {
  const cached = tokenLookup(cookie);
  if (cached) return cached;

  const headers: Record<string, string> = {
    ...browserHeaders(),
    Accept: "application/json",
    Cookie: buildSessionCookieHeader(cookie),
  };

  const response = await tlsFetchChatGpt(SESSION_URL, {
    method: "GET",
    headers,
    timeoutMs: 30_000,
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    throw new SessionAuthError("Invalid session cookie");
  }
  if (response.status >= 400) {
    throw new Error(`Session exchange failed (HTTP ${response.status})`);
  }

  const refreshed = mergeRefreshedCookie(cookie, response.headers.get("set-cookie"));
  let data: SessionResponse = {};
  try {
    data = JSON.parse(response.text || "{}");
  } catch {
    console.warn("[chatgpt-web] session response JSON parse failed");
    /* empty body or non-JSON */
  }
  if (!data.accessToken) {
    throw new SessionAuthError("Session response missing accessToken — cookie likely expired");
  }

  const expiresAt = data.expires ? new Date(data.expires).getTime() : Date.now() + TOKEN_TTL_MS;
  const entry: TokenEntry = {
    accessToken: data.accessToken,
    accountId: data.user?.id ?? null,
    expiresAt: Math.min(expiresAt, Date.now() + TOKEN_TTL_MS),
    refreshedCookie: refreshed ?? undefined,
  };
  tokenStore(cookie, entry);
  return entry;
}

class SessionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionAuthError";
  }
}

// ─── /backend-api/sentinel/chat-requirements ────────────────────────────────

interface ChatRequirements {
  /** Returned by /chat-requirements (the "real" chat requirements token). */
  token?: string;
  /** Returned by /chat-requirements/prepare (sent as a prerequisite header). */
  prepare_token?: string;
  persona?: string;
  proofofwork?: {
    required?: boolean;
    seed?: string;
    difficulty?: string;
  };
  turnstile?: {
    required?: boolean;
    dx?: string;
  };
}

// ─── Session warmup ────────────────────────────────────────────────────────
// Mimics chatgpt.com's page-load fetch sequence so Sentinel sees a "warm"
// browsing session. Cached per (cookie, access-token) pair for 60s to avoid
// hammering the warmup endpoints on every chat completion.

const warmupCache = new Map<string, number>();
const WARMUP_TTL_MS = 60_000;
const WARMUP_CACHE_MAX = 200;

async function runSessionWarmup(
  accessToken: string,
  accountId: string | null,
  sessionId: string,
  deviceId: string,
  cookie: string,
  signal: AbortSignal | null | undefined,
  log: { debug?: (tag: string, msg: string) => void } | null | undefined
): Promise<void> {
  const key = cookieKey(cookie) + ":" + accessToken.slice(-8);
  const now = Date.now();
  const last = warmupCache.get(key);
  if (last && now - last < WARMUP_TTL_MS) return;
  // Bound the cache: drop the oldest entry once we hit the cap. Map iteration
  // order is insertion order, so the first key is the oldest.
  if (warmupCache.size >= WARMUP_CACHE_MAX && !warmupCache.has(key)) {
    const first = warmupCache.keys().next().value;
    if (first) warmupCache.delete(first);
  }
  warmupCache.set(key, now);

  const headers: Record<string, string> = {
    ...browserHeaders(),
    ...oaiHeaders(sessionId, deviceId),
    Accept: "*/*",
    Authorization: `Bearer ${accessToken}`,
    Cookie: buildSessionCookieHeader(cookie),
    Priority: "u=1, i",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;

  const urls = [
    `${CHATGPT_BASE}/backend-api/me`,
    `${CHATGPT_BASE}/backend-api/conversations?offset=0&limit=28&order=updated`,
    `${CHATGPT_BASE}/backend-api/models?history_and_training_disabled=false`,
  ];

  for (const url of urls) {
    try {
      const r = await tlsFetchChatGpt(url, {
        method: "GET",
        headers,
        timeoutMs: 15_000,
        signal,
      });
      log?.debug?.("CGPT-WEB", `warmup ${url.split("/backend-api/")[1]} → ${r.status}`);
    } catch (err) {
      log?.debug?.(
        "CGPT-WEB",
        `warmup ${url} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// ─── Thinking-effort preference (PATCH user_last_used_model_config) ────────
// chatgpt.com has two thinking levels for its dedicated thinking-models:
//   • standard — default, faster
//   • extended — longer reasoning budget
// The browser sets the level by PATCHing `/backend-api/settings/user_last_used_model_config`
// once, then issues the conversation request — the conversation endpoint itself
// has no `thinking_effort` field; the server reads the user's stored preference
// at routing time. We mirror that handshake when an OpenAI-style request
// includes `reasoning_effort` (or a direct `providerSpecificData.thinkingEffort`
// override).
//
// Cached per (cookie, slug, effort): the preference persists server-side, so
// re-PATCHing the same combination is wasted bytes. Refreshed on TTL expiry or
// whenever the caller switches efforts.

const thinkingEffortCache = new Map<string, number>();
const THINKING_EFFORT_TTL_MS = 5 * 60 * 1000;
const THINKING_EFFORT_CACHE_MAX = 400;

/** chatgpt.com only exposes the thinking-effort toggle on dedicated thinking
 * models and the o-series. PATCHing for a non-thinking surface is a no-op
 * (the server accepts it but the routing-time read picks the wrong knob).
 *
 * Three branches because the input can arrive in three shapes:
 *   1. OmniRoute dot-form id (`gpt-5.4-thinking-mini`) — every thinking
 *      variant carries the literal "thinking" substring here.
 *   2. Resolved chatgpt.com slug containing "thinking" (`gpt-5-5-thinking`).
 *   3. Resolved chatgpt.com slug that drops the substring under abbreviation
 *      (`gpt-5-4-t-mini`). Looked up via THINKING_CAPABLE_SLUGS, which is
 *      derived from MODEL_MAP itself so adding a new abbreviated thinking
 *      mapping automatically extends the check.
 *
 * Branch 3 also catches the case where a caller passes the chatgpt.com slug
 * directly as the `model` field (no MODEL_MAP translation needed), which
 * would otherwise silently bypass the PATCH. */
function isThinkingCapableModel(modelId: string, slug: string): boolean {
  return (
    modelId.includes("thinking") ||
    modelId === "o3" ||
    slug.includes("thinking") ||
    THINKING_CAPABLE_SLUGS.has(slug) ||
    THINKING_CAPABLE_SLUGS.has(modelId)
  );
}

/** Map either a chatgpt.com-native value (`standard`/`extended`) or the
 * OpenAI Chat Completions `reasoning_effort` field to the value the
 * `user_last_used_model_config` endpoint expects.
 *
 *   minimal | low | medium | standard  → standard
 *   high    | xhigh | extended         → extended
 *
 * `medium` collapses to `standard` because chatgpt.com only has two levels —
 * there is no separate medium tier on the web product. Returns null for
 * absent/unknown inputs. */
function normalizeThinkingEffort(input: unknown): "standard" | "extended" | null {
  if (typeof input !== "string") return null;
  const v = input.trim().toLowerCase();
  if (v === "extended" || v === "high" || v === "xhigh") return "extended";
  if (v === "standard" || v === "low" || v === "medium" || v === "minimal") {
    return "standard";
  }
  return null;
}

/** Resolve the requested effort for this turn.
 * Order: `providerSpecificData.thinkingEffort` (raw override, takes
 * `standard`/`extended` directly) > `body.reasoning_effort` (top-level OpenAI
 * Chat Completions field) > `body.reasoning.effort` (Responses-API nesting).
 * Returns null when the caller did not request one. */
function resolveThinkingEffort(
  body: unknown,
  providerSpecificData: Record<string, unknown> | undefined
): "standard" | "extended" | null {
  if (providerSpecificData && providerSpecificData.thinkingEffort !== undefined) {
    return normalizeThinkingEffort(providerSpecificData.thinkingEffort);
  }
  const b = (body as Record<string, unknown> | null) ?? null;
  if (!b) return null;
  const top = normalizeThinkingEffort(b.reasoning_effort);
  if (top) return top;
  const nested = (b.reasoning as Record<string, unknown> | undefined)?.effort;
  return normalizeThinkingEffort(nested);
}

async function setUserThinkingEffort(
  modelSlug: string,
  effort: "standard" | "extended",
  accessToken: string,
  accountId: string | null,
  sessionId: string,
  deviceId: string,
  cookie: string,
  signal: AbortSignal | null | undefined,
  log:
    | {
        debug?: (tag: string, msg: string) => void;
        warn?: (tag: string, msg: string) => void;
      }
    | null
    | undefined
): Promise<void> {
  const cacheKey = `${cookieKey(cookie)}:${modelSlug}:${effort}`;
  const now = Date.now();
  const last = thinkingEffortCache.get(cacheKey);
  if (last && now - last < THINKING_EFFORT_TTL_MS) {
    log?.debug?.("CGPT-WEB", `thinking_effort cached (${modelSlug}=${effort}) — skip PATCH`);
    return;
  }
  if (thinkingEffortCache.size >= THINKING_EFFORT_CACHE_MAX && !thinkingEffortCache.has(cacheKey)) {
    const first = thinkingEffortCache.keys().next().value;
    if (first) thinkingEffortCache.delete(first);
  }

  const url =
    `${USER_LAST_USED_MODEL_CONFIG_URL}` +
    `?model_slug=${encodeURIComponent(modelSlug)}` +
    `&thinking_effort=${encodeURIComponent(effort)}`;
  const headers: Record<string, string> = {
    ...browserHeaders(),
    ...oaiHeaders(sessionId, deviceId),
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    Cookie: buildSessionCookieHeader(cookie),
    Priority: "u=4",
  };
  if (accountId) headers["chatgpt-account-id"] = accountId;

  try {
    const r = await tlsFetchChatGpt(url, {
      method: "PATCH",
      headers,
      timeoutMs: 15_000,
      signal,
    });
    if (r.status >= 400) {
      log?.warn?.(
        "CGPT-WEB",
        `thinking_effort PATCH ${r.status} for ${modelSlug}=${effort} (continuing)`
      );
      return;
    }
    thinkingEffortCache.set(cacheKey, now);
    log?.debug?.("CGPT-WEB", `thinking_effort PATCH OK (${modelSlug}=${effort})`);
  } catch (err) {
    log?.warn?.(
      "CGPT-WEB",
      `thinking_effort PATCH failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

