/**
 * CLI Tools Logs API — GET /api/cli-tools/logs
 *
 * Streams application logs for CLI tools. Returns newline-delimited JSON
 * when follow=true (streaming mode), or a JSON array for bounded queries.
 *
 * Query params:
 *   - follow: boolean — stream new entries as they arrive (default: false)
 *   - filter: comma-separated level filters (trace,debug,info,warn,error,fatal)
 *   - lines: max entries to return for non-follow mode (default: 500, max: 2000)
 *   - timeout: ms before aborting non-follow request (default: 30000)
 *
 * Authentication: requireCliToolsAuth (CLI tools only)
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, watch, statSync } from "fs";
import { getAppLogFilePath } from "@/lib/logEnv";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";

const LEVEL_ORDER: Record<string, number> = {
  trace: 5,
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const NUMERIC_LEVEL_MAP: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

function parseLevel(raw: string | number): string {
  return typeof raw === "number" ? NUMERIC_LEVEL_MAP[raw] || "info" : String(raw).toLowerCase();
}

function matchesFilter(entryLevel: string, filters: string[]): boolean {
  return filters.length === 0 || filters.includes(entryLevel);
}

export async function GET(req: NextRequest) {
  const authError = await requireCliToolsAuth(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const follow = searchParams.get("follow") === "true";
    const filters = (searchParams.get("filter") || "")
      .split(",")
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean);
    const lines = Math.min(parseInt(searchParams.get("lines") || "500", 10), 2000);
    const timeout = parseInt(searchParams.get("timeout") || "30000", 10);

    const logPath = getAppLogFilePath();

    if (!existsSync(logPath)) {
      return follow ? new Response("", { status: 200 }) : NextResponse.json([], { status: 200 });
    }

    if (follow) {
      const controller = new AbortController();
      const { signal } = controller;
      setTimeout(() => controller.abort(), timeout);

      try {
        let lastKnownSize = statSync(logPath).size;

        const stream = new ReadableStream({
          async start(streamController) {
            try {
              // Send existing logs
              const raw = readFileSync(logPath, "utf-8");
              for (const line of raw.trim().split("\n").filter(Boolean)) {
                if (signal.aborted) break;
                try {
                  const entry = JSON.parse(line);
                  entry.level = parseLevel(entry.level);
                  if (matchesFilter(entry.level, filters)) streamController.enqueue(`${line}\n`);
                } catch {}
              }

              // Watch for new changes
              const watcher = watch(logPath, {}, async (event) => {
                if (event !== "change") return;
                try {
                  const newSize = statSync(logPath).size;
                  if (newSize <= lastKnownSize) return;
                  lastKnownSize = newSize;

                  const raw = readFileSync(logPath, "utf-8");
                  const newLines = raw.trim().split("\n").filter(Boolean).slice(-100);
                  for (const line of newLines) {
                    if (signal.aborted) break;
                    try {
                      const entry = JSON.parse(line);
                      entry.level = parseLevel(entry.level);
                      if (matchesFilter(entry.level, filters))
                        streamController.enqueue(`${line}\n`);
                    } catch {}
                  }
                } catch (err) {
                  console.error("Log watch error:", err);
                }
              });

              return () => watcher.close();
            } catch (err) {
              streamController.error(err);
            }
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Transfer-Encoding": "chunked",
          },
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message || "Failed to stream logs" },
          { status: 500 }
        );
      }
    }

    // Non-follow mode
    const raw = readFileSync(logPath, "utf-8");
    const linesArr = raw.trim().split("\n").filter(Boolean);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const entries: any[] = [];
    for (const line of linesArr) {
      try {
        const entry = JSON.parse(line);
        const ts = entry.time || entry.timestamp;
        if (ts && new Date(ts).getTime() < oneHourAgo) continue;
        entry.level = parseLevel(entry.level);
        if (filters.length > 0 && !filters.includes(entry.level)) continue;
        entries.push(entry);
      } catch {}
    }

    return NextResponse.json(entries.slice(-lines).reverse(), {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to read logs" }, { status: 500 });
  }
}
