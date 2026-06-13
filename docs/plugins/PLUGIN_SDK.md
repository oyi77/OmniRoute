# OmniRoute Plugin SDK

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
- `onPluginMessage` (function, optional) — Receives IPC messages from other plugins via `__omniroute.broadcast()` / `__omniroute.sendTo()`
- `onRender` (function, optional) — Renders a dashboard page when a user visits the plugin's admin page

### `blockRequest(response?): BlockingHookResult`

Block the request and optionally return a custom response.

```ts
onRequest: (ctx) => {
  if (!ctx.headers["authorization"]) {
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

| Field       | Type                      | Description               |
| ----------- | ------------------------- | ------------------------- |
| `requestId` | `string`                  | Unique request identifier |
| `model`     | `string`                  | Requested model name      |
| `provider`  | `string`                  | Target provider ID        |
| `body`      | `Record<string, unknown>` | Request body              |
| `headers`   | `Record<string, string>`  | Request headers           |
| `metadata`  | `Record<string, unknown>` | Mutable metadata          |
| `timestamp` | `number`                  | Request timestamp         |

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
    "onError": false
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
| `db`         | `__omniroute.db` — persistent key-value store (SQLite-backed, isolated per plugin)         |
| `ipc`        | `__omniroute.broadcast()` / `__omniroute.sendTo()` — cross-plugin messaging                |

Without a permission, the corresponding globals are simply not available.

## IPC Messaging

Plugins can communicate with each other using the global `__omniroute` API. Requires `"ipc"` permission.

- `__omniroute.broadcast(event, data)` — Send a message to ALL active plugins
- `__omniroute.sendTo(targetPluginName, event, data)` — Send a message to a specific plugin

Receiving plugin exports:

```ts
export function onPluginMessage(payload) {
  // payload = { source: "sender-plugin", event: "eventName", data: { ... } }
  console.log(`Received "${payload.event}" from ${payload.source}`);
}
```

## Database (Key-Value Store)

Plugins can persist data across restarts using a built-in SQLite-backed key-value store. Requires `"db"` permission.
Each plugin's data is isolated to its own namespace — no two plugins can read each other's data.

```ts
// Global API available inside plugin sandbox (child process)
__omniroute.db.set("myKey", { any: "JSON-serializable value" });
const val = __omniroute.db.get("myKey"); // returns parsed value
__omniroute.db.delete("myKey");
const keys = __omniroute.db.list(); // all keys for this plugin
```

## UI Extensibility (Admin Pages)

Plugins can register custom pages in the OmniRoute dashboard sidebar. Declare them in `plugin.json`:

```json
{
  "adminPages": [
    { "slug": "dashboard", "title": "My Plugin", "icon": "extension", "position": 10 },
    { "slug": "settings", "title": "Settings", "parent": "my-plugin-dashboard" }
  ]
}
```

The plugin exports `onRender` to serve page content:

```ts
export function onRender(payload) {
  const { slug, params } = payload;
  if (slug === "dashboard") {
    return {
      type: "html",
      html: "<h1>Plugin Dashboard</h1><p>Welcome!</p>",
    };
  }
}
```

Registered pages appear in the sidebar "Plugins" section automatically. The sidebar fetches `/api/plugins/ui-extensions` on mount and renders dynamic menu items.

## Dashboard Widgets

Plugins can declare dashboard widgets in their manifest:

```json
{
  "dashboardWidgets": [
    { "id": "my-stats", "title": "Usage Stats", "position": "top", "width": "half" }
  ]
}
```

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

| Event             | When                                      | Payload                                                |
| ----------------- | ----------------------------------------- | ------------------------------------------------------ |
| `onRequest`       | Before chat handler                       | Request context                                        |
| `onResponse`      | After chat handler                        | Response data                                          |
| `onError`         | On handler error                          | Error object                                           |
| `onModelSelect`   | Model selected for routing                | Model info                                             |
| `onComboResolve`  | Combo routing resolved                    | Combo targets                                          |
| `onRateLimit`     | Rate limit hit                            | Limit info                                             |
| `onQuotaExhaust`  | Quota exhausted                           | Quota info                                             |
| `onProviderError` | Provider returned error                   | Error details                                          |
| `onStreamStart`   | SSE stream started                        | Stream info                                            |
| `onStreamEnd`     | SSE stream ended                          | Stream stats                                           |
| `onInstall`       | Plugin installed                          | `{ name, version, manifest }`                          |
| `onActivate`      | Plugin activated                          | `{ name, version, manifest }`                          |
| `onDeactivate`    | Plugin deactivated                        | `{ name, version, manifest }`                          |
| `onUninstall`     | Plugin uninstalled (before files deleted) | `{ name, version, manifest }`                          |
| `onPluginMessage` | IPC message from another plugin           | `{ source, event, data }`                              |
| `onRender`        | Dashboard page requested                  | `{ slug, params }` — return HTML or structured content |

## Examples

### Request Logger

```ts
import { definePlugin } from "omniroute/plugins/sdk";

export default definePlugin({
  name: "request-logger",
  onRequest: async (ctx) => {
    console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.model} -> ${ctx.provider}`);
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
    const key = ctx.headers["x-api-key"] || "anonymous";
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

### Inter-Plugin Communication

Plugin A broadcasts an event, Plugin B receives it.

**plugin-a/index.mjs:**

```ts
export function onRequest(ctx) {
  __omniroute.broadcast("request:started", { model: ctx.model, provider: ctx.provider });
}
```

**plugin-b/index.mjs:**

```ts
export function onPluginMessage(payload) {
  console.log(`Plugin B heard: ${payload.event} from ${payload.source}`);
  __omniroute.db.set("lastRequest", payload.data);
}
```

### Dashboard Admin Page with Widget

```json
{
  "name": "my-dashboard-plugin",
  "hooks": { "onRender": true },
  "adminPages": [{ "slug": "stats", "title": "Stats", "icon": "bar_chart" }],
  "dashboardWidgets": [{ "id": "quick-stats", "title": "Quick Stats", "width": "half" }]
}
```

```ts
export function onRender(payload) {
  if (payload.slug === "stats") {
    const count = __omniroute.db.get("requestCount") || 0;
    return {
      type: "html",
      html: `<h2>Request Stats</h2><p>Total requests tracked: ${count}</p>`,
    };
  }
}
```
