import { NextRequest, NextResponse } from "next/server";
import { CORS_HEADERS, handleCorsOptions } from "@/shared/utils/cors";
import { getPluginByName, updatePluginConfig } from "@/lib/db/plugins";
import { z } from "zod";

export async function OPTIONS() {
  return handleCorsOptions();
}

/**
 * GET /api/plugins/[name]/config — Get plugin configuration
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const plugin = getPluginByName(name);

  if (!plugin) {
    return NextResponse.json(
      { error: `Plugin '${name}' not found` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      config: JSON.parse(plugin.config || "{}"),
      configSchema: JSON.parse(plugin.configSchema || "{}"),
    },
    { headers: CORS_HEADERS }
  );
}

/**
 * PUT /api/plugins/[name]/config — Update plugin configuration
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await request.json();

  const schema = z.object({
    config: z.record(z.string(), z.unknown()),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const plugin = getPluginByName(name);
  if (!plugin) {
    return NextResponse.json(
      { error: `Plugin '${name}' not found` },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // Validate config values against plugin's configSchema
  const configSchema = JSON.parse(plugin.configSchema || "{}");
  if (configSchema && typeof configSchema === "object") {
    const typeChecks: Record<string, (v: unknown) => boolean> = {
      string: (v) => typeof v === "string",
      number: (v) => typeof v === "number",
      boolean: (v) => typeof v === "boolean",
    };
    for (const [key, def] of Object.entries(configSchema)) {
      const val = parsed.data.config[key];
      if (val === undefined) continue;
      const fieldDef = def as Record<string, unknown>;
      const check = typeChecks[fieldDef.type as string];
      if (check && !check(val)) {
        return NextResponse.json(
          { error: `Config key '${key}' must be a ${fieldDef.type}` },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (fieldDef.enum && !(fieldDef.enum as unknown[]).includes(val)) {
        return NextResponse.json(
          { error: `Config key '${key}' must be one of: ${(fieldDef.enum as string[]).join(", ")}` },
          { status: 400, headers: CORS_HEADERS }
        );
      }
      if (fieldDef.min !== undefined) {
        const limit = fieldDef.min as number;
        const size = typeof val === "string" ? val.length : typeof val === "number" ? val : undefined;
        if (size !== undefined && size < limit) {
          return NextResponse.json(
            { error: `Config key '${key}' must be at least ${limit}${typeof val === "string" ? " characters" : ""}` },
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }
      if (fieldDef.max !== undefined && typeof val === "number" && val > (fieldDef.max as number)) {
        return NextResponse.json(
          { error: `Config key '${key}' must be at most ${fieldDef.max}` },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }
  }

  updatePluginConfig(name, parsed.data.config);

  return NextResponse.json(
    { success: true, config: parsed.data.config },
    { headers: CORS_HEADERS }
  );
}
