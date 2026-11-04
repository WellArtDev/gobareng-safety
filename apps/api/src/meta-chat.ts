// Klien chat Meta Model API (Muse Spark Open, OpenAI-compatible)
// untuk fitur AI-Q. Sengaja modul kecil terpisah dari ai.ts supaya
// tes bisa men-stub SATU titik ini (pola otp-delivery) tanpa
// menyentuh ringkasan safety S4. Fail-soft sama seperti ai.ts:
// env kosong = 503 AI_NOT_CONFIGURED, upstream gagal = 502.
import { aiConfigured } from "./ai.js";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 1000;

export async function metaChat(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; model: string }> {
  if (!aiConfigured()) throw new ApiError(503, "AI_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.metaModelApiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.metaModelApiKey}`,
      },
      body: JSON.stringify({
        model: config.metaModelName,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    return { content, model: config.metaModelName };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "AI_UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
