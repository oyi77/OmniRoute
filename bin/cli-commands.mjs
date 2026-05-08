#!/usr/bin/env node

/**
 * OmniRoute CLI - Production-grade CLI Integration Suite
 *
 * Commands:
 *   setup     - Configure CLI tools to use OmniRoute
 *   doctor    - Run health diagnostics
 *   status    - Show comprehensive status
 *   logs      - View application logs
 *   provider  - Add OmniRoute as provider for tools
 *   config    - Show current OmniRoute configuration
 *   test      - Test provider/model connectivity
 *   update    - Check for updates
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform, release } from "node:os";
import { execSync, spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BASE_URL = "http://localhost:20128";
const API_PORT = 20128;
const DASHBOARD_PORT = 20129;

const CLI_TOOLS = {
  claude: {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    configPath: ".claude/settings.json",
    type: "json",
  },
  codex: {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    configPath: ".codex/config.toml",
    type: "toml",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    configPath: ".config/opencode/opencode.json",
    type: "json",
  },
  cline: {
    id: "cline",
    name: "Cline",
    command: "cline",
    configPath: ".cline/data/globalState.json",
    type: "json",
  },
  kilo: {
    id: "kilo",
    name: "Kilo Code",
    command: "kilocode",
    configPath: ".config/kilocode/settings.json",
    type: "json",
  },
  continue: {
    id: "continue",
    name: "Continue",
    command: "continue",
    configPath: ".continue/config.json",
    type: "json",
  },
  openclaw: {
    id: "openclaw",
    name: "OpenClaw",
    command: "openclaw",
    configPath: ".openclaw/openclaw.json",
    type: "json",
  },
};

const PROVIDER_HELP = {
  opencode: `OpenCode configuration:
1. Add to ~/.config/opencode/opencode.json:
{
  "provider": {
    "omniroute": {
      "name": "OmniRoute",
      "baseURL": "http://localhost:20128/v1"
    }
  }
}
2. Set environment: export OPENAI_API_KEY=your-key`,

  cursor: `Cursor configuration:
1. Open Cursor Settings
2. Go to Models → Add Model
3. Set Base URL to: http://localhost:20128/v1
4. Set API Key to your OmniRoute key`,

  cline: `Cline configuration:
1. Open Cline Settings
2. Find "OpenAI Compatible" provider settings
3. Set Base URL: http://localhost:20128/v1
4. Set API Key: your OmniRoute key`,

  vscode: `VS Code + MCP configuration:
1. Install Cline extension
2. Or use: omniroute --mcp for MCP server`,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getHomeDir() {
  return homedir();
}

function resolveConfigPath(relativePath) {
  return join(getHomeDir(), relativePath);
}

function execCommand(command, timeout = 3000) {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.status || error.signal,
    };
  }
}

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    return false;
  }
}

function createBackup(filePath) {
  if (!existsSync(filePath)) return null;
  const backupPath = filePath + ".backup." + Date.now();
  try {
    writeFileSync(backupPath, readFileSync(filePath), "utf8");
    return backupPath;
  } catch {
    return null;
  }
}

function colorize(text, color) {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
    dim: "\x1b[2m",
  };
  return colors[color] ? `${colors[color]}${text}${colors.reset}` : text;
}

function log(message, color = "reset") {
  console.log(colorize(message, color));
}

function logSection(title) {
  console.log("\n" + colorize("┌─ " + title + " ".repeat(50), "cyan"));
}

function logEndSection() {
  console.log(colorize("└" + "─".repeat(51), "cyan"));
}

// ============================================================================
// TOOL DETECTION
// ============================================================================

function detectInstalledTools() {
  const results = [];

  for (const [id, tool] of Object.entries(CLI_TOOLS)) {
    const result = execCommand(`which ${tool.command}`, 2000);
    const installed = result.success;
    let version = null;

    if (installed) {
      const versionResult = execCommand(`${tool.command} --version`, 2000);
      if (versionResult.success) {
        version = versionResult.output.slice(0, 20);
      }
    }

    results.push({
      id,
      name: tool.name,
      installed,
      version,
      configPath: resolveConfigPath(tool.configPath),
      configured: checkToolConfigured(id),
    });
  }

  return results;
}

function checkToolConfigured(toolId) {
  const tool = CLI_TOOLS[toolId];
  if (!tool) return false;

  const configPath = resolveConfigPath(tool.configPath);

  try {
    if (!existsSync(configPath)) return false;

    const content = readFileSync(configPath, "utf8").toLowerCase();
    const hasOmniRoute =
      content.includes("omniroute") ||
      content.includes(`localhost:${API_PORT}`) ||
      content.includes(`127.0.0.1:${API_PORT}`);
    return hasOmniRoute;
  } catch {
    return false;
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function checkServerHealth() {
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getCliToolsStatusFromApi() {
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/api/cli-tools/status`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

async function getConsoleLogs(limit = 100, level = null) {
  try {
    const url = new URL(`${DEFAULT_BASE_URL}/api/logs/console`);
    url.searchParams.set("limit", String(limit));
    if (level) url.searchParams.set("level", level);

    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return [];
}

async function testProviderConnection(provider = "claude", model = "claude-sonnet-4-20250514") {
  try {
    const res = await fetch(`${DEFAULT_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-omniroute-cli-test",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, response: data.choices?.[0]?.message?.content || "OK" };
    } else {
      const error = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${error.slice(0, 100)}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CONFIG MANAGEMENT
// ============================================================================

function configureTool(toolId, baseUrl, apiKey) {
  const tool = CLI_TOOLS[toolId];
  if (!tool) {
    return { success: false, error: "Unknown tool: " + toolId };
  }

  const configPath = tool.configPath;
  const fullPath = resolveConfigPath(configPath);

  // Create backup first
  const backupPath = createBackup(fullPath);

  try {
    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Read existing config or create new
    let config = {};
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, "utf8");
      if (tool.type === "json") {
        config = JSON.parse(content);
      }
    }

    // Apply tool-specific configuration
    switch (toolId) {
      case "claude":
        config.api = config.api || {};
        config.api.omniroute = {
          baseUrl: `${baseUrl}/v1`,
          apiKey: apiKey,
          model: "claude-sonnet-4-20250514",
        };
        break;

      case "codex":
        // For TOML, we need to append/modify
        const tomlContent = `[openai]
base_url = "${baseUrl}/v1"
api_key = "${apiKey}"
model = "gpt-4o"
`;
        writeFileSync(fullPath, tomlContent, "utf8");
        return { success: true, configPath: fullPath, backupPath };

      case "opencode":
        config.provider = config.provider || {};
        config.provider.omniroute = {
          name: "OmniRoute",
          baseURL: `${baseUrl}/v1`,
          apiKey: apiKey,
        };
        break;

      case "cline":
        config.openAiBaseUrl = `${baseUrl}/v1`;
        config.openAiApiKey = apiKey;
        config.actModeApiProvider = "openai";
        config.planModeApiProvider = "openai";
        break;

      case "kilo":
        config.apiUrl = `${baseUrl}/v1`;
        config.apiKey = apiKey;
        break;

      case "continue":
        config.models = config.models || [];
        config.models.push({
          name: "OmniRoute",
          provider: "openai-compatible",
          apiKey: apiKey,
          baseUrl: `${baseUrl}/v1`,
        });
        break;

      case "openclaw":
        config.OPENAI_BASE_URL = `${baseUrl}/v1`;
        config.OPENAI_API_KEY = apiKey;
        break;
    }

    // Write JSON configs
    if (tool.type === "json") {
      writeFileSync(fullPath, JSON.stringify(config, null, 2), "utf8");
    }

    return { success: true, configPath: fullPath, backupPath };
  } catch (error) {
    // Restore backup on failure
    if (backupPath && existsSync(backupPath)) {
      try {
        writeFileSync(fullPath, readFileSync(backupPath), "utf8");
      } catch {}
    }
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CONFIG SHOW
// ============================================================================

function getOmniRouteConfig() {
  const config = {
    port: API_PORT,
    dashboardPort: DASHBOARD_PORT,
    baseUrl: `http://localhost:${API_PORT}`,
    dataDir: resolveConfigPath(".omniroute"),
    requireApiKey: process.env.REQUIRE_API_KEY === "true",
    logLevel: process.env.LOG_LEVEL || "info",
  };

  // Check for existing providers
  try {
    const dbPath = join(config.dataDir, "storage.sqlite");
    config.hasDatabase = existsSync(dbPath);
  } catch {
    config.hasDatabase = false;
  }

  // Node version
  config.nodeVersion = process.version;
  config.platform = platform();
  config.osRelease = release();

  return config;
}

// ============================================================================
// COMMAND IMPLEMENTATIONS
// ============================================================================

export async function runSubcommand(cmd, args) {
  switch (cmd) {
    case "setup":
      await runSetup(args);
      break;
    case "doctor":
      await runDoctor(args);
      break;
    case "status":
      await runStatus(args);
      break;
    case "logs":
      await runLogs(args);
      break;
    case "provider":
      await runProvider(args);
      break;
    case "config":
      await runConfig(args);
      break;
    case "test":
      await runTest(args);
      break;
    case "update":
      await runUpdate(args);
      break;
    default:
      log(`Unknown subcommand: ${cmd}`, "red");
      log("Run 'omniroute --help' for available commands", "dim");
      process.exit(1);
  }
}

async function runSetup(args) {
  const toolsArg = args.find((a) => a.startsWith("--tools="))?.split("=")[1];
  const urlArg = args.find((a) => a.startsWith("--url="))?.split("=")[1] || DEFAULT_BASE_URL;
  const keyArg =
    args.find((a) => a.startsWith("--key="))?.split("=")[1] || "sk-omniroute-cli-configured";
  const listArg = args.includes("--list");

  const baseUrl = urlArg.endsWith("/") ? urlArg.slice(0, -1) : urlArg;

  if (listArg) {
    logSection("Available CLI Tools");
    const tools = detectInstalledTools();
    for (const tool of tools) {
      const status = tool.installed
        ? tool.configured
          ? colorize("✓ configured", "green")
          : colorize("✗ not configured", "yellow")
        : colorize("✗ not installed", "red");
      log(`  ${tool.name.padEnd(14)} ${status}`);
    }
    logEndSection();
    return;
  }

  logSection("OmniRoute CLI Setup");

  // Detect installed tools
  const installed = detectInstalledTools().filter((t) => t.installed);

  if (installed.length === 0) {
    log("No CLI tools detected. Install Claude Code, Codex, OpenCode, etc.", "yellow");
    return;
  }

  log(`Found ${installed.length} installed tools:`, "dim");
  for (const tool of installed) {
    log(`  - ${tool.name}`);
  }
  console.log();

  // Determine which tools to configure
  const toolsToConfigure = toolsArg
    ? toolsArg.split(",").filter((t) => CLI_TOOLS[t])
    : installed.map((t) => t.id);

  // Configure each tool
  log(`Configuring ${toolsToConfigure.length} tool(s)...\n`, "cyan");

  let successCount = 0;
  let failCount = 0;

  for (const toolId of toolsToConfigure) {
    const tool = CLI_TOOLS[toolId];
    log(`Configuring ${tool.name}...`, "dim");

    const result = configureTool(toolId, baseUrl, keyArg);

    if (result.success) {
      log(`  ✓ Configured: ${result.configPath}`, "green");
      if (result.backupPath) {
        log(`    Backup: ${result.backupPath}`, "dim");
      }
      successCount++;
    } else {
      log(`  ✗ Failed: ${result.error}`, "red");
      failCount++;
    }
  }

  logEndSection();

  console.log();
  if (successCount > 0) {
    log(`✓ Successfully configured ${successCount} tool(s)`, "green");
  }
  if (failCount > 0) {
    log(`✗ Failed to configure ${failCount} tool(s)`, "red");
  }

  console.log();
  log("Next steps:", "cyan");
  log("  1. Test: omniroute test", "dim");
  log("  2. Status: omniroute status", "dim");
  log("  3. Start server: omniroute", "dim");
}

async function runDoctor(args) {
  const verbose = args.includes("--verbose");
  const serverRunning = await checkServerHealth();

  logSection("OmniRoute Doctor");

  // Server status
  if (serverRunning) {
    log("Server:        " + colorize("✓ Running", "green"));
    log(`API:           http://localhost:${API_PORT}/v1`);
    log(`Dashboard:     http://localhost:${DASHBOARD_PORT}`);
  } else {
    log("Server:        " + colorize("✗ Not running", "red"));
    log("Run 'omniroute' to start the server", "dim");
  }
  logEndSection();

  // CLI Tools status
  logSection("CLI Tools Status");

  let tools;
  let dataSource = "local";

  if (serverRunning) {
    const apiStatus = await getCliToolsStatusFromApi();
    if (apiStatus) {
      dataSource = "api";
      tools = Object.entries(apiStatus).map(([id, data]) => ({
        id,
        name: CLI_TOOLS[id]?.name || id,
        installed: data.installed,
        configured: data.configStatus === "configured",
        runnable: data.runnable,
      }));
    }
  }

  if (!tools) {
    tools = detectInstalledTools();
  }

  // Sort: configured first, then installed, then not installed
  tools.sort((a, b) => {
    if (a.configured && !b.configured) return -1;
    if (!a.configured && b.configured) return 1;
    if (a.installed && !b.installed) return -1;
    if (!a.installed && b.installed) return 1;
    return 0;
  });

  for (const tool of tools) {
    let status;
    if (tool.configured) {
      status = colorize("✓ configured", "green");
    } else if (tool.installed) {
      status = colorize("○ not configured", "yellow");
    } else {
      status = colorize("✗ not installed", "red");
    }
    log(`  ${tool.name.padEnd(12)} ${status}`);
  }

  console.log(
    `\n${colorize("Data source:", "dim")} ${dataSource === "api" ? "API (accurate)" : "Local detection"}`
  );
  logEndSection();

  // Recommendations
  console.log();
  const notConfigured = tools.filter((t) => t.installed && !t.configured);
  if (notConfigured.length > 0) {
    log("Recommendations:", "cyan");
    log(`  Run 'omniroute setup --tools=${notConfigured.map((t) => t.id).join(",")}' to configure`);
  }

  if (!serverRunning) {
    log("  Run 'omniroute' to start the server for full diagnostics", "dim");
  }

  if (verbose && serverRunning) {
    console.log();
    logSection("System Info");
    log(`Node:      ${process.version}`);
    log(`Platform:  ${platform()} ${release()}`);
    log(`Home:      ${getHomeDir()}`);
    log(`Data Dir:  ${resolveConfigPath(".omniroute")}`);
    logEndSection();
  }
}

async function runStatus(args) {
  const json = args.includes("--json");
  const serverRunning = await checkServerHealth();

  const config = getOmniRouteConfig();
  const tools = detectInstalledTools();
  const configuredCount = tools.filter((t) => t.configured).length;
  const installedCount = tools.filter((t) => t.installed).length;

  if (json) {
    console.log(
      JSON.stringify(
        {
          server: {
            running: serverRunning,
            port: config.port,
            url: config.baseUrl,
          },
          dashboard: `http://localhost:${config.dashboardPort}`,
          config: {
            dataDir: config.dataDir,
            requireApiKey: config.requireApiKey,
            logLevel: config.logLevel,
          },
          tools: {
            total: Object.keys(CLI_TOOLS).length,
            installed: installedCount,
            configured: configuredCount,
          },
        },
        null,
        2
      )
    );
    return;
  }

  logSection("OmniRoute Status");
  log(
    `Server:       ${serverRunning ? colorize("✓ Running", "green") : colorize("✗ Stopped", "red")}`
  );
  log(`API URL:      ${config.baseUrl}/v1`);
  log(`Dashboard:    http://localhost:${config.dashboardPort}`);
  log(`Data Dir:     ${config.dataDir}`);
  logEndSection();

  logSection("CLI Tools");
  log(`Installed:   ${installedCount}`);
  log(`Configured:  ${configuredCount}`);
  console.log();

  for (const tool of tools) {
    const icon = tool.configured
      ? colorize("●", "green")
      : tool.installed
        ? colorize("○", "yellow")
        : colorize("×", "red");
    log(`  ${icon} ${tool.name}`);
  }
  logEndSection();
}

async function runLogs(args) {
  const linesArg = args.find((a) => a.startsWith("--lines="))?.split("=")[1] || "100";
  const levelArg = args.find((a) => a.startsWith("--level="))?.split("=")[1];
  const followArg = args.includes("--follow");

  const limit = Math.min(Math.max(parseInt(linesArg) || 100, 10), 1000);
  const level = levelArg || null;

  const serverRunning = await checkServerHealth();

  if (!serverRunning) {
    log("Server not running. Start with 'omniroute'", "red");
    return;
  }

  logSection("Console Logs");
  log(`Fetching last ${limit} lines...`, "dim");
  if (level) log(`Filter: ${level}`, "dim");
  logEndSection();

  const logs = await getConsoleLogs(limit, level);

  if (logs.length === 0) {
    log("No logs found", "yellow");
    return;
  }

  for (const entry of logs) {
    const timestamp = entry.time || entry.timestamp || "";
    const lvl = entry.level || entry.severity || "info";
    const msg = entry.msg || entry.message || "";

    let color = "dim";
    if (lvl === "error" || lvl === "fatal") color = "red";
    else if (lvl === "warn") color = "yellow";
    else if (lvl === "debug") color = "dim";
    else color = "reset";

    console.log(`${colorize(timestamp.slice(0, 24), "dim")} [${lvl.slice(0, 5).padEnd(5)}] ${msg}`);
  }

  if (followArg) {
    log("\nFollowing logs (Ctrl+C to exit)...", "cyan");
    // Simple polling implementation
    let lastTime = logs[logs.length - 1]?.time || "";

    const interval = setInterval(async () => {
      const newLogs = await getConsoleLogs(50, level);
      const filtered = newLogs.filter((l) => l.time > lastTime);
      for (const entry of filtered) {
        const timestamp = entry.time || "";
        const lvl = entry.level || "info";
        const msg = entry.msg || "";
        let color = lvl === "error" ? "red" : lvl === "warn" ? "yellow" : "dim";
        console.log(
          `${colorize(timestamp.slice(0, 24), "dim")} [${lvl.slice(0, 5).padEnd(5)}] ${msg}`
        );
        lastTime = entry.time;
      }
    }, 2000);

    // Handle interrupt
    process.on("SIGINT", () => {
      clearInterval(interval);
      log("\nStopped following", "yellow");
      process.exit(0);
    });
  }
}

async function runProvider(args) {
  const action = args[0] || "list";

  if (action === "list") {
    logSection("Available Provider Integrations");
    for (const [id, name] of Object.entries({
      opencode: "OpenCode",
      cursor: "Cursor",
      cline: "Cline",
      vscode: "VS Code",
    })) {
      log(`  ${name}`);
    }
    logEndSection();
    log("\nUsage: omniroute provider add <name>", "dim");
    return;
  }

  if (action === "add") {
    const provider = args[1];
    if (!provider || !PROVIDER_HELP[provider]) {
      log(`Unknown provider: ${provider}`, "red");
      log("Available: " + Object.keys(PROVIDER_HELP).join(", "), "dim");
      return;
    }

    logSection(`Configure ${provider}`);
    console.log(PROVIDER_HELP[provider]);
    logEndSection();
    return;
  }

  log(`Unknown action: ${action}`, "red");
  log("Usage: omniroute provider [list|add <name>]", "dim");
}

async function runConfig(args) {
  const action = args[0] || "show";

  if (action === "show") {
    const config = getOmniRouteConfig();

    logSection("OmniRoute Configuration");
    log(`API Port:        ${config.port}`);
    log(`Dashboard Port:  ${config.dashboardPort}`);
    log(`Base URL:        ${config.baseUrl}`);
    log(`Data Directory: ${config.dataDir}`);
    log(`Require API Key: ${config.requireApiKey ? "Yes" : "No"}`);
    log(`Log Level:       ${config.logLevel}`);
    log(`Node Version:    ${config.nodeVersion}`);
    log(`Platform:        ${config.platform} ${config.osRelease}`);
    logEndSection();
    return;
  }

  log(`Unknown action: ${action}`, "red");
  log("Usage: omniroute config show", "dim");
}

async function runTest(args) {
  const providerArg = args.find((a) => a.startsWith("--provider="))?.split("=")[1];
  const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1];

  const serverRunning = await checkServerHealth();

  if (!serverRunning) {
    log("Server not running. Start with 'omniroute'", "red");
    return;
  }

  const provider = providerArg || "claude";
  const model = modelArg || "claude-sonnet-4-20250514";

  logSection("Testing Provider Connection");
  log(`Provider: ${provider}`);
  log(`Model:    ${model}`);
  log("Connecting...", "dim");
  console.log();

  const result = await testProviderConnection(provider, model);

  if (result.success) {
    log("✓ Connection successful!", "green");
    log(`Response: ${result.response}`, "dim");
  } else {
    log("✗ Connection failed!", "red");
    log(`Error: ${result.error}`, "yellow");
  }

  logEndSection();
}

async function runUpdate(args) {
  logSection("Checking for Updates");

  // Get current version
  try {
    const pkgPath = join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    log(`Current version: ${colorize(pkg.version, "cyan")}`);
  } catch {
    log("Current version: unknown", "yellow");
  }

  // Get latest version from npm
  log("Checking npm...", "dim");
  const npmResult = execCommand("npm view omniroute version", 10000);

  if (npmResult.success) {
    const latest = npmResult.output.trim();
    // Try to get current version again for comparison
    const pkgPath = join(ROOT, "package.json");
    const current = JSON.parse(readFileSync(pkgPath, "utf8")).version;

    console.log();
    if (latest !== current) {
      log(`Latest version:  ${colorize(latest, "green")}`);
      log(`Update available! Run:`, "yellow");
      log(`  npm install -g omniroute@latest`, "dim");
    } else {
      log(`Latest version:  ${colorize(latest, "green")}`);
      log("Already on the latest version!", "green");
    }
  } else {
    log("Could not check for updates (npm not available)", "yellow");
  }

  logEndSection();
}
