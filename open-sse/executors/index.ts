import { AntigravityExecutor } from "./cli/antigravity";
import { GeminiCLIExecutor } from "./oauth/geminiCli";
import { GithubExecutor } from "./oauth/github";
import { QoderExecutor } from "./oauth/qoder";
import { KiroExecutor } from "./cli/kiro";
import { CodexExecutor } from "./oauth/codex";
import { CursorExecutor } from "./oauth/cursor";
import { TraeExecutor } from "./cli/trae";
import { DefaultExecutor } from "./base/default";
import { BedrockExecutor } from "./enterprise/bedrock";
import { GlmExecutor } from "./enterprise/glm";
import { PollinationsExecutor } from "./enterprise/pollinations";
import { CloudflareAIExecutor } from "./enterprise/cloudflareAi";
import { OpencodeExecutor } from "./cli/opencode";
import { PuterExecutor } from "./enterprise/puter";
import { VertexExecutor } from "./enterprise/vertex";
import { CliproxyapiExecutor } from "./enterprise/cliproxyapi";
import { NineRouterExecutor } from "./cli/ninerouter";
import { PerplexityWebExecutor } from "./web/perplexityWeb";
import { GrokWebExecutor } from "./web/grokWeb";
import { GeminiWebExecutor } from "./web/geminiWeb";
import { GeminiBusinessExecutor } from "./web/geminiBusiness";
import { ChatGptWebExecutor } from "./web/chatgptWeb";
import { BlackboxWebExecutor } from "./web/blackboxWeb";
import { MuseSparkWebExecutor } from "./web/museSparkWeb";
import { AzureOpenAIExecutor } from "./enterprise/azureOpenai";
import { CommandCodeExecutor } from "./cli/commandCode";
import { GitlabExecutor } from "./oauth/gitlab";
import { NlpCloudExecutor } from "./enterprise/nlpcloud";
import { WindsurfExecutor } from "./oauth/windsurf";
import { DevinCliExecutor } from "./cli/devinCli";
import { DeepSeekWebExecutor } from "./web/deepseekWeb";
import { DeepSeekWebWithAutoRefreshExecutor } from "./web/deepseekWebAutoRefresh";
import { AdaptaWebExecutor } from "./web/adaptaWeb";
import { ClaudeWebWithAutoRefresh } from "./web/claudeWebAutoRefresh";
import { CopilotWebExecutor } from "./web/copilotWeb";
import { VeoAIFreeWebExecutor } from "./web/veoaifreeWeb";
import { DuckDuckGoWebExecutor } from "./web/duckduckgoWeb";
import { T3ChatWebExecutor } from "./web/t3ChatWeb";
import { ClaudeWebExecutor } from "./web/claudeWeb";
import { InnerAiExecutor } from "./web/innerAi";
import { HuggingChatExecutor } from "./web/huggingchat";
import { PhindExecutor } from "./web/phind";
import { PoeWebExecutor } from "./web/poeWeb";
import { VeniceWebExecutor } from "./web/veniceWeb";
import { V0VercelWebExecutor } from "./web/v0VercelWeb";
import { KimiWebExecutor } from "./web/kimiWeb";
import { DoubaoWebExecutor } from "./web/doubaoWeb";
import { QwenWebExecutor } from "./web/qwenWeb";
import { KimiExecutor } from "./oauth/kimi"
import { TheOldLlmExecutor } from "./cli/theoldllm";
import { ChipotleExecutor } from "./web/chipotle";
import { LMArenaExecutor } from "./enterprise/lmarena";

const executors = {
  antigravity: new AntigravityExecutor(),
  agy: new AntigravityExecutor(),
  "gemini-cli": new GeminiCLIExecutor(),
  github: new GithubExecutor(),
  qoder: new QoderExecutor(),
  kiro: new KiroExecutor(),
  "amazon-q": new KiroExecutor("amazon-q"),
  bedrock: new BedrockExecutor(),
  codex: new CodexExecutor(),
  cursor: new CursorExecutor(),
  trae: new TraeExecutor(),
  glm: new GlmExecutor("glm"),
  "glm-cn": new GlmExecutor("glm-cn"),
  glmt: new GlmExecutor("glmt"),
  cu: new CursorExecutor(), // Alias for cursor
  "azure-openai": new AzureOpenAIExecutor(),
  "command-code": new CommandCodeExecutor(),
  cmd: new CommandCodeExecutor(), // Alias
  gitlab: new GitlabExecutor(),
  "gitlab-duo": new GitlabExecutor("gitlab-duo"),
  nlpcloud: new NlpCloudExecutor(),
  pollinations: new PollinationsExecutor(),
  pol: new PollinationsExecutor(), // Alias
  "cloudflare-ai": new CloudflareAIExecutor(),
  cf: new CloudflareAIExecutor(), // Alias
  "opencode-zen": new OpencodeExecutor("opencode-zen"),
  "opencode-go": new OpencodeExecutor("opencode-go"),
  opencode: new OpencodeExecutor("opencode-zen"), // Alias for opencode-zen
  puter: new PuterExecutor(),
  pu: new PuterExecutor(), // Alias
  vertex: new VertexExecutor(),
  "vertex-partner": new VertexExecutor(),
  cliproxyapi: new CliproxyapiExecutor(),
  cpa: new CliproxyapiExecutor(), // Alias
  "9router": new NineRouterExecutor(),
  nr: new NineRouterExecutor(), // Alias
  "perplexity-web": new PerplexityWebExecutor(),
  "pplx-web": new PerplexityWebExecutor(), // Alias
  "grok-web": new GrokWebExecutor(),
  "claude-web": new ClaudeWebWithAutoRefresh(),
  "cw-web": new ClaudeWebWithAutoRefresh(), // Alias
  "gemini-web": new GeminiWebExecutor(),
  gweb: new GeminiWebExecutor(), // Alias
  "gemini-business": new GeminiBusinessExecutor(),
  gembiz: new GeminiBusinessExecutor(), // Alias
  "chatgpt-web": new ChatGptWebExecutor(),
  "cgpt-web": new ChatGptWebExecutor(), // Alias
  "blackbox-web": new BlackboxWebExecutor(),
  "bb-web": new BlackboxWebExecutor(), // Alias
  "muse-spark-web": new MuseSparkWebExecutor(),
  "ms-web": new MuseSparkWebExecutor(), // Alias
  windsurf: new WindsurfExecutor(),
  ws: new WindsurfExecutor(), // Alias
  "devin-cli": new DevinCliExecutor(),
  devin: new DevinCliExecutor(), // Alias
  "deepseek-web": new DeepSeekWebWithAutoRefreshExecutor(),
  "ds-web": new DeepSeekWebWithAutoRefreshExecutor(), // Alias
  "adapta-web": new AdaptaWebExecutor(),
  "adp-web": new AdaptaWebExecutor(), // Alias
  "copilot-web": new CopilotWebExecutor(),
  copilot: new CopilotWebExecutor(), // Alias
  "veoaifree-web": new VeoAIFreeWebExecutor(),
  "veo-free": new VeoAIFreeWebExecutor(), // Alias
  "duckduckgo-web": new DuckDuckGoWebExecutor(),
  ddgw: new DuckDuckGoWebExecutor(), // Alias
  "t3-web": new T3ChatWebExecutor(),
  t3chat: new T3ChatWebExecutor(), // Alias
  "inner-ai": new InnerAiExecutor(),
  "in-ai": new InnerAiExecutor(), // Alias
  huggingchat: new HuggingChatExecutor(),
  hc: new HuggingChatExecutor(), // Alias
  phind: new PhindExecutor(),
  ph: new PhindExecutor(), // Alias
  "poe-web": new PoeWebExecutor(),
  poe: new PoeWebExecutor(), // Alias
  "venice-web": new VeniceWebExecutor(),
  ven: new VeniceWebExecutor(), // Alias
  "v0-vercel-web": new V0VercelWebExecutor(),
  v0: new V0VercelWebExecutor(), // Alias
  "kimi-web": new KimiWebExecutor(),
  kimi: new KimiWebExecutor(), // Alias
  "kimi-coding-apikey": new KimiExecutor(), // Alias
  "kimi-coding": new KimiExecutor(), // Alias
  "doubao-web": new DoubaoWebExecutor(),
  db: new DoubaoWebExecutor(), // Alias
  "qwen-web": new QwenWebExecutor(),
  qw: new QwenWebExecutor(), // Alias
  theoldllm: new TheOldLlmExecutor(),
  tllm: new TheOldLlmExecutor(), // Alias
  chipotle: new ChipotleExecutor(),
  pepper: new ChipotleExecutor(), // Alias
  lmarena: new LMArenaExecutor(),
  lma: new LMArenaExecutor(), // Alias
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base/base";
export { AntigravityExecutor } from "./cli/antigravity";
export { GeminiCLIExecutor } from "./oauth/geminiCli";
export { GithubExecutor } from "./oauth/github";
export { QoderExecutor } from "./oauth/qoder";
export { KiroExecutor } from "./cli/kiro";
export { CodexExecutor } from "./oauth/codex";
export { CursorExecutor } from "./oauth/cursor";
export { TraeExecutor } from "./cli/trae";
export { DefaultExecutor } from "./base/default";
export { BedrockExecutor } from "./enterprise/bedrock";
export { GlmExecutor } from "./enterprise/glm";
export { PollinationsExecutor } from "./enterprise/pollinations";
export { CloudflareAIExecutor } from "./enterprise/cloudflareAi";
export { OpencodeExecutor } from "./cli/opencode";
export { PuterExecutor } from "./enterprise/puter";
export { CliproxyapiExecutor } from "./enterprise/cliproxyapi";
export { NineRouterExecutor } from "./cli/ninerouter";
export { VertexExecutor } from "./enterprise/vertex";
export { PerplexityWebExecutor } from "./web/perplexityWeb";
export { GrokWebExecutor } from "./web/grokWeb";
export { GeminiWebExecutor } from "./web/geminiWeb";
export { KieExecutor } from "./web/kie";
export { ChatGptWebExecutor } from "./web/chatgptWeb";
export { BlackboxWebExecutor } from "./web/blackboxWeb";
export { MuseSparkWebExecutor } from "./web/museSparkWeb";
export { AzureOpenAIExecutor } from "./enterprise/azureOpenai";
export { CommandCodeExecutor } from "./cli/commandCode";
export { GitlabExecutor } from "./oauth/gitlab";
export { NlpCloudExecutor } from "./enterprise/nlpcloud";
export { WindsurfExecutor } from "./oauth/windsurf";
export { DevinCliExecutor } from "./cli/devinCli";
export { CopilotWebExecutor } from "./web/copilotWeb";
export { VeoAIFreeWebExecutor } from "./web/veoaifreeWeb";
export { DuckDuckGoWebExecutor } from "./web/duckduckgoWeb";
export { ClaudeWebExecutor } from "./web/claudeWeb";
export { DeepSeekWebExecutor } from "./web/deepseekWeb";
export { DeepSeekWebWithAutoRefreshExecutor } from "./web/deepseekWebAutoRefresh";
export { AdaptaWebExecutor } from "./web/adaptaWeb";
export { T3ChatWebExecutor } from "./web/t3ChatWeb";
export { InnerAiExecutor } from "./web/innerAi";
export { QwenWebExecutor } from "./web/qwenWeb";
export { TheOldLlmExecutor } from "./cli/theoldllm";
export { ChipotleExecutor } from "./web/chipotle";
export { LMArenaExecutor } from "./enterprise/lmarena";
