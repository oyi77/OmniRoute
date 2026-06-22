import type { RegistryEntry } from "../../shared.ts";

export const llm7Provider: RegistryEntry = {
  id: "llm7",
  alias: "llm7",
  format: "openai",
  executor: "default",
  baseUrl: "https://api.llm7.io/v1/chat/completions",
  modelsUrl: "https://api.llm7.io/v1/models",
  authType: "apikey",
  authHeader: "bearer",
  poolConfig: {
    minSessions: 1,
    maxSessions: 3,
    cooldownBase: 2000,
    cooldownMax: 5000,
    cooldownJitter: 100,
    requestTimeout: 30000,
    requestJitter: 50,
  },
  models: [
    { id: "codestral-latest", name: "Codestral (LLM7)", contextLength: 32000, toolCalling: true },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash (LLM7)", contextLength: 1000000, toolCalling: true, supportsReasoning: true },
    { id: "devstral-small-2:24b", name: "Devstral Small 24B (LLM7)", contextLength: 384000, toolCalling: true },
    { id: "kimi-k2.6", name: "Kimi K2.6 (LLM7)", contextLength: 240000, toolCalling: true, supportsReasoning: true },
    { id: "minimax-m2.7", name: "MiniMax M2.7 (LLM7)", contextLength: 180000, toolCalling: true },
    { id: "qwen3-235b", name: "Qwen3 235B (LLM7)", contextLength: 240000, toolCalling: true },
  ],
};
