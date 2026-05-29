/**
 * Plugin loader — loads plugins in sandboxed VM contexts.
 *
 * Uses Node.js vm module for in-process isolation. Plugins run in a
 * restricted context with permission-gated globals.
 *
 * @module plugins/loader
 */

import { readFile, readdir, stat, writeFile, mkdir, rm } from "fs/promises";
import { resolve } from "path";
import * as vm from "vm";
import { createHash } from "crypto";
import { logger } from "../../../open-sse/utils/logger.ts";
import type { PluginManifestWithDefaults, Permission } from "./manifest";
import type { Plugin, PluginContext, PluginResult } from "./index";

const log = logger("PLUGIN_LOADER");

/** Compute SHA-256 integrity hash for source content. */
export function computeIntegrity(source: string): string {
  return "sha256-" + createHash("sha256").update(source).digest("base64");
}

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifestWithDefaults;
  plugin: Plugin;
  cleanup: () => void;
}

/**
 * Create a sandboxed context with permission-gated globals.
 * All file operations are restricted to pluginDir.
 */
function createSandbox(permissions: Permission[], pluginDir: string): Record<string, unknown> {
  const activeTimers = new Set<ReturnType<typeof setTimeout>>();

  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => log.info("plugin.log", { args }),
      warn: (...args: unknown[]) => log.warn("plugin.warn", { args }),
      error: (...args: unknown[]) => log.error("plugin.error", { args }),
    },
    setTimeout: (fn: (...args: unknown[]) => void, ms?: number) => { const t = setTimeout(fn, ms); activeTimers.add(t); return t; },
    clearTimeout: (t: unknown) => { activeTimers.delete(t as ReturnType<typeof setTimeout>); clearTimeout(t as ReturnType<typeof setTimeout>); },
    setInterval: (fn: (...args: unknown[]) => void, ms?: number) => { const t = setInterval(fn, ms); activeTimers.add(t); return t; },
    clearInterval: (t: unknown) => { activeTimers.delete(t as ReturnType<typeof setInterval>); clearInterval(t as ReturnType<typeof setInterval>); },
    Promise,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    URIError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    URL,
    URLSearchParams,
  };

  // Buffer gated — only with file permissions (needed for binary file I/O)
  if (permissions.includes("file-read") || permissions.includes("file-write")) {
    sandbox.Buffer = Buffer;
  }

  if (permissions.includes("network")) {
    sandbox.fetch = globalThis.fetch;
    sandbox.AbortController = globalThis.AbortController;
    sandbox.Headers = globalThis.Headers;
    sandbox.Request = globalThis.Request;
    sandbox.Response = globalThis.Response;
  }

  if (permissions.includes("file-read")) {
    sandbox.fs = {
      readFile: (p: string, enc?: string) => readFile(resolve(pluginDir, p), enc as BufferEncoding),
      readdir: (p: string) => readdir(resolve(pluginDir, p)),
      stat: (p: string) => stat(resolve(pluginDir, p)),
    };
  }

  if (permissions.includes("file-write")) {
    const fs = sandbox.fs as Record<string, unknown> || {};
    fs.writeFile = (p: string, data: string) => writeFile(resolve(pluginDir, p), data);
    fs.mkdir = (p: string) => mkdir(resolve(pluginDir, p), { recursive: true });
    fs.rm = (p: string) => rm(resolve(pluginDir, p), { recursive: true, force: true });
    sandbox.fs = fs;
  }

  if (permissions.includes("env")) {
    sandbox.process = { env: new Proxy({}, {
      get: (_t, key) => typeof key === "string" ? process.env[key] : undefined,
      set: () => false,
      has: (_t, key) => typeof key === "string" ? key in process.env : false,
    }) };
  }

  if (permissions.includes("exec")) {
    sandbox.child_process = {
      exec: require("child_process").exec,
      execSync: require("child_process").execSync,
    };
  }

  // Store timer set for cleanup
  (sandbox as Record<string, unknown>).__activeTimers = activeTimers;

  return sandbox;
}

/**
 * Load a plugin entry point in a VM context.
 * Returns the exported hooks (onRequest, onResponse, onError) wrapped as a Plugin.
 */
export async function loadPlugin(
  entryPoint: string,
  manifest: PluginManifestWithDefaults
): Promise<LoadedPlugin> {
  // Verify integrity hash if declared in manifest
  const source = await readFile(entryPoint, "utf-8");
  if (manifest.integrity) {
    const hash = computeIntegrity(source);
    if (hash !== manifest.integrity) {
      throw new Error(`Plugin '${manifest.name}' integrity check failed: expected ${manifest.integrity}, got ${hash}`);
    }
  }

  const permissions = manifest.requires.permissions;
  const pluginDir = resolve(entryPoint, "..");
  const sandbox = createSandbox(permissions, pluginDir);

  // Create VM context
  const context = vm.createContext(sandbox);

  // Provide a minimal module system
  const moduleExports: Record<string, any> = {};
  const moduleObj = { exports: moduleExports };
  sandbox.module = moduleObj;
  sandbox.exports = moduleExports;
  sandbox.require = (id: string) => {
    const allowed: Record<string, unknown> = {};
    if (id === "crypto") {
      allowed.crypto = require("crypto");
    }
    if (allowed[id]) return allowed[id];
    throw new Error(`Module '${id}' is not allowed in plugin sandbox`);
  };

  try {
    const wrapped = `(async function(module, exports, require) { ${source} })(module, exports, require);`;
    vm.runInContext(wrapped, context, {
      filename: entryPoint,
      timeout: 10000,
    });
  } catch (err: any) {
    log.error("loader.vm_error", { name: manifest.name, error: err.message });
    throw new Error(`Failed to load plugin '${manifest.name}': VM execution error`);
  }

  const pluginExports = moduleObj.exports;

  // Build Plugin interface
  const hooks: string[] = [];
  const plugin: Plugin = {
    name: manifest.name,
    priority: 100,
    enabled: true,
  };

  const sources = [pluginExports];
  if (pluginExports.default && typeof pluginExports.default === "object") {
    sources.push(pluginExports.default);
  }

  for (const src of sources) {
    if (typeof src.onRequest === "function" && !plugin.onRequest) {
      const fn = src.onRequest;
      plugin.onRequest = async (ctx: PluginContext): Promise<PluginResult | void> => {
        try { return await fn(ctx); } catch (err: any) { log.error("plugin.onRequest_error", { name: manifest.name, error: err.message }); }
      };
      hooks.push("onRequest");
    }
    if (typeof src.onResponse === "function" && !plugin.onResponse) {
      const fn = src.onResponse;
      plugin.onResponse = async (ctx: PluginContext, response: any): Promise<any | void> => {
        try { return await fn(ctx, response); } catch (err: any) { log.error("plugin.onResponse_error", { name: manifest.name, error: err.message }); }
      };
      hooks.push("onResponse");
    }
    if (typeof src.onError === "function" && !plugin.onError) {
      const fn = src.onError;
      plugin.onError = async (ctx: PluginContext, error: Error): Promise<any | void> => {
        try { return await fn(ctx, error); } catch (err: any) { log.error("plugin.onError_error", { name: manifest.name, error: err.message }); }
      };
      hooks.push("onError");
    }
  }

  log.info("loader.loaded", { name: manifest.name, hooks });

  const activeTimers = sandbox.__activeTimers as Set<ReturnType<typeof setTimeout>>;
  const cleanup = () => {
    for (const t of activeTimers) {
      clearTimeout(t);
      clearInterval(t);
    }
    activeTimers.clear();
    log.info("loader.cleanup", { name: manifest.name });
  };

  return { name: manifest.name, manifest, plugin, cleanup };
}
