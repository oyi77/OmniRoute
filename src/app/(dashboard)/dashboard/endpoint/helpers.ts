export const BUILD_TIME_CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL || null;
export const CLOUD_ACTION_TIMEOUT_MS = 15000;

export type TranslationValues = Record<string, string | number | boolean | Date>;
export type CloudflaredTunnelPhase =
  | "unsupported"
  | "not_installed"
  | "stopped"
  | "starting"
  | "running"
  | "error";

export type CloudflaredTunnelStatus = {
  supported: boolean;
  installed: boolean;
  managedInstall: boolean;
  installSource: string | null;
  binaryPath: string | null;
  running: boolean;
  pid: number | null;
  publicUrl: string | null;
  apiUrl: string | null;
  targetUrl: string;
  phase: CloudflaredTunnelPhase;
  lastError: string | null;
  logPath: string;
};

export type TailscaleTunnelPhase =
  | "unsupported"
  | "not_installed"
  | "needs_login"
  | "stopped"
  | "running"
  | "error";

export type TailscaleTunnelStatus = {
  supported: boolean;
  installed: boolean;
  managedInstall: boolean;
  installSource: string | null;
  binaryPath: string | null;
  loggedIn: boolean;
  daemonRunning: boolean;
  running: boolean;
  enabled: boolean;
  tunnelUrl: string | null;
  apiUrl: string | null;
  phase: TailscaleTunnelPhase;
  platform: string;
  brewAvailable: boolean;
  lastError: string | null;
  pid: number | null;
};

export type NgrokTunnelPhase =
  | "unsupported"
  | "not_installed"
  | "stopped"
  | "needs_auth"
  | "starting"
  | "running"
  | "error";

export type NgrokTunnelStatus = {
  supported: boolean;
  installed: boolean;
  running: boolean;
  publicUrl: string | null;
  apiUrl: string | null;
  targetUrl: string;
  phase: NgrokTunnelPhase;
  lastError: string | null;
};

export type TunnelNotice = {
  type: "success" | "error" | "info";
  message: string;
};

export type APIPageClientProps = {
  machineId: string;
};

export type EndpointProviderSummary = {
  id: string;
  provider: {
    name: string;
    alias?: string;
  };
};

export type EndpointModelSummary = {
  id: string;
  owned_by?: string;
  parent?: string;
  type?: string;
  custom?: boolean;
  root?: string;
};

export type CopyHandler = (text: string, key?: string) => void | Promise<void>;

export type EndpointTunnelVisibility = {
  showCloudflaredTunnel: boolean;
  showTailscaleFunnel: boolean;
  showNgrokTunnel: boolean;
};

export type EndpointTab = "apis" | "mcp" | "a2a" | "context-sources";

export const ENDPOINT_TABS: Array<{ value: EndpointTab; label: string; icon: string }> = [
  { value: "apis", label: "APIs", icon: "api" },
  { value: "mcp", label: "MCP", icon: "extension" },
  { value: "a2a", label: "A2A", icon: "hub" },
  { value: "context-sources", label: "Context Sources", icon: "database" },
];

export const DEFAULT_TUNNEL_VISIBILITY: EndpointTunnelVisibility = {
  showCloudflaredTunnel: true,
  showTailscaleFunnel: true,
  showNgrokTunnel: true,
};

export function runEndpointBackgroundTask(taskName: string, task: () => Promise<unknown>) {
  void task().catch((error) => {
    console.log("Error running endpoint background task:", taskName, error);
  });
}
