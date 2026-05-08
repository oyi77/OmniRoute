import { getCliRuntimeStatus, CLI_TOOL_IDS } from "../../../shared/services/cliRuntime";
import { detectAllTools } from "../tool-detector";

export type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  category: string;
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, string>;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  passed: number;
  warnings: number;
  errors: number;
  timestamp: number;
}

export async function runDoctorChecks(verbose: boolean = false): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  let passed = 0;
  let warnings = 0;
  let errors = 0;

  // Check 1: OmniRoute Server
  try {
    const response = await fetch("http://localhost:20128/api/health", { method: "GET" }).catch(
      () => null
    );
    if (response?.ok) {
      checks.push({ category: "Server", name: "OmniRoute", status: "pass", message: "Running" });
      passed++;
    } else {
      checks.push({
        category: "Server",
        name: "OmniRoute",
        status: "fail",
        message: "Not responding",
      });
      errors++;
    }
  } catch {
    checks.push({
      category: "Server",
      name: "OmniRoute",
      status: "fail",
      message: "Not running (run 'omniroute' to start)",
    });
    errors++;
  }

  // Check 2: CLI Tools
  const toolStatus = await getCliRuntimeStatus();
  for (const tool of toolStatus) {
    const status: CheckStatus =
      tool.installed && tool.configured ? "pass" : tool.installed ? "warn" : "fail";
    const message = tool.installed
      ? tool.configured
        ? "Configured"
        : "Not configured (run 'omniroute setup')"
      : "Not installed";

    checks.push({
      category: "CLI Tools",
      name: tool.id,
      status,
      message,
      details: verbose
        ? { version: tool.version || "unknown", configPath: tool.configPath }
        : undefined,
    });

    if (status === "pass") passed++;
    else if (status === "warn") warnings++;
    else errors++;
  }

  // Check 3: Data directory
  const dataDir = process.env.DATA_DIR || `${process.env.HOME}/.omniroute`;
  try {
    const { access } = await import("fs/promises");
    await access(dataDir);
    checks.push({
      category: "Storage",
      name: "Data Directory",
      status: "pass",
      message: `Found: ${dataDir}`,
    });
    passed++;
  } catch {
    checks.push({
      category: "Storage",
      name: "Data Directory",
      status: "warn",
      message: `Not found: ${dataDir}`,
    });
    warnings++;
  }

  return {
    checks,
    passed,
    warnings,
    errors,
    timestamp: Date.now(),
  };
}

export async function fixIssues(): Promise<{ fixed: string[]; failed: string[] }> {
  const fixed: string[] = [];
  const failed: string[] = [];

  // Auto-fix logic would go here
  // For now, just report what could be fixed

  return { fixed, failed };
}
