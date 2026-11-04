// Logika tracking murni — dites unit. Warna marker baku kanban M1;
// jarak haversine; format stat gaya mockup (koma desimal ID,
// pemisah ribuan titik, durasi "1j 35m").
import type { TripRole } from "./trips-api";

const EARTH_RADIUS_KM = 6371;
const SOS_COLOR = "#dc2626";

const ROLE_COLORS: Record<TripRole, string> = {
  MEMBER: "#22c55e",
  LEADER: "#e3a008",
  SWEEPER: "#f97316",
  MEDIC: "#ffffff",
};

export function markerColor(role: TripRole, hasActiveSos: boolean): string {
  return hasActiveSos ? SOS_COLOR : ROLE_COLORS[role];
}

export function canFinishTrip(hasTrip: boolean, finishing: boolean): boolean {
  return hasTrip && !finishing;
}

export function memberAccessibilityLabel(
  name: string,
  roleLabel: string,
  hasSos: boolean,
  sosLabel: string,
): string {
  return [name, roleLabel, hasSos ? sosLabel : null]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface LatLon {
  lat: number;
  lon: number;
}

export function accumulateDistanceKm(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon,
    );
  }
  return total;
}

export function formatDistanceKm(km: number): string {
  if (km === 0) return "0 km";
  return `${km.toFixed(1).replace(".", ",")} km`;
}

export function formatElevation(meters: number | null): string {
  if (meters === null) return "—";
  return `${Math.round(meters).toLocaleString("de-DE")} m`;
}

export function formatDurationMin(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours > 0 ? `${hours}j ${rest}m` : `${rest}m`;
}

// Durasi "Waktu jalan" — WAKTU TRIP, bukan GPS: trip ACTIVE dihitung
// dari startedAt bila ada, fallback createdAt (API belum mengembalikan
// startedAt — lihat trips-api.ts). Sengaja TIDAK digerbang posisi
// live: gerbang lama membuat durasi jatuh ke 0 setiap polling gagal
// atau GPS sesaat kosong, padahal trip tetap berjalan. Trip bukan
// ACTIVE -> 0; tanggal tak valid / masa depan -> 0 (bukan NaN).
export function tripElapsedMin(
  trip: { status: string; startedAt?: string | null; createdAt: string },
  nowMs = Date.now(),
): number {
  if (trip.status !== "ACTIVE") return 0;
  const anchor = trip.startedAt ?? trip.createdAt;
  const parsed = Date.parse(anchor);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, (nowMs - parsed) / 60000);
}
