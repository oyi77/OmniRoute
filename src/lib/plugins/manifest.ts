/**
 * Plugin manifest validator — Zod schema for plugin.json files.
 *
 * @module plugins/manifest
 */

import { z } from "zod";

// ── Permission enum ──

export const PermissionSchema = z.enum(["network", "file-read", "file-write", "env", "exec"]);
export type Permission = z.infer<typeof PermissionSchema>;

// ── Skill definition in manifest ──

export const ManifestSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
});
export type ManifestSkill = z.infer<typeof ManifestSkillSchema>;

// ── Config schema field ──

export const ConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean", "select"]),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type ConfigField = z.infer<typeof ConfigFieldSchema>;

// ── Hooks ──

const HookConfigSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().optional(),
    priority: z.number().optional(),
  }),
]);

export const HooksSchema = z.object({
  onRequest: HookConfigSchema.optional(),
  onResponse: HookConfigSchema.optional(),
  onError: HookConfigSchema.optional(),
  onBeforeInstall: z.boolean().optional(),
  onAfterInstall: z.boolean().optional(),
});

// ── Requires ──

export const RequiresSchema = z.object({
  omniroute: z.string().optional(),
  permissions: z.array(PermissionSchema).optional(),
  memoryLimitMb: z.number().min(32).max(1024).optional(),
  plugins: z.array(z.string()).optional(),
  sandboxLevel: z.number().min(0).max(3).optional(),
});

// ── Full manifest ──

export const PluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Name must be kebab-case (lowercase, hyphens only)"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semver (e.g. 1.0.0)"),
  description: z.string().max(500).optional(),
  author: z.string().max(200).optional(),
  license: z.string().optional(),
  main: z.string().optional(),
  source: z.enum(["local", "marketplace"]).optional(),
  tags: z.array(z.string()).optional(),
  requires: RequiresSchema.optional(),
  hooks: HooksSchema.optional(),
  skills: z.array(ManifestSkillSchema).optional(),
  enabledByDefault: z.boolean().optional(),
  configSchema: z.record(z.string(), ConfigFieldSchema).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ── Defaults applied after parsing ──

export interface HookConfig {
  enabled: boolean;
  priority: number;
}

export interface PluginManifestWithDefaults extends PluginManifest {
  license: string;
  main: string;
  source: "local" | "marketplace";
  tags: string[];
  requires: { omniroute?: string; permissions: Permission[]; memoryLimitMb?: number; plugins?: string[]; sandboxLevel?: number };
  hooks: { onRequest: HookConfig; onResponse: HookConfig; onError: HookConfig; onBeforeInstall: boolean; onAfterInstall: boolean };
  skills: ManifestSkill[];
  enabledByDefault: boolean;
  configSchema: Record<string, ConfigField>;
  integrity?: string;
}

function normalizeHook(value: unknown): HookConfig {
  if (typeof value === "boolean") return { enabled: value, priority: 100 };
  if (typeof value === "object" && value !== null) {
    const obj = value as { enabled?: boolean; priority?: number };
    return { enabled: obj.enabled ?? true, priority: obj.priority ?? 100 };
  }
  return { enabled: false, priority: 100 };
}

export function applyDefaults(manifest: PluginManifest): PluginManifestWithDefaults {
  return {
    ...manifest,
    license: manifest.license ?? "MIT",
    main: manifest.main ?? "index.js",
    source: manifest.source ?? "local",
    tags: manifest.tags ?? [],
    requires: {
      omniroute: manifest.requires?.omniroute,
      permissions: manifest.requires?.permissions ?? [],
      memoryLimitMb: manifest.requires?.memoryLimitMb,
      plugins: manifest.requires?.plugins,
      sandboxLevel: manifest.requires?.sandboxLevel,
    },
    hooks: {
      onRequest: normalizeHook(manifest.hooks?.onRequest),
      onResponse: normalizeHook(manifest.hooks?.onResponse),
      onError: normalizeHook(manifest.hooks?.onError),
      onBeforeInstall: manifest.hooks?.onBeforeInstall ?? false,
      onAfterInstall: manifest.hooks?.onAfterInstall ?? false,
    },
    skills: manifest.skills ?? [],
    enabledByDefault: manifest.enabledByDefault ?? false,
    configSchema: manifest.configSchema ?? {},
  };
}

// ── Config validation ──

export function validatePluginConfig(
  config: Record<string, unknown>,
  schema: Record<string, ConfigField>
): { valid: true } | { valid: false; errors: string[] } {
  if (Object.keys(schema).length === 0) return { valid: true };
  const errors: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    const field = schema[key];
    if (!field) {
      errors.push(`Unknown config key: '${key}'`);
      continue;
    }
    if (field.type === "number" && typeof value !== "number") {
      errors.push(`Config '${key}' must be a number, got ${typeof value}`);
    }
    if (field.type === "string" && typeof value !== "string") {
      errors.push(`Config '${key}' must be a string, got ${typeof value}`);
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Config '${key}' must be a boolean, got ${typeof value}`);
    }
    if (field.type === "number" && typeof value === "number") {
      if (field.min !== undefined && value < field.min) errors.push(`Config '${key}' must be >= ${field.min}`);
      if (field.max !== undefined && value > field.max) errors.push(`Config '${key}' must be <= ${field.max}`);
    }
    if (field.type === "select" && field.enum && !field.enum.includes(String(value))) {
      errors.push(`Config '${key}' must be one of: ${field.enum.join(", ")}`);
    }
  }
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

// ── Validation ──

export function validateManifest(raw: unknown): PluginManifestWithDefaults {
  const parsed = PluginManifestSchema.parse(raw);
  return applyDefaults(parsed);
}

export function safeValidateManifest(
  raw: unknown
): { success: true; data: PluginManifestWithDefaults } | { success: false; errors: string[] } {
  const result = PluginManifestSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: applyDefaults(result.data) };
  }
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
