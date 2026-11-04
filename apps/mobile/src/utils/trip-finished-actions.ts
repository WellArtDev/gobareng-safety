// Aturan tampil/sembunyi detail trip untuk trip selesai (CLOSED) —
// perintah Wella 3 Nov 2026 18:35 + 18:37. Dipisah sebagai fungsi murni
// supaya aturannya teruji tanpa merender layar (pola repo: logika +
// API saja di tes, layar tidak dirender).
import type { TripStatus, TripType } from "./trips-api";

// Trip selesai = status CLOSED (bukan PLANNED tanggal lewat: itu
// "Expired" tampilan, aturannya beda dan tidak diubah di sini).
export function isFinishedTrip(status: TripStatus): boolean {
  return status === "CLOSED";
}

// Form tambah checkpoint manual (leader + TOURING saja, aturan lama)
// ditambah syarat trip belum selesai.
export function showCheckpointForm(input: {
  status: TripStatus;
  isLeader: boolean;
  type: TripType;
}): boolean {
  return (
    input.status !== "CLOSED" && input.isLeader && input.type === "TOURING"
  );
}

// Tombol Invite Members (leader saja, aturan lama) ditambah syarat
// trip belum selesai — undangan hanya berlaku saat PLANNED (PR #163),
// jadi di trip CLOSED tombolnya tidak berguna.
export function showInviteButton(input: {
  status: TripStatus;
  isLeader: boolean;
}): boolean {
  return input.status !== "CLOSED" && input.isLeader;
}

// Tombol Trip Q&A dan blok Start Trip/Tracking disembunyikan total
// untuk trip selesai (sebelumnya Start Trip tampil redup/disabled).
export function showTripQaButton(status: TripStatus): boolean {
  return status !== "CLOSED";
}

export function showStartTripBlock(status: TripStatus): boolean {
  return status !== "CLOSED";
}

// Tombol Ringkasan + Laporan hanya tampil untuk trip selesai.
export function showFinishedActions(status: TripStatus): boolean {
  return status === "CLOSED";
}

// Generate laporan (POST trip-report) hanya leader trip atau admin —
// guard yang sama ditegakkan server (reportGenerator); klien hanya
// menyembunyikan aksi yang pasti ditolak, bukan mengakali guard.
export function canGenerateTripReport(input: {
  isLeader: boolean;
  isAdmin: boolean;
}): boolean {
  return input.isLeader || input.isAdmin;
}

// Aksi tombol Laporan di trip selesai, dari state yang sudah ada:
// generate (belum ada + bisa) / regenerate (sudah ada + bisa, menimpa
// baris yang sama di API) / refresh (sudah ada + tidak bisa, baca
// ulang) / blocked (belum ada + tidak bisa -> pesan jujur, tanpa
// request).
export type TripReportAction = "generate" | "regenerate" | "refresh" | "blocked";

export function resolveTripReportAction(input: {
  hasReport: boolean;
  canGenerate: boolean;
}): TripReportAction {
  if (!input.hasReport && !input.canGenerate) return "blocked";
  if (!input.hasReport) return "generate";
  if (input.canGenerate) return "regenerate";
  return "refresh";
}
