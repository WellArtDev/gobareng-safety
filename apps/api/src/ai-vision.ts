// AI-P — deskripsi vision foto SOS via model Meta yang sama dengan ai.ts
// (Meta Muse Spark Open via sponsor, endpoint chat-completions yang
// kompatibel OpenAI). Pola yang dipertahankan dari ai.ts: env yang
// sama (META_MODEL_API_KEY/BASE/NAME), timeout 20 detik, fail-soft
// AI_NOT_CONFIGURED (503, env kosong) dan AI_UPSTREAM_ERROR (502).
//
// Perbedaan dari ringkasan trip: inputnya GAMBAR, bukan teks — foto
// dibaca dari disk dan dikirim sebagai data URL base64 di pesan
// image_url, karena endpoint model remote tidak bisa mengunduh URL
// /uploads lokal. Prompt mengunci faktualitas: hanya kondisi yang
// TERLIHAT di foto, maksimal 3 kalimat, tanpa mengarang fakta dan
// tanpa saran medis/diagnosis. Fungsi ini TIDAK PERNAH mengarang
// deskripsi: gagal = lempar ApiError, dan pemanggil (sos-photos.ts)
// menyimpannya sebagai aiStatus UNAVAILABLE dengan deskripsi null.
import { readFile } from "node:fs/promises";
import { aiConfigured } from "./ai.js";
import { config } from "./config.js";
import { ApiError } from "./errors.js";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 500;

export interface VisionResult {
  description: string;
  model: string;
}

const SYSTEM_PROMPT =
  "Kamu asisten safety posko GoBareng. Deskripsikan kondisi darurat yang TERLIHAT di foto " +
  "dalam Bahasa Indonesia, maksimal 3 kalimat, HANYA dari apa yang tampak di foto — jangan " +
  "mengarang fakta, jangan menebak lokasi/identitas/penyebab yang tidak terlihat, jangan " +
  "memberi saran medis atau diagnosis. Fokus pada hal yang membantu penolong: kondisi orang, " +
  "kendaraan, jalan, cuaca, dan bahaya yang tampak.";

export async function describeSosPhoto(
  photoPath: string,
  context: { kind: string; reason: string },
): Promise<VisionResult> {
  if (!aiConfigured()) throw new ApiError(503, "AI_NOT_CONFIGURED");
  let base64: string;
  try {
    base64 = (await readFile(photoPath)).toString("base64");
  } catch {
    throw new ApiError(502, "AI_UPSTREAM_ERROR");
  }
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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Foto SOS (${context.kind}, alasan ${context.reason}). Deskripsikan kondisi yang terlihat.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const description = body.choices?.[0]?.message?.content?.trim();
    if (!description) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    return { description, model: config.metaModelName };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "AI_UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
