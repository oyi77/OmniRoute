import { getCliRuntimeStatus, CLI_TOOL_IDS } from "../../shared/services/cliRuntime";

export interface DetectedTool {
  id: string;
  name: string;
  installed: boolean;
  command: string;
  version?: string;
  configPath: string;
  configured: boolean;
}

export interface DetectionResult {
  tools: DetectedTool[];
  timestamp: number;
}

export async function detectAllTools(): Promise<DetectionResult> {
  const runtimeStatus = await getCliRuntimeStatus();

  const toolInfo: Record<string, { name: string; command: string }> = {
    claude: { name: "Claude Code", command: "claude" },
    codex: { name: "Codex CLI", command: "codex" },
    droid: { name: "Droid CLI", command: "droid" },
    openclaw: { name: "OpenClaw", command: "openclaw" },
    cursor: { name: "Cursor", command: "cursor" },
    windsurf: { name: "Windsurf", command: "windsurf" },
    cline: { name: "Cline", command: "cline" },
    kilo: { name: "Kilo Code", command: "kilocode" },
    continue: { name: "Continue", command: "continue" },
    opencode: { name: "OpenCode", command: "opencode" },
    qoder: { name: "Qoder", command: "qoder" },
    qwen: { name: "Qwen CLI", command: "qwen" },
  };

  const tools: DetectedTool[] = CLI_TOOL_IDS.map((id) => {
    const status = runtimeStatus.find((s) => s.id === id);
    const info = toolInfo[id] || { name: id, command: id };

    return {
      id,
      name: info.name,
      installed: status?.installed ?? false,
      command: info.command,
      version: status?.version,
      configPath: status?.configPath || "",
      configured: status?.configured ?? false,
    };
  });

  return {
    tools,
    timestamp: Date.now(),
  };
}

export async function detectTool(toolId: string): Promise<DetectedTool | null> {
  const result = await detectAllTools();
  return result.tools.find((t) => t.id === toolId) || null;
}
