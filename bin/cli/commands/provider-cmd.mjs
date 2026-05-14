import { parseArgs, getStringFlag, hasFlag } from "../args.mjs";
import { printHeading, printInfo, printSuccess, printError } from "../io.mjs";
import { resolveDataDir, resolveStoragePath } from "../data-dir.mjs";
import path from "node:path";
import fs from "node:fs";
import { homedir } from "node:os";
import {
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  deleteProviderConnection,
  setDefaultProvider,
} from "../../src/lib/db/providers.js";

function printProviderHelp() {
  console.log(`
Usage:
  omniroute provider add <name> [options]    Add a provider connection
  omniroute provider list                     List configured providers
  omniroute provider remove <name|id>        Remove a provider connection
  omniroute provider test <name|id>          Test a provider connection
  omniroute provider default <name|id>       Set default provider

Options:
  --provider <id>           Provider id (e.g., openai, anthropic, omniroute)
  --api-key <key>           API key for the provider
  --provider-name <name>    Display name for the connection
  --default-model <model>   Default model to use
  --base-url <url>          Custom base URL override
  --json                    Output as JSON
  --yes                     Skip confirmation
  --help                    Show this help
`);
}

export async function runProviderCommand(argv) {
  const { flags, positionals } = parseArgs(argv);

  if (hasFlag(flags, "help") || hasFlag(flags, "h") || positionals.length === 0) {
    printProviderHelp();
    return 0;
  }

  const subcommand = positionals[0];

  if (subcommand === "add") {
    const providerName = positionals[1] || getStringFlag(flags, "provider");
    const apiKey = getStringFlag(flags, "api-key");
    const displayName = getStringFlag(flags, "provider-name");
    const defaultModel = getStringFlag(flags, "default-model");
    const baseUrl = getStringFlag(flags, "base-url");

    if (!providerName) {
      printError("Provider name required. Usage: omniroute provider add <name>");
      return 1;
    }

    if (providerName === "omniroute") {
      // Special case: add OmniRoute as a provider in OpenCode config
      const opencodePath = path.join(
        process.env.HOME || os.homedir(),
        ".config",
        "opencode",
        "opencode.json"
      );
      const { generateConfig } =
        await import("../../../src/lib/cli-helper/config-generator/index.js");
      const result = await generateConfig("opencode", {
        baseUrl: baseUrl || "http://localhost:20128/v1",
        apiKey: apiKey || "",
      });

      if (!result.success) {
        printError(result.error || "Failed to generate config");
        return 1;
      }

      if (!hasFlag(flags, "yes")) {
        console.log(`\n  About to write OpenCode config to: ${opencodePath}`);
        console.log(`  Content:\n`);
        console.log(result.content);
        console.log("");
        const readline = await import("node:readline");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => rl.question("Proceed? [y/N] ", resolve));
        rl.close();
        if (!/^y(es)?$/i.test(answer)) {
          printInfo("Aborted.");
          return 0;
        }
      }

      const dir = path.dirname(opencodePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(opencodePath, result.content, "utf-8");
      printSuccess(`OpenCode config written to ${opencodePath}`);
      return 0;
    }

    // Generic provider addition via domain module
    try {
      const result = await createProviderConnection({
        provider: providerName,
        name: displayName || providerName,
        apiKey: apiKey || "",
        defaultModel: defaultModel || null,
        providerSpecificData: baseUrl ? { baseUrl } : undefined,
        authType: "apikey",
        isActive: true,
      });

      if (!result) {
        printError("Failed to add provider — database error");
        return 1;
      }
      printSuccess(`Provider "${displayName || providerName}" added`);
    } catch (err) {
      printError(`Failed to add provider: ${err.message}`);
      return 1;
    }

    return 0;
  }

  if (subcommand === "list") {
    if (isJson()) {
      const connections = await getProviderConnections();
      console.log(JSON.stringify(connections, null, 2));
    } else {
      const connections = await getProviderConnections();
      if (connections.length === 0) {
        printInfo(
          "No database found or no providers configured. Run `omniroute setup` and add a provider."
        );
        return 0;
      }
      printHeading("Configured Providers");
      for (const conn of connections) {
        console.log(
          `  [${conn.id}] ${conn.name} (${conn.provider})${conn.defaultModel ? ` — model: ${conn.defaultModel}` : ""}`
        );
      }
    }
    return 0;
  }

  if (subcommand === "remove") {
    const target = positionals[1];
    if (!target) {
      printError("Provider name or ID required. Usage: omniroute provider remove <name|id>");
      return 1;
    }

    // Find the connection using domain module
    const isId = /^[a-f0-9-]{36}$/.test(target); // UUID format
    let connection;
    if (isId) {
      connection = await getProviderConnectionById(target);
    } else {
      const connections = await getProviderConnections({});
      connection = connections.find((c) => c.name === target || c.provider === target);
    }

    if (!connection) {
      printError("Provider not found");
      return 1;
    }

    const deleted = await deleteProviderConnection(connection.id);
    if (deleted) {
      printSuccess(`Removed provider "${connection.name}"`);
    } else {
      printError("Failed to remove provider");
      return 1;
    }
    return 0;
  }

  if (subcommand === "test") {
    const target = positionals[1];
    if (!target) {
      printError("Provider name or ID required. Usage: omniroute provider test <name|id>");
      return 1;
    }

    // Find the connection using domain module
    const isId = /^[a-f0-9-]{36}$/.test(target); // UUID format
    let connection;
    if (isId) {
      connection = await getProviderConnectionById(target);
    } else {
      const connections = await getProviderConnections({});
      connection = connections.find((c) => c.name === target || c.provider === target);
    }

    if (!connection) {
      printError("Provider not found");
      return 1;
    }

    const { testProviderApiKey } = await import("../provider-test.mjs");
    const providerSpecificData = connection.providerSpecificData
      ? typeof connection.providerSpecificData === "string"
        ? JSON.parse(connection.providerSpecificData)
        : connection.providerSpecificData
      : {};
    const result = await testProviderApiKey({
      provider: connection.provider,
      apiKey: connection.apiKey || "",
      defaultModel: connection.defaultModel || null,
      baseUrl: providerSpecificData.baseUrl || null,
    });

    if (isJson()) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.valid) {
      printSuccess(`Provider "${connection.name}" is reachable`);
    } else {
      printError(`Provider test failed: ${result.error || "unknown error"}`);
    }
    return 0;
  }

  if (subcommand === "default") {
    const target = positionals[1];
    if (!target) {
      printError("Provider name or ID required. Usage: omniroute provider default <name|id>");
      return 1;
    }

    // Find the connection using domain module
    const isId = /^[a-f0-9-]{36}$/.test(target); // UUID format
    let connection;
    if (isId) {
      connection = await getProviderConnectionById(target);
    } else {
      const connections = await getProviderConnections({});
      connection = connections.find((c) => c.name === target || c.provider === target);
    }

    if (!connection) {
      printError("Provider not found");
      return 1;
    }

    try {
      const success = await setDefaultProvider(connection.id);
      if (success) {
        printSuccess(`Default provider set to "${connection.name}"`);
      } else {
        printError("Failed to set default provider.");
        return 1;
      }
    } catch (err) {
      printError(`Error setting default provider: ${err.message}`);
      return 1;
    }
    return 0;
  }

  printError(`Unknown subcommand: ${subcommand}`);
  printProviderHelp();
  return 1;
}

function isJson() {
  return process.argv.includes("--json");
}
