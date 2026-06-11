/**
 * Plugin SDK — typed API for plugin developers.
 *
 * Provides `definePlugin()` factory and re-exports all types needed
 * to build OmniRoute plugins.
 *
 * @module plugins/sdk
 */

import type {
  Plugin,
  PluginContext,
  PluginResult,
  BlockingHookResult,
} from "./hooks.ts";

export type { Plugin, PluginContext, PluginResult, BlockingHookResult };

// ── Plugin Definition Helper ──

export interface PluginDefinition {
  /** Plugin name (kebab-case) */
  name: string;
  /** Priority (lower = runs first, default 100) */
  priority?: number;
  /** Start enabled? (default true) */
  enabled?: boolean;
  /** Hook: runs before chat handler. Can block or modify request. */
  onRequest?: (ctx: PluginContext) => Promise<PluginResult | void> | PluginResult | void;
  /** Hook: runs after chat handler. Can modify response. */
  onResponse?: (ctx: PluginContext, response: unknown) => Promise<unknown | void> | unknown | void;
  /** Hook: runs on handler error. Can recover or re-throw. */
  onError?: (ctx: PluginContext, error: Error) => Promise<unknown | void> | unknown | void;
  /** Hook: receives IPC messages from other plugins via broadcast/sendTo. */
  onPluginMessage?: (payload: { source: string; event: string; data: unknown }) => void | Promise<void>;
  /** Hook: renders a dashboard page. Returns HTML string or structured content. */
  onRender?: (payload: { slug: string; params?: Record<string, unknown> }) =>
    { type: string; [key: string]: unknown } | Promise<{ type: string; [key: string]: unknown }>;
}

/**
 * IPC API available as globalThis.__omniroute inside plugin sandboxes.
 * Only available when the plugin has "ipc" permission in its manifest.
 */
export interface PluginIpcApi {
  /** Broadcast an event to all active plugins. */
  broadcast: (event: string, data: unknown) => void;
  /** Send a message to a specific plugin by name. */
  sendTo: (target: string, event: string, data: unknown) => void;
}

/**
 * Database API available as globalThis.__omniroute.db inside plugin sandboxes.
 * Only available when the plugin has "db" permission in its manifest.
 * Each plugin's data is isolated to its own namespace (plugin:{name}).
 */
export interface PluginDbApi {
  /** Get a value by key. Returns the parsed value or undefined. */
  get: (key: string) => unknown;
  /** Set a value by key. Values are JSON-serialized automatically. */
  set: (key: string, value: unknown) => void;
  /** Delete a key. */
  delete: (key: string) => void;
  /** List all keys in the plugin's namespace. */
  list: () => string[];
}

/**
 * Filesystem API available inside plugin sandboxes.
 * Only available when the plugin has "file-read" / "file-write" permission.
 * All paths are scoped to the plugin's own directory.
 */
export interface PluginFsApi {
  readFile: (path: string, encoding?: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  writeFile?: (path: string, data: string) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
  rm?: (path: string) => Promise<void>;
}

/**
 * The full sandbox API available to plugins at runtime.
 */
export interface PluginSandbox {
  /** IPC messaging API (requires "ipc" permission). */
  omniroute: PluginIpcApi;
  /** Database API (requires "db" permission). */
  db?: PluginDbApi;
  /** Scoped filesystem API (requires "file-read"/"file-write" permissions). */
  fs?: PluginFsApi;
  /** console.log/warn/error forwarded to OmniRoute logs. */
  console: Console;
}

/**
 * Define an OmniRoute plugin with type safety.
 *
 * @example
 * ```ts
 * import { definePlugin } from "omniroute/plugins/sdk";
 *
 * export default definePlugin({
 *   name: "my-plugin",
 *   priority: 50,
 *   onRequest: async (ctx) => {
 *     console.log(`Request ${ctx.requestId} for ${ctx.model}`);
 *   },
 *   onResponse: async (ctx, response) => {
 *     console.log(`Response for ${ctx.requestId}`);
 *     return response;
 *   },
 */
export function definePlugin(def: PluginDefinition): Plugin {
  return {
    name: def.name,
    priority: def.priority ?? 100,
    enabled: def.enabled ?? true,
    onRequest: def.onRequest,
    onResponse: def.onResponse,
    onError: def.onError,
    onPluginMessage: def.onPluginMessage,
    onRender: def.onRender,
  };
}

// ── Utility Helpers ──

/**
 * Block a request with a 403 response.
 */
export function blockRequest(response?: unknown): PluginResult {
  return { blocked: true, response };
}

/**
 * Modify the request body.
 */
export function modifyBody(body: unknown): PluginResult {
  return { body };
}

/**
 * Add metadata to the request context.
 */
export function addMetadata(metadata: Record<string, unknown>): PluginResult {
  return { metadata };
}
