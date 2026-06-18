# OmniRoute Plugin System

Welcome to the **OmniRoute Plugin System**! This guide is split into two sections: one for **Non-Tech users** (administrators and dashboard users) and one for **Tech users** (developers who want to build their own plugins).

---

## 👩‍💼 For Non-Tech Users (Administrators)

### What are Plugins?
Plugins are small "apps" you can install inside OmniRoute to give it new superpowers without changing any of the core software. Want to add an automatic Welcome Banner to your API responses? Track how much money each API call costs? Or automatically swap expensive AI models to cheap ones when prompts get too long? Plugins do exactly that!

### How to use the Plugin Dashboard
1. **Open the Dashboard:** Go to your OmniRoute dashboard and click on **Plugins** in the sidebar.
2. **Scan for Plugins:** OmniRoute scans the local `data/plugins/` directory for installed plugins.
3. **Activate & Configure:** Click **Activate** to turn a plugin on. You can configure plugin settings (for example, setting the maximum allowed tokens) directly from the UI without writing any code.
4. **Marketplace** (planned): A browsable Marketplace with one-click install is on the roadmap.

### Custom Marketplaces
If your company has private, in-house plugins, you can tell OmniRoute to download plugins from your own servers instead of the official marketplace. Just paste your custom URL into the **Custom Marketplace URL** field on the Marketplace tab!

---

## 👨‍💻 For Tech Users (Developers)

The OmniRoute Plugin System runs plugins in isolated **child processes** via `child_process.spawn`. Plugins are loaded by a lightweight host that imports and calls their exported hook functions. Capabilities (network, filesystem, database) are declared in the manifest's `permissions` block and enforced when plugins opt into the sandboxed worker runtime. Plugins intercept the lifecycle of LLM requests through asynchronous event hooks.

### Plugin Architecture
A plugin is a folder containing two files:
1. `plugin.json` (The Manifest)
2. `index.mjs` (The Code)

### Lifecycle Hooks
Plugins can export any of the following lifecycle hooks in `index.mjs`:
- `onRequest(ctx)`: Fires before an LLM request is sent. Return `{ body, metadata }` to modify the request — mutations to the `ctx` object itself do not propagate.
- `onResponse(ctx, response)`: Fires when the LLM response comes back. You can mutate the HTML, headers, or JSON body.
- `onError(ctx, error)`: Fires if the provider fails.
- `onActivate(ctx)` / `onDeactivate(ctx)`: Fired during lifecycle state changes.
- `onModelSelect`: Planned for a future release (not yet supported; use `onRequest` to rewrite `body.model` instead).

### Plugin Capabilities & Permissions
By default, plugins run with **no permissions**. They cannot read files, make network requests, or access the database. To request capabilities, add them to your `plugin.json` manifest:

```json
{
  "name": "my-advanced-plugin",
  "requires": {
    "permissions": ["network", "db"]
  }
}
```

**Available Permissions** (enforced via the sandboxed worker runtime; the default child-process loader provides process-level isolation):
- `"network"`: Injects the global `fetch()`, `Request`, `Response`, and `Headers` objects.
- `"db"`: Injects a global `db` object providing a persistent, isolated Key-Value store using OmniRoute's SQLite database (backed by `src/lib/db/pluginKv.ts`).
  - `db.set(key, value)`
  - `db.get(key)`
  - `db.delete(key)`
  - `db.list()` (returns an array of keys)
- `"file-read"` / `"file-write"`: Gives access to a sandboxed `fs` object scoped *only* to your plugin's directory.
- `"env"`: Exposes the system's `process.env`.

### The 3 Example Plugins

We have provided three example plugins in the `examples/plugins/` directory to help you get started:

#### 1. The Simple Plugin (`welcome-banner`)
**Goal:** Learn how to inject static data into requests.
This plugin simply intercepts `onRequest` and injects a "Welcome to OmniRoute" string into the request metadata. It is the perfect Hello World.

#### 2. The UI Plugin (`theme-manager`)
**Goal:** Learn how to mutate `onResponse` bodies.
This plugin intercepts HTML responses and dynamically injects a `<style>` tag containing CSS variables (Dark Mode vs Light Mode) based on the user request headers.

#### 3. The Advanced Plugin (`smart-router`)
**Goal:** Learn how to build an intelligent cost-saving router.
This plugin hooks into `onRequest` to count the approximate token length of the user prompt and evaluate it against the configured threshold. If the prompt exceeds the threshold, the plugin re-routes the request to a cheaper fallback model (e.g. `gpt-3.5-turbo`) by returning a modified `body.model`.

### How to test a local plugin
1. Copy your plugin folder into the `data/plugins/` directory (the default local plugin storage).
2. Go to the dashboard Plugins page and click **Scan for Plugins**.
3. Activate your plugin and view your console logs!

*Security Note:* The `ctx` object passed to hooks is deeply cloned via IPC serialization. You cannot access `fs`, `process.env`, or `child_process` natively unless explicitly granted via the Plugin Manifest `permissions` block.
