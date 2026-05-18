/**
 * VeoAIFreeWebExecutor — Veo AI Free Video Generation Provider
 *
 * Routes requests through veoaifree.com's WordPress AJAX API.
 * Two-step flow: generate → poll for results.
 *
 * No auth required. Rate limited to 6 requests/hour per IP.
 * Models: VEO 3.1, VEO 3.0, Seedance 2.0
 */
import { BaseExecutor, type ExecuteInput } from "./base.ts";

const BASE_URL = "https://veoaifree.com";
const AJAX_URL = `${BASE_URL}/wp-admin/admin-ajax.php`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const POLL_INTERVAL_MS = 20_000;
const MAX_POLLS = 30; // 10 minutes max

async function fetchNonce(): Promise<string> {
  const res = await fetch(BASE_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  const html = await res.text();
  const match = html.match(/nonce":"([a-f0-9]+)"/);
  if (!match) throw new Error("Failed to extract CSRF nonce from veoaifree.com");
  return match[1];
}

async function postAjax(nonce: string, params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({
    action: "veo_video_generator",
    nonce,
    ...params,
  });
  const res = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      Origin: BASE_URL,
      Referer: `${BASE_URL}/`,
    },
    body: body.toString(),
  });
  return res.text();
}

export class VeoAIFreeWebExecutor extends BaseExecutor {
  constructor() {
    super("veoaifree-web", { id: "veoaifree-web", baseUrl: BASE_URL });
  }

  async execute(input: ExecuteInput): Promise<{
    response: Response;
    url: string;
    headers: Record<string, string>;
    transformedBody: unknown;
  }> {
    const body = input.body as Record<string, unknown> | undefined;
    const model = input.model || (body?.model as string) || "veo-3.1";

    // Extract prompt from messages
    const messages = (body?.messages as Array<Record<string, unknown>>) || [];
    const userMsg = messages.filter((m) => m.role === "user").pop();
    const prompt = (userMsg?.content as string) || "";

    if (!prompt || !prompt.trim()) {
      return {
        response: new Response(JSON.stringify({ error: { message: "No prompt provided" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
        url: AJAX_URL,
        headers: {},
        transformedBody: null,
      };
    }

    // Get CSRF nonce
    let nonce: string;
    try {
      nonce = await fetchNonce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get nonce";
      return {
        response: new Response(JSON.stringify({ error: { message: msg } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
        url: BASE_URL,
        headers: {},
        transformedBody: null,
      };
    }

    // Step 1: Generate video
    let sceneData: string;
    try {
      const genResult = await postAjax(nonce, {
        prompt,
        totalVariations: "1",
        aspectRatio: "VIDEO_ASPECT_RATIO_LANDSCAPE",
        actionType: "full-video-generate",
      });
      sceneData = genResult.trim();
      if (!sceneData || sceneData === "0" || sceneData.toLowerCase().includes("error")) {
        return {
          response: new Response(
            JSON.stringify({ error: { message: `Video generation failed: ${sceneData}` } }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          ),
          url: AJAX_URL,
          headers: {},
          transformedBody: { prompt, model },
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Video generation request failed";
      return {
        response: new Response(JSON.stringify({ error: { message: msg } }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
        url: AJAX_URL,
        headers: {},
        transformedBody: { prompt, model },
      };
    }

    // Step 2: Poll for results
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      try {
        const pollResult = await postAjax(nonce, {
          sceneData,
          actionType: "final-video-results",
        });

        const trimmed = pollResult.trim();
        if (trimmed && trimmed !== "0" && !trimmed.toLowerCase().includes("error")) {
          // Parse video URLs (comma-separated or newline-separated)
          const urls = trimmed
            .split(/[,\n]/)
            .map((u: string) => u.trim())
            .filter((u: string) => u.startsWith("http"));

          if (urls.length > 0) {
            // Return as OpenAI-compatible response
            const result = {
              id: `veoaifree-${sceneData}`,
              object: "video.generation",
              created: Math.floor(Date.now() / 1000),
              model,
              data: urls.map((url: string) => ({ url, type: "video" })),
              status: "completed",
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            };

            return {
              response: new Response(JSON.stringify(result), {
                headers: { "Content-Type": "application/json" },
              }),
              url: AJAX_URL,
              headers: {},
              transformedBody: { prompt, model, sceneData, videoCount: urls.length },
            };
          }
        }
      } catch {
        // Continue polling
      }
    }

    return {
      response: new Response(
        JSON.stringify({
          error: { message: "Video generation timed out after 10 minutes" },
        }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      ),
      url: AJAX_URL,
      headers: {},
      transformedBody: { prompt, model, sceneData },
    };
  }
}
