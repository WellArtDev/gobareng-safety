// SET-7: penilaian trip high-risk (keputusan Wella 1 Nov 2026).
// BUKAN approval admin — trip tetap bebas dibuat; app hanya memberi
// tahu pembuatnya. High-risk bila SALAH SATU terpenuhi:
//   PEAK_ELEVATION  puncak >= 3.000 mdpl (dari katalog gunung §10)
//   DURATION        durasi >= 3 hari
//   PARTICIPANTS    peserta/kuota >= 20
//   RAINFALL        curah hujan pada tanggal trip (Open-Meteo daily,
//                   hanya bila tanggal <= 7 hari ke depan; data
//                   muncak.id ditunda pasca-hackathon)
//   FEMALE_MAJORITY anggota mayoritas perempuan (>50% dari yang
//                   mengisi gender)
// Kriteria jalur: pemicu BELUM diputuskan — tidak dinilai.
// difficultyKey: DISKIP (keputusan eksplisit).
// Server mengirim kode reason, bukan teks UI (§19).
import type { Db } from "./db.js";

export const HIGH_RISK_ELEVATION_M = 3000;
export const HIGH_RISK_DURATION_DAYS = 3;
export const HIGH_RISK_PARTICIPANTS = 20;
// Open-Meteo daily forecast menjangkau ~16 hari; keputusan memakai
// jendela 7 hari — tanggal lebih jauh tidak dinilai hujan (bukan aman,
// hanya belum bisa dinilai; klien menampilkan itu dari assessedAt).
export const RAINFALL_FORECAST_WINDOW_DAYS = 7;
// Ambang "curah hujan" — prakiraan harian >= 1 mm dianggap hujan.
export const RAINFALL_THRESHOLD_MM = 1;

export type RiskReason =
  | "PEAK_ELEVATION"
  | "DURATION"
  | "PARTICIPANTS"
  | "RAINFALL"
  | "FEMALE_MAJORITY";

export interface RiskAssessment {
  highRisk: boolean;
  reasons: RiskReason[];
  assessedAt: string;
  // RAINFALL hanya dinilai bila tanggal dalam jendela forecast.
  rainfallAssessed: boolean;
}

export interface RiskInput {
  date: string;
  mountainId?: string | null;
  durationDays?: number | null;
  quota?: number | null;
  // Koordinat untuk forecast hujan (meeting point / basecamp).
  lat?: number | null;
  lon?: number | null;
  // Gender anggota (hanya yang mengisi); kosong = kriteria dilewati.
  genders?: ("MALE" | "FEMALE")[];
}

function daysUntil(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

async function rainfallExpected(
  lat: number,
  lon: number,
  date: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=precipitation_sum&start_date=${date}&end_date=${date}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return false;
    const json = (await res.json()) as {
      daily?: { precipitation_sum?: (number | null)[] };
    };
    const mm = json.daily?.precipitation_sum?.[0];
    return typeof mm === "number" && mm >= RAINFALL_THRESHOLD_MM;
  } catch {
    // Fail-soft: provider mati = hujan tidak dinilai, bukan error.
    return false;
  }
}

export async function assessRisk(db: Db, input: RiskInput): Promise<RiskAssessment> {
  const reasons: RiskReason[] = [];

  if (input.mountainId) {
    const mountain = await db.mountainById(input.mountainId);
    if (mountain && mountain.elevationM >= HIGH_RISK_ELEVATION_M) {
      reasons.push("PEAK_ELEVATION");
    }
  }

  if ((input.durationDays ?? 0) >= HIGH_RISK_DURATION_DAYS) {
    reasons.push("DURATION");
  }

  if ((input.quota ?? 0) >= HIGH_RISK_PARTICIPANTS) {
    reasons.push("PARTICIPANTS");
  }

  const days = daysUntil(input.date);
  const rainfallAssessed =
    typeof input.lat === "number" &&
    typeof input.lon === "number" &&
    days >= 0 &&
    days <= RAINFALL_FORECAST_WINDOW_DAYS;
  if (rainfallAssessed && (await rainfallExpected(input.lat!, input.lon!, input.date))) {
    reasons.push("RAINFALL");
  }

  const genders = input.genders ?? [];
  if (genders.length > 0) {
    const female = genders.filter((g) => g === "FEMALE").length;
    if (female / genders.length > 0.5) reasons.push("FEMALE_MAJORITY");
  }

  return {
    highRisk: reasons.length > 0,
    reasons,
    assessedAt: new Date().toISOString(),
    rainfallAssessed,
  };
}
