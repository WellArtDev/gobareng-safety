// Logika dashboard leader — murni, dites unit: statistik tim mockup
// (SOS ditangani / baterai <20% / hilang sinyal) + persen headcount.
// Ambang sinyal selaras config server (signalLossMinutes).
import type { MemberPosition } from "./locations-api";
import type { Attendance, TripMember } from "./trips-api";

export const LOW_BATTERY_THRESHOLD = 20;
export const SIGNAL_LOSS_MS = 10 * 60_000;

export interface TeamStats {
  sosCount: number;
  lowBattery: number;
  signalLost: number;
}

export function teamStats(
  positions: MemberPosition[],
  sosCount: number,
): TeamStats {
  const now = Date.now();
  let lowBattery = 0;
  let signalLost = 0;
  for (const p of positions) {
    if (p.location === null) {
      signalLost += 1;
      continue;
    }
    if (now - Date.parse(p.location.ts) > SIGNAL_LOSS_MS) signalLost += 1;
    const battery = p.location.batteryLevel;
    if (battery !== null && battery !== undefined && battery < LOW_BATTERY_THRESHOLD) {
      lowBattery += 1;
    }
  }
  return { sosCount, lowBattery, signalLost };
}

export function headcountPercent(departed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((departed / total) * 100);
}

// Status layar Dashboard Leader — satu-satunya penentu apa yang
// dirender, supaya layar tidak pernah tampil cangkang kosong 0/0
// diam-diam: "loading" selama muat pertama, "error" bila muat gagal
// dan belum ada trip sama sekali, "ready" bila trip sudah ada
// (error polling susulan hanya jadi banner, data lama tetap tampil).
// Keputusan muat Dashboard Leader saat posisi/attendance gagal —
// diuji murni, dipakai leader.tsx supaya layar tidak pernah tampil
// kosong diam-diam:
// - muat pertama gagal (posisi dan/atau attendance): layar error
//   penuh + tombol muat ulang; JANGAN fallback []/null (itulah yang
//   tampil sebagai header 0/0 + daftar kosong di screenshot 16:34);
// - polling susulan gagal: pertahankan data lama + banner peringatan;
// - tidak ada yang gagal: tampil normal.
export type LeaderLoadOutcome = "error" | "banner" | "ok";

export function leaderLoadOutcome(args: {
  everLoaded: boolean;
  positionsFailed: boolean;
  attendanceFailed: boolean;
}): LeaderLoadOutcome {
  const partial = args.positionsFailed || args.attendanceFailed;
  if (partial && !args.everLoaded) return "error";
  if (partial) return "banner";
  return "ok";
}

// Check-in titik kumpul di layar Leader — satu-satunya leader per
// trip, jadi pencariannya cukup dari peran, tanpa perlu id viewer:
// - findLeaderMember: anggota LEADER (undefined bila daftar null /
//   kosong / tanpa LEADER — layar tetap jalan, tombol tetap tampil);
// - leaderCheckInState: "arrived" bila leader sudah DEPARTED (tombol
//   nonaktif, idempotent terhadap check-in dari detail trip maupun
//   otomatis-Berangkat Start Trip), "checking" saat request berjalan,
//   "ready" bila belum — termasuk saat daftar anggota gagal dimuat
//   (null): tombol tetap bisa ditekan karena POST check-in server
//   idempotent (set DEPARTED berulang = hasil sama, tanpa error).
export function findLeaderMember(
  members: TripMember[] | null,
): TripMember | undefined {
  return members?.find((m) => m.role === "LEADER");
}

export type LeaderCheckInState = "arrived" | "checking" | "ready";

export function leaderCheckInState(args: {
  leaderAttendance: Attendance | null;
  checkingIn: boolean;
}): LeaderCheckInState {
  if (args.checkingIn) return "checking";
  if (args.leaderAttendance === "DEPARTED") return "arrived";
  return "ready";
}

export type LeaderScreenState = "loading" | "error" | "ready";

export function leaderScreenState(args: {
  loaded: boolean;
  hasTrip: boolean;
  hasError: boolean;
}): LeaderScreenState {
  if (!args.loaded) return "loading";
  if (args.hasError && !args.hasTrip) return "error";
  return "ready";
}
