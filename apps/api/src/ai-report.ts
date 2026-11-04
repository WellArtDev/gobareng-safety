// AI-R — laporan pasca-trip (Meta Muse Spark Open, pola S4 yang sama
// seperti ai.ts: atribusi "Built with Muse Spark Open" dirender klien
// kapan pun `model` hadir di respons).
//
// Aturan data: facts di bawah HANYA dari query DB (anggota, kehadiran,
// check-in checkpoint, SOS per alasan). Narasi AI hanya merangkai facts
// itu — tidak ada angka/nama/detil yang dikarang server. Tanpa
// konfigurasi model = AI_NOT_CONFIGURED (503), upstream gagal =
// AI_UPSTREAM_ERROR (502); tidak ada teks laporan fallback/palsu.
import { aiConfigured } from "./ai.js";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { ApiError } from "./errors.js";
import type { Trip } from "./store.js";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 2000;

export interface ReportFacts {
  tripName: string;
  tripType: string;
  tripDate: string;
  meetingPoint: string;
  memberCount: number;
  departedCount: number;
  notDepartedCount: number;
  attendance: {
    userId: string;
    name: string;
    role: string;
    attendance: string;
    checkInCount: number;
  }[];
  checkpointCount: number;
  checkInCount: number;
  checkpoints: { name: string; checkInCount: number }[];
  sosTotal: number;
  sosByReason: { reason: string; count: number }[];
}

export async function collectReportFacts(db: Db, trip: Trip): Promise<ReportFacts> {
  const [members, checkpoints, sos] = await Promise.all([
    db.tripMembersWithUser(trip.id),
    db.tripCheckpoints(trip.id),
    db.tripSos(trip.id),
  ]);
  const checkInsPerCheckpoint = await Promise.all(
    checkpoints.map(async (cp) => ({
      name: cp.name,
      checkIns: await db.checkpointCheckIns(cp.id),
    })),
  );
  const checkInCountByUser = new Map<string, number>();
  let checkInCount = 0;
  for (const cp of checkInsPerCheckpoint) {
    checkInCount += cp.checkIns.length;
    for (const ci of cp.checkIns) {
      checkInCountByUser.set(ci.userId, (checkInCountByUser.get(ci.userId) ?? 0) + 1);
    }
  }
  const sosByReasonMap = new Map<string, number>();
  for (const s of sos) sosByReasonMap.set(s.reason, (sosByReasonMap.get(s.reason) ?? 0) + 1);
  const sosByReason = [...sosByReasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  return {
    tripName: trip.name,
    tripType: trip.type,
    tripDate: trip.date,
    meetingPoint: trip.meetingPoint,
    memberCount: members.length,
    departedCount: members.filter((m) => m.attendance === "DEPARTED").length,
    notDepartedCount: members.filter((m) => m.attendance !== "DEPARTED").length,
    attendance: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      attendance: m.attendance,
      checkInCount: checkInCountByUser.get(m.userId) ?? 0,
    })),
    checkpointCount: checkpoints.length,
    checkInCount,
    checkpoints: checkInsPerCheckpoint.map((cp) => ({
      name: cp.name,
      checkInCount: cp.checkIns.length,
    })),
    sosTotal: sos.length,
    sosByReason,
  };
}

function buildPrompt(f: ReportFacts): string {
  return [
    `Trip: ${f.tripName} (${f.tripType}), tanggal ${f.tripDate}, titik kumpul ${f.meetingPoint}.`,
    `Kehadiran: ${f.memberCount} anggota, ${f.departedCount} berangkat, ${f.notDepartedCount} belum berangkat.`,
    `Anggota: ${
      f.attendance.length === 0
        ? "tidak ada"
        : f.attendance
            .map((a) => `${a.name} (${a.role}, ${a.attendance}, ${a.checkInCount} check-in)`)
            .join(", ")
    }.`,
    `Checkpoint: ${f.checkpointCount}, total check-in ${f.checkInCount}.`,
    `Insiden SOS: ${f.sosTotal} total${
      f.sosByReason.length === 0
        ? " (tidak ada)"
        : ` — ${f.sosByReason.map((s) => `${s.reason} x${s.count}`).join(", ")}`
    }.`,
  ].join("\n");
}

const SYSTEM_PROMPT =
  "Kamu asisten posko GoBareng. Buat laporan pasca-trip dalam Bahasa Indonesia, " +
  "maksimal 8 kalimat: ringkasan perjalanan, kehadiran, dan insiden SOS bila ada. " +
  "HANYA dari data yang diberikan — jangan mengarang fakta, nama, angka, atau detail " +
  "yang tidak ada di data, jangan memberi saran medis. Bila tidak ada SOS, katakan " +
  "tidak ada insiden SOS.";

export async function generateReportNarrative(
  facts: ReportFacts,
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(facts) },
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
