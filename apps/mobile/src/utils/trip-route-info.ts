// Info rute hiking untuk layar detail trip.
//
// Fakta per 3 Nov 2026: payload Trip dari API TIDAK membawa data rute
// apa pun. POST /trip-groups hanya menerima field dasar trip dan
// membuang mountainId/routeId dari wizard; model Trip tidak punya
// relasi ke Mountain/MountainRoute; checkpoint trip hanya dibuat
// manual (leader) — tidak ada kode yang menyalin pos jalur ke trip
// saat pembuatan. Jadi untuk trip yang ada sekarang, resolver ini
// mengembalikan null dan layar menampilkan keadaan jujur ("belum
// terhubung ke rute"), bukan menebak rute dari nama trip/katalog.
//
// Bila API kelak mengembalikan field rute pada Trip (PR API lanjutan),
// cukup tambahkan field opsional itu ke bentuk ini — layar sudah
// menampilkan barisnya tanpa perubahan logika.
import type { Trip } from "./trips-api";

// Field rute yang diharapkan dari payload API kelak: nama gunung +
// nama rute + kolom admin rute (jarak, gain, estimasi). Semua opsional
// karena payload saat ini tidak membawa satu pun.
export interface TripRouteFields {
  mountainName?: string | null;
  routeName?: string | null;
  distanceKm?: number | null;
  gainM?: number | null;
  estHours?: number | null;
}

export interface TripRouteInfo {
  mountainName: string | null;
  routeName: string | null;
  distanceKm: number | null;
  gainM: number | null;
  estHours: number | null;
}

export type TripWithRoute = Trip & Partial<TripRouteFields>;

function cleanName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// null = trip tidak membawa data rute sama sekali (keadaan payload
// saat ini); bukan null bila minimal satu field rute terisi.
export function resolveTripRouteInfo(trip: TripWithRoute): TripRouteInfo | null {
  const info: TripRouteInfo = {
    mountainName: cleanName(trip.mountainName),
    routeName: cleanName(trip.routeName),
    distanceKm: cleanNumber(trip.distanceKm),
    gainM: cleanNumber(trip.gainM),
    estHours: cleanNumber(trip.estHours),
  };
  return Object.values(info).every((value) => value === null) ? null : info;
}

// Kunci teks kosong daftar checkpoint. Untuk hiking, "belum ada
// checkpoint" saja menyesatkan — yang benar: checkpoint rute belum
// terpasang pada trip ini (creation flow tidak menempelkannya).
export function checkpointsEmptyKey(
  trip: Trip,
): "tripDetail.checkpointsEmptyHiking" | "tripDetail.checkpointsEmpty" {
  return trip.type === "HIKING"
    ? "tripDetail.checkpointsEmptyHiking"
    : "tripDetail.checkpointsEmpty";
}
