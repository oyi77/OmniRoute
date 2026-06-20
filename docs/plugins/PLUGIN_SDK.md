# OmniRoute Plugin SDK

> **Related guides:**
>
> - [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) — dev mode, testing, doctor, signing, lifecycle
> - [Plugin Marketplace](./PLUGIN_MARKETPLACE.md) — discover, install, and publish plugins
> - [CLI Plugin System](../dev/plugins.md) — extend the `omniroute` CLI

## Two Plugin Systems

OmniRoute has **two parallel plugin systems** that serve different purposes:

| System                     | Where it runs                                              | Purpose                                                                   | Reference                                 |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| **SDK plugins** (this doc) | In-process sandboxed VM inside the OmniRoute server        | Hook-based request/response interception (onRequest, onResponse, onError) | Below                                     |
| **CLI plugins**            | Separate Node.js process invoked by the `omniroute` binary | Add new subcommands to the CLI (like `gh extension` or `kubectl plugin`)  | [CLI Plugin Reference](../dev/plugins.md) |

You can use either or both. A typical setup might have:

- An **SDK plugin** that adds rate limiting to incoming requests
- A **CLI plugin** that extends the `omniroute health` subcommand with custom health checks

## Quick Start

```ts
import { definePlugin } from "omniroute/plugins/sdk";

export default definePlugin({
  name: "my-plugin",
  priority: 50,
  onRequest: async (ctx) => {
    console.log(`Request ${ctx.requestId} for ${ctx.model}`);
  },
  onResponse: async (ctx, response) => {
    console.log(`Response for ${ctx.requestId}`);
    return response;
  },
  onError: async (ctx, error) => {
    console.error(`Error: ${error.message}`);
  },
});
```

## API Reference

### `definePlugin(def: PluginDefinition): Plugin`

Factory function that creates a Plugin object with defaults.

**Parameters:**

- `name` (string, required) — Plugin name in kebab-case
- `priority` (number, optional, default: 100) — Lower runs first
- `onRequest` (function, optional) — Runs before chat handler
- `onResponse` (function, optional) — Runs after chat handler
- `onError` (function, optional) — Runs on handler error

### `blockRequest(response?): BlockingHookResult`

Block the request and optionally return a custom response.

```ts
onRequest: (ctx) => {
  if (!ctx.apiKeyInfo) {
    return blockRequest({ error: "Unauthorized", status: 401 });
  }
};
```

### `modifyBody(body): PluginResult`

Modify the request body before it reaches the provider.

```ts
onRequest: (ctx) => {
  return modifyBody({ ...ctx.body, temperature: 0.7 });
};
```

### `addMetadata(metadata): PluginResult`

Attach metadata to the request context.

```ts
onRequest: (ctx) => {
  return addMetadata({ source: "my-plugin", version: "1.0.0" });
};
```

## Plugin Context (`PluginContext`)

| Field        | Type                      | Description                     |
| ------------ | ------------------------- | ------------------------------- |
| `requestId`  | `string`                  | Unique request identifier       |
| `model`      | `string`                  | Requested model name            |
| `provider`   | `string`                  | Target provider ID              |
| `body`       | `Record<string, unknown>` | Request body                    |
| `apiKeyInfo` | `unknown`                 | API key info (if authenticated) |
| `metadata`   | `Record<string, unknown>` | Mutable metadata                |

## Manifest (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "your-name",
  "main": "index.js",
  "hooks": {
    "onRequest": { "enabled": true, "priority": 50 },
    "onResponse": true,
    "onError": false,
    "onActivate": true,
    "onDeactivate": true
  },
  "requires": {
    "permissions": ["network", "file-read"]
  },
  "enabledByDefault": false,
  "configSchema": {
    "apiKey": { "type": "string", "description": "API key for external service" },
    "maxRetries": { "type": "number", "min": 1, "max": 10, "default": 3 },
    "debug": { "type": "boolean", "default": false },
    "mode": { "type": "string", "enum": ["fast", "slow"], "default": "fast" }
  }
}
```

### Hook Priority

Hooks can be configured with priority (lower = runs first):

```json
{
  "hooks": {
    "onRequest": { "enabled": true, "priority": 10 },
    "onResponse": { "enabled": true, "priority": 100 }
  }
}
```

Or as simple booleans (default priority 100):

```json
{
  "hooks": {
    "onRequest": true,
    "onResponse": true
  }
}
```

## Permission System

Plugins run in an isolated child process. Access to external resources requires explicit permissions:

| Permission   | Grants                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| `network`    | `fetch`, `AbortController`, `Headers`, `Request`, `Response`                               |
| `file-read`  | `fs.readFile`, `fs.readdir`, `fs.stat` (scoped to plugin's directory)                      |
| `file-write` | `fs.writeFile`, `fs.mkdir`, `fs.rm` (scoped to plugin's directory)                         |
| `env`        | Read-only `process.env` proxy                                                              |
| `exec`       | `child_process.exec`, `child_process.execSync` (requires `OMNIROUTE_PLUGINS_ALLOW_EXEC=1`) |

Without a permission, the corresponding globals are simply not available.

## Config Schema

Define configurable settings in `configSchema`:

```json
{
  "configSchema": {
    "apiKey": { "type": "string", "description": "External API key" },
    "maxRetries": { "type": "number", "min": 1, "max": 10, "default": 3 },
    "debug": { "type": "boolean", "default": false },
    "mode": { "type": "string", "enum": ["fast", "slow"], "default": "fast" }
  }
}
```

Field types: `string`, `number`, `boolean`, `select`

Field options: `default`, `min`, `max`, `enum`, `description`

Config values are persisted in the database and accessible via the dashboard config page.

## Built-in Events

Current supported hooks (see `src/lib/plugins/hooks.ts` `BUILTIN_EVENTS`):

| Event             | When                                      | Payload                       |
| ----------------- | ----------------------------------------- | ----------------------------- |
| `onRequest`       | Before chat handler                       | Request context               |
| `onResponse`      | After chat handler                        | Response data                 |
| `onError`         | On handler error                          | Error object                  |
| `onInstall`       | Plugin installed                          | `{ name, version, manifest }` |
| `onActivate`      | Plugin activated                          | `{ name, version, manifest }` |
| `onDeactivate`    | Plugin deactivated                        | `{ name, version, manifest }` |
| `onUninstall`     | Plugin uninstalled (before files deleted) | `{ name, version, manifest }` |

> **Note:** Routing and stream events (`onModelSelect`, `onComboResolve`, `onRateLimit`, `onStreamStart`, `onStreamEnd`) are planned for future releases but are not yet wired into the plugin pipeline. Use `onRequest` and `onResponse` for request-level interception today.

## Examples

### Request Logger

```ts
import { definePlugin } from "omniroute/plugins/sdk";

export default definePlugin({
  name: "request-logger",
  onRequest: async (ctx) => {
    console.log(`[${new Date().toISOString()}] ${ctx.model} -> ${ctx.provider || "unknown"}`);
  },
});
```

### Rate Limiter

```ts
import { definePlugin, blockRequest } from "omniroute/plugins/sdk";

const requests = new Map<string, number[]>();

export default definePlugin({
  name: "rate-limiter",
  priority: 10,
  onRequest: async (ctx) => {
    const key = ctx.requestId || "anonymous";
    const now = Date.now();
    const window = 60000;
    const maxRequests = 100;

    const timestamps = (requests.get(key) || []).filter((t) => t > now - window);
    timestamps.push(now);
    requests.set(key, timestamps);

    if (timestamps.length > maxRequests) {
      return blockRequest({ error: "Rate limit exceeded", status: 429 });
    }
  },
});
```
