// AI trip safety summary — Meta Muse Spark Open (hackathon requirement:
// at least one Meta model; products using Spark Open must show the
// "Built with Muse Spark Open" attribution — the client renders it
// whenever `model` is present in the response).
//
// Design rules (PRD §13.3): factual only — the prompt carries real trip
// data (members, latest positions age, SOS list, checkpoints) and asks
// for a short situational summary with NO invented facts and NO medical
// advice. Fail-soft: unset env = AI_NOT_CONFIGURED, upstream error =
// AI_UPSTREAM_ERROR; the safety pipeline never depends on this call.
import { config } from "./config.js";
import type { Db } from "./db.js";
import { ApiError } from "./errors.js";
import type { SosAlert, Trip } from "./store.js";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 2000;

export function aiConfigured(): boolean {
  return Boolean(config.metaModelApiKey && config.metaModelApiBase);
}

interface TripFacts {
  trip: Trip;
  memberCount: number;
  departedCount: number;
  positions: { userName: string; ageMinutes: number; batteryLevel?: number }[];
  sos: (SosAlert & { senderName: string })[];
  checkpointCount: number;
}

export async function collectTripFacts(db: Db, trip: Trip): Promise<TripFacts> {
  const [members, latest, sosRows, checkpoints] = await Promise.all([
    db.tripMembers(trip.id),
    db.latestLocations(trip.id),
    db.tripSos(trip.id),
    db.tripCheckpoints(trip.id),
  ]);
  const now = Date.now();
  const names = new Map<string, string>();
  const nameOf = async (userId: string): Promise<string> => {
    const cached = names.get(userId);
    if (cached) return cached;
    const name = (await db.userById(userId))?.name ?? userId;
    names.set(userId, name);
    return name;
  };
  const positions = await Promise.all(
    latest.map(async (l) => ({
      userName: await nameOf(l.userId),
      ageMinutes: Math.max(0, Math.round((now - Date.parse(l.ts)) / 60_000)),
      batteryLevel: l.batteryLevel,
    })),
  );
  const sos = await Promise.all(
    sosRows.map(async (s) => ({ ...s, senderName: await nameOf(s.senderId) })),
  );
  return {
    trip,
    memberCount: members.length,
    departedCount: members.filter((m) => m.attendance === "DEPARTED").length,
    positions,
    sos,
    checkpointCount: checkpoints.length,
  };
}

// The server builds the prompt in Indonesian (dashboard default); the
// summary text itself is AI output data, not a hardcoded UI string.
function buildPrompt(f: TripFacts): string {
  const lines = [
    `Trip: ${f.trip.name} (${f.trip.type}), status ${f.trip.status}, titik kumpul ${f.trip.meetingPoint}.`,
    `Anggota: ${f.memberCount} total, ${f.departedCount} sudah berangkat. Checkpoint: ${f.checkpointCount}.`,
    `Posisi terakhir (usia menit): ${
      f.positions.length === 0
        ? "belum ada"
        : f.positions
            .map(
              (p) =>
                `${p.userName}=${p.ageMinutes}m${p.batteryLevel !== undefined ? ` bat ${p.batteryLevel}%` : ""}`,
            )
            .join(", ")
    }.`,
    `SOS: ${
      f.sos.length === 0
        ? "tidak ada"
        : f.sos.map((s) => `${s.senderName} ${s.reason} (${s.level}, ${s.status})`).join(", ")
    }.`,
  ];
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "Kamu asisten safety posko GoBareng. Buat ringkasan situasi trip dalam Bahasa Indonesia, " +
  "maksimal 4 kalimat, HANYA dari data yang diberikan — jangan mengarang fakta, jangan menebak " +
  "lokasi/kondisi yang tidak ada di data, jangan memberi saran medis. Sebutkan hal yang butuh " +
  "perhatian posko (SOS aktif, sinyal lama hilang, baterai rendah) lebih dulu.";

// Shared Meta-model chat call (OpenAI-compatible chat-completions).
// Used by the trip safety summary, the leader assistant (AI-L), and
// Glimmer (AI-G) so all keep the same fail-soft contract: 503 when
// unconfigured, 502 on any upstream failure or empty reply.
export async function metaChatCompletion(
  system: string,
  user: string,
): Promise<{ summary: string; model: string }> {
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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const summary = body.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new ApiError(502, "AI_UPSTREAM_ERROR");
    return { summary, model: config.metaModelName };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, "AI_UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

export async function summarizeTrip(
  facts: TripFacts,
): Promise<{ summary: string; model: string }> {
  return metaChatCompletion(SYSTEM_PROMPT, buildPrompt(facts));
}

// AI-G Glimmer: tanya-jawab umum asisten. BUKAN model lokal — jawaban
// selalu dari server (Meta Muse Spark Open); antrean offline hanya
// menunda pengiriman pertanyaan, bukan menjalankan AI di HP.
const GLIMMER_SYSTEM_PROMPT =
  "Kamu Glimmer, asisten GoBareng (aplikasi pendakian & touring). " +
  "Jawab dalam Bahasa Indonesia, singkat dan praktis. Hanya jawab dari " +
  "pengetahuan umum yang aman — jangan mengarang fakta spesifik " +
  "(cuaca, kondisi jalur, harga), jangan memberi saran medis, dan " +
  "sarankan pengguna memeriksa sumber resmi untuk hal keselamatan.";

export async function askGlimmer(
  message: string,
): Promise<{ answer: string; model: string }> {
  const { summary, model } = await metaChatCompletion(
    GLIMMER_SYSTEM_PROMPT,
    message,
  );
  return { answer: summary, model };
}
