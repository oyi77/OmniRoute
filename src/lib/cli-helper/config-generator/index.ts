import fs from "fs/promises";
import path from "path";
import os from "os";
import { homedir } from "os";

export interface ConfigResult {
  success: boolean;
  toolId: string;
  configPath: string;
  backupPath?: string;
  error?: string;
}

const TOOL_CONFIGS: Record<
  string,
  (baseUrl: string, apiKey: string, model?: string) => Promise<ConfigResult>
> = {
  claude: async (baseUrl, apiKey, _model) => {
    const configPath = path.join(homedir(), ".claude", "settings.json");
    const backupPath = configPath + ".backup";

    try {
      const existing = await fs.readFile(configPath, "utf8").catch(() => "{}");
      await fs.writeFile(backupPath, existing);

      const config = JSON.parse(existing);
      config.api = { omniroute: { baseUrl, apiKey } };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { success: true, toolId: "claude", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "claude", configPath, error: String(error) };
    }
  },

  codex: async (baseUrl, apiKey, _model) => {
    const configPath = path.join(homedir(), ".codex", "config.toml");
    const backupPath = configPath + ".backup";

    try {
      const existing = await fs.readFile(configPath, "utf8").catch(() => "");
      if (existing) await fs.writeFile(backupPath, existing);

      const config =
        existing || '[openai]\nbase_url = "' + baseUrl + '"\napi_key = "' + apiKey + '"\n';
      await fs.writeFile(configPath, config);
      return { success: true, toolId: "codex", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "codex", configPath, error: String(error) };
    }
  },

  opencode: async (baseUrl, apiKey, _model) => {
    const configDir = path.join(homedir(), ".config", "opencode");
    const configPath = path.join(configDir, "opencode.json");
    const backupPath = configPath + ".backup";

    try {
      await fs.mkdir(configDir, { recursive: true });
      const existing = await fs.readFile(configPath, "utf8").catch(() => "{}");
      await fs.writeFile(backupPath, existing);

      const config = JSON.parse(existing);
      config.provider = {
        omniroute: {
          name: "OmniRoute",
          options: { baseURL: baseUrl },
          auth: { type: "api-key", key: apiKey },
        },
      };

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { success: true, toolId: "opencode", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "opencode", configPath, error: String(error) };
    }
  },

  cline: async (baseUrl, apiKey, _model) => {
    const configPath = path.join(homedir(), ".cline", "data", "globalState.json");
    const backupPath = configPath + ".backup";

    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const existing = await fs.readFile(configPath, "utf8").catch(() => "{}");
      await fs.writeFile(backupPath, existing);

      const config = JSON.parse(existing);
      config.openAiBaseUrl = baseUrl;
      config.openAiApiKey = apiKey;

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { success: true, toolId: "cline", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "cline", configPath, error: String(error) };
    }
  },

  kilo: async (baseUrl, apiKey, _model) => {
    const configPath = path.join(homedir(), ".config", "kilocode", "settings.json");
    const backupPath = configPath + ".backup";

    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const existing = await fs.readFile(configPath, "utf8").catch(() => "{}");
      await fs.writeFile(backupPath, existing);

      const config = JSON.parse(existing);
      config.openAiBaseUrl = baseUrl;
      config.apiKey = apiKey;

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { success: true, toolId: "kilo", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "kilo", configPath, error: String(error) };
    }
  },

  continue: async (baseUrl, apiKey, _model) => {
    const configPath = path.join(homedir(), ".continue", "config.json");
    const backupPath = configPath + ".backup";

    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      const existing = await fs.readFile(configPath, "utf8").catch(() => "{}");
      await fs.writeFile(backupPath, existing);

      const config = JSON.parse(existing);
      if (!config.models) config.models = [];
      config.models.push({
        model: "omniroute",
        provider: "openai",
        apiBase: baseUrl,
        apiKey,
      });

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return { success: true, toolId: "continue", configPath, backupPath };
    } catch (error) {
      return { success: false, toolId: "continue", configPath, error: String(error) };
    }
  },
};

export async function generateConfig(
  toolId: string,
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<ConfigResult> {
  const generator = TOOL_CONFIGS[toolId];
  if (!generator) {
    return { success: false, toolId, configPath: "", error: `Unsupported tool: ${toolId}` };
  }
  return generator(baseUrl, apiKey, model);
}

export async function generateAllConfigs(
  tools: string[],
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<ConfigResult[]> {
  const results: ConfigResult[] = [];
  for (const toolId of tools) {
    const result = await generateConfig(toolId, baseUrl, apiKey, model);
    results.push(result);
  }
  return results;
}
