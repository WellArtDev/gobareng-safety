// AI-L — asisten leader trip (Meta Muse Spark Open, atribusi sama
// seperti ringkasan AI trip: klien menampilkan "Built with Muse Spark
// Open" kapan pun `model` hadir di respons).
//
// Kontrak: SEMUA angka/nama di respons berasal dari DB, bukan dari
// model. Server merangkai fakta terstruktur dulu (headcount,
// pengingat check-in tertunggak, status anggota, risiko via
// assessRisk); model hanya mengubah fakta itu menjadi narasi singkat.
// Narasi bersifat opsional: bila model belum dikonfigurasi atau
// upstream gagal, endpoint tetap 200 dengan fakta lengkap +
// aiStatus eksplisit (AI_NOT_CONFIGURED / AI_UPSTREAM_ERROR) —
// alur kerja leader tidak pernah bergantung pada model.
//
// Definisi yang dipakai (didokumentasikan, bukan ditebak model):
// - hadir = attendance DEPARTED; belum check-in = NOT_DEPARTED.
// - sinyal basi = anggota DEPARTED tanpa posisi, atau posisi terakhir
//   lebih tua dari config.signalLossMinutes (10 menit).
// - pengingat CHECKPOINT = checkpoint yang SUDAH aktif (minimal satu
//   anggota check-in di sana) dan anggota DEPARTED lain belum
//   check-in di checkpoint itu. Checkpoint belum aktif tidak
//   menghasilkan pengingat (rombongan memang belum sampai).
// - SOS "terbuka" = status di luar RESOLVED / CANCELLED / FALSE_ALARM.
// - gender anggota TIDAK PERNAH masuk respons (dipakai assessRisk
//   internal saja, seperti endpoint /risk yang sudah ada).
import { aiConfigured, metaChatCompletion } from "./ai.js";
import { config } from "./config.js";
import { memberGendersOf, type Db } from "./db.js";
import { ApiError } from "./errors.js";
import { assessRisk, type RiskAssessment } from "./risk.js";
import type { Trip } from "./store.js";

export const LEADER_SYSTEM_PROMPT =
  "Kamu asisten leader trip GoBareng. Buat ringkasan singkat untuk leader dalam Bahasa Indonesia, " +
  "maksimal 5 kalimat, HANYA dari data yang diberikan — jangan mengarang fakta, jangan menebak " +
  "lokasi/kondisi yang tidak ada di data, jangan memberi saran medis. Urutkan yang butuh tindakan " +
  "leader lebih dulu: SOS terbuka, check-in tertunggak, sinyal basi, baterai rendah.";

export type OverdueKind = "MEETING_POINT" | "CHECKPOINT" | "SIGNAL_STALE";

export interface LeaderMemberStatus {
  userId: string;
  name: string;
  role: string;
  attendance: string;
  lastSeen: string | null;
  signalAgeMinutes: number | null;
  signalStale: boolean;
  batteryLevel?: number;
  checkedInCheckpointIds: string[];
  activeSos: boolean;
}

export interface OverdueCheckIn {
  userId: string;
  name: string;
  kind: OverdueKind;
  checkpointId?: string;
  checkpointName?: string;
  lastSeen?: string | null;
}

export interface LeaderCheckpoint {
  id: string;
  name: string;
  checkedInCount: number;
  missingUserIds: string[];
}

export interface LeaderFacts {
  trip: {
    id: string;
    name: string;
    type: string;
    date: string;
    meetingPoint: string;
    status: string;
    quota: number | null;
  };
  headcount: {
    total: number;
    departed: number;
    notDeparted: number;
    notDepartedUserIds: string[];
    signalStaleCount: number;
  };
  members: LeaderMemberStatus[];
  overdueCheckins: OverdueCheckIn[];
  checkpoints: LeaderCheckpoint[];
  activeSos: {
    userId: string;
    name: string;
    reason: string;
    level: string;
    status: string;
  }[];
  risk: RiskAssessment;
  generatedAt: string;
}

const SOS_OPEN = new Set(["ACTIVE", "ACKNOWLEDGED", "IN_PROGRESS"]);

export async function collectLeaderFacts(db: Db, trip: Trip): Promise<LeaderFacts> {
  const [members, latest, sosRows, checkpoints] = await Promise.all([
    db.tripMembersWithUser(trip.id),
    db.latestLocations(trip.id),
    db.tripSos(trip.id),
    db.tripCheckpoints(trip.id),
  ]);
  const checkInsByCp = new Map<string, Set<string>>();
  await Promise.all(
    checkpoints.map(async (cp) => {
      const rows = await db.checkpointCheckIns(cp.id);
      checkInsByCp.set(cp.id, new Set(rows.map((r) => r.userId)));
    }),
  );
  const now = Date.now();
  const staleAfter = config.signalLossMinutes * 60_000;
  const latestByUser = new Map(latest.map((l) => [l.userId, l]));

  const memberStatus: LeaderMemberStatus[] = members.map((m) => {
    const loc = latestByUser.get(m.userId);
    const ageMs = loc ? now - Date.parse(loc.ts) : null;
    const signalAgeMinutes =
      ageMs === null ? null : Math.max(0, Math.round(ageMs / 60_000));
    const signalStale =
      m.attendance === "DEPARTED" && (loc === undefined || ageMs! > staleAfter);
    return {
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      attendance: m.attendance,
      lastSeen: loc ? loc.ts : null,
      signalAgeMinutes,
      signalStale,
      batteryLevel: loc?.batteryLevel,
      checkedInCheckpointIds: checkpoints
        .filter((cp) => checkInsByCp.get(cp.id)?.has(m.userId))
        .map((cp) => cp.id),
      activeSos: sosRows.some(
        (s) => s.senderId === m.userId && SOS_OPEN.has(s.status),
      ),
    };
  });

  const overdue: OverdueCheckIn[] = [];
  for (const m of memberStatus) {
    if (m.attendance !== "DEPARTED") {
      overdue.push({ userId: m.userId, name: m.name, kind: "MEETING_POINT" });
      continue;
    }
    if (m.signalStale) {
      overdue.push({
        userId: m.userId,
        name: m.name,
        kind: "SIGNAL_STALE",
        lastSeen: m.lastSeen,
      });
    }
  }
  const checkpointFacts: LeaderCheckpoint[] = checkpoints.map((cp) => {
    const checkedIn = checkInsByCp.get(cp.id) ?? new Set<string>();
    const missing = memberStatus
      .filter((m) => m.attendance === "DEPARTED" && !checkedIn.has(m.userId))
      .map((m) => m.userId);
    // Hanya checkpoint aktif yang menghasilkan pengingat.
    if (checkedIn.size > 0) {
      for (const m of memberStatus) {
        if (m.attendance === "DEPARTED" && !checkedIn.has(m.userId)) {
          overdue.push({
            userId: m.userId,
            name: m.name,
            kind: "CHECKPOINT",
            checkpointId: cp.id,
            checkpointName: cp.name,
          });
        }
      }
    }
    return {
      id: cp.id,
      name: cp.name,
      checkedInCount: checkedIn.size,
      missingUserIds: missing,
    };
  });

  const risk = await assessRisk(db, {
    date: trip.date,
    durationDays: trip.durationDays,
    quota: trip.quota,
    lat: trip.meetingLat,
    lon: trip.meetingLon,
    genders: await memberGendersOf(db, trip.id),
  });

  const departed = memberStatus.filter((m) => m.attendance === "DEPARTED");
  const notDeparted = memberStatus.filter((m) => m.attendance !== "DEPARTED");
  return {
    trip: {
      id: trip.id,
      name: trip.name,
      type: trip.type,
      date: trip.date,
      meetingPoint: trip.meetingPoint,
      status: trip.status,
      quota: trip.quota,
    },
    headcount: {
      total: memberStatus.length,
      departed: departed.length,
      notDeparted: notDeparted.length,
      notDepartedUserIds: notDeparted.map((m) => m.userId),
      signalStaleCount: memberStatus.filter((m) => m.signalStale).length,
    },
    members: memberStatus,
    overdueCheckins: overdue,
    checkpoints: checkpointFacts,
    activeSos: sosRows
      .filter((s) => SOS_OPEN.has(s.status))
      .map((s) => ({
        userId: s.senderId,
        name: memberStatus.find((m) => m.userId === s.senderId)?.name ?? s.senderId,
        reason: s.reason,
        level: s.level,
        status: s.status,
      })),
    risk,
    generatedAt: new Date().toISOString(),
  };
}

// Prompt narasi: hanya angka/nama dari fakta — tidak ada data lain
// yang diberikan ke model, jadi model tidak punya bahan karangan.
export function buildLeaderPrompt(f: LeaderFacts): string {
  const overdueText =
    f.overdueCheckins.length === 0
      ? "tidak ada"
      : f.overdueCheckins
          .map(
            (o) =>
              `${o.name} (${o.kind}${o.checkpointName ? ` ${o.checkpointName}` : ""})`,
          )
          .join(", ");
  const sosText =
    f.activeSos.length === 0
      ? "tidak ada"
      : f.activeSos
          .map((s) => `${s.name} ${s.reason} (${s.level}, ${s.status})`)
          .join(", ");
  const memberText = f.members
    .map(
      (m) =>
        `${m.name}: ${m.attendance}` +
        `${m.signalStale ? ", sinyal basi" : ""}` +
        `${m.batteryLevel !== undefined && m.batteryLevel < 20 ? `, baterai ${m.batteryLevel}%` : ""}` +
        `${m.activeSos ? ", SOS terbuka" : ""}`,
    )
    .join("; ");
  return [
    `Trip: ${f.trip.name} (${f.trip.type}), status ${f.trip.status}, titik kumpul ${f.trip.meetingPoint}.`,
    `Headcount: ${f.headcount.total} total, ${f.headcount.departed} berangkat, ${f.headcount.notDeparted} belum check-in, ${f.headcount.signalStaleCount} sinyal basi.`,
    `Anggota: ${memberText || "tidak ada"}.`,
    `Check-in tertunggak: ${overdueText}.`,
    `SOS terbuka: ${sosText}.`,
    `Risiko: ${f.risk.highRisk ? `high-risk (${f.risk.reasons.join(", ") || "ya"})` : "tidak high-risk"}.`,
  ].join("\n");
}

// `chat` hanya seam tes (stub di unit test). Jalur produksi selalu
// memanggil tanpa argumen -> metaChatCompletion (Meta Muse Spark Open).
export async function summarizeLeaderBrief(
  facts: LeaderFacts,
  chat?: (system: string, user: string) => Promise<{ summary: string; model: string }>,
): Promise<{ summary: string; model: string }> {
  if (!chat && !aiConfigured()) throw new ApiError(503, "AI_NOT_CONFIGURED");
  const fn = chat ?? metaChatCompletion;
  return fn(LEADER_SYSTEM_PROMPT, buildLeaderPrompt(facts));
}
