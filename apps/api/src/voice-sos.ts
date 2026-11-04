// AI-V — klasifikasi alasan SOS dari transkrip suara.
//
// Dua lapis, keduanya jujur soal sumbernya:
//  1. AI (Meta Muse Spark Open, chat-completions seperti ai.ts):
//     dipakai HANYA bila META_MODEL_API_KEY + META_MODEL_API_BASE
//     diset; balasan di luar daftar kandidat -> null (bukan alasan
//     palsu). Respons route menyertakan `model` hanya bila lapis ini
//     yang mengklasifikasi — klien menampilkan atribusi
//     "Built with Muse Spark Open" hanya bila `model` ada (pola yang
//     sama dengan ai-summary di trips.ts).
//  2. Keyword fallback (murni, tanpa AI): selalu tersedia, dipakai
//     bila AI tidak dikonfigurasi / gagal. Urutan aturan = severitas
//     (EMERGENCY dulu) supaya "tersesat dan kaki luka" -> CEDERA.
//     Cocokkan substring sederhana Bahasa Indonesia; klien SELALU
//     bisa mengganti alasan di layar konfirmasi, jadi salah klasifikasi
//     tidak pernah langsung mengirim SOS yang salah.
import {
  GENERAL_SOS_REASONS,
  SOS_REASONS,
  type GeneralSosReason,
  type SosReason,
  type TripType,
} from "./store.js";

interface Rule {
  keys: string[];
  trip?: SosReason;
  general?: GeneralSosReason;
}

// Urutan = severitas menurun. Aturan tanpa pemetaan untuk satu sisi
// dilewati di sisi itu (bukan dipaksa ke alasan yang salah maknanya).
const RULES: Rule[] = [
  { keys: ["kecelakaan", "tabrak"], trip: "KECELAKAAN", general: "KECELAKAAN_LALU_LINTAS" },
  { keys: ["cedera", "luka", "jatuh", "patah", "berdarah"], trip: "CEDERA" },
  { keys: ["ambulans", "ambulance"], trip: "MEDIS", general: "BUTUH_AMBULANS" },
  { keys: ["sesak", "pingsan", "napas", "sakit mendadak", "serangan jantung"], trip: "MEDIS", general: "SAKIT_MENDADAK" },
  { keys: ["tersesat", "nyasar", "hilang arah", "tidak tahu jalan"], trip: "TERSESAT" },
  { keys: ["kebakaran", "terbakar"], general: "KEBAKARAN" },
  { keys: ["begal", "rampok", "maling", "kejahatan", "dirampok", "ditodong"], general: "KEJAHATAN" },
  { keys: ["banjir", "pohon tumbang", "longsor"], general: "BANJIR_POHON_TUMBANG" },
  { keys: ["mogok", "mesin mati", "motor rusak", "kendaraan mogok", "mobil mogok"], trip: "MOTOR_RUSAK", general: "KENDARAAN_MOGOK" },
  { keys: ["bensin habis", "bahan bakar habis"], trip: "BENSIN_HABIS", general: "BAN_BOCOR_BENSIN_HABIS" },
  { keys: ["ban bocor", "ban kempes"], trip: "BAN_BOCOR", general: "BAN_BOCOR_BENSIN_HABIS" },
];

function lowered(transcript: string): string {
  return transcript.toLowerCase();
}

export function detectTripReason(transcript: string, tripType: TripType): SosReason {
  const text = lowered(transcript);
  const allowed = SOS_REASONS[tripType];
  for (const rule of RULES) {
    if (!rule.trip || !allowed.includes(rule.trip)) continue;
    if (rule.keys.some((k) => text.includes(k))) return rule.trip;
  }
  return "LAINNYA";
}

export function detectGeneralReason(transcript: string): GeneralSosReason {
  const text = lowered(transcript);
  for (const rule of RULES) {
    if (!rule.general || !GENERAL_SOS_REASONS.includes(rule.general)) continue;
    if (rule.keys.some((k) => text.includes(k))) return rule.general;
  }
  return "BUTUH_BANTUAN_SEGERA";
}

const META_TIMEOUT_MS = 20_000;

export interface MetaClassification {
  reason: string;
  model: string;
}

function metaEnv(): { apiKey: string; apiBase: string; model: string } {
  return {
    apiKey: process.env.META_MODEL_API_KEY ?? "",
    apiBase: process.env.META_MODEL_API_BASE ?? "",
    model: process.env.META_MODEL_NAME ?? "muse-spark-open",
  };
}

/**
 * Klasifikasi via Meta Muse Spark Open. Fail-soft total: tidak
 * dikonfigurasi / upstream gagal / balasan di luar kandidat -> null.
 * Tidak pernah melempar — route jatuh ke keyword fallback.
 */
export async function classifyWithMeta(
  transcript: string,
  candidates: readonly string[],
): Promise<MetaClassification | null> {
  const env = metaEnv();
  if (!env.apiKey || !env.apiBase) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.apiBase.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model: env.model,
        max_tokens: 50,
        messages: [
          {
            role: "system",
            content:
              "Kamu klasifikasi darurat. Balas HANYA satu kode dari daftar berikut, tanpa kata lain: " +
              candidates.join(", "),
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reason = body.choices?.[0]?.message?.content?.trim();
    if (!reason || !candidates.includes(reason)) return null;
    return { reason, model: env.model };
  } catch (error) {
    // Fail-soft: AI gagal = fallback keyword. Debug saja, bukan error —
    // upstream mati bukan kesalahan server ini.
    console.debug("[api] classifyWithMeta failed, keyword fallback", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
