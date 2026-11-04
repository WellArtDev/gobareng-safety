// Logika murni background tracking M5/W-5 — tanpa import expo, bisa
// dites unit penuh. Wiring Expo (izin, task, foreground service) ada di
// background-location.ts; layar tracking memilih pengirim lewat
// chooseActiveSender supaya foreground dan background TIDAK PERNAH
// jalan bersamaan (anti kirim ganda).
import { haversineKm } from "./tracking-logic";
import type { TripStatus, TripType } from "./trips-api";

// Nama task background — harus stabil: OS mengaitkan update lokasi
// yang tertunda dengan nama ini.
export const BACKGROUND_LOCATION_TASK = "gobareng-background-location";

// Interval M5: hiking 60 detik, touring 15–30 detik (dipakai 15 detik —
// ujung hemat dalam rentang, motor bergerak cepat), baterai rendah
// 3–5 menit (dipakai 5 menit), diam = jeda dengan heartbeat 5 menit.
export const HIKING_INTERVAL_MS = 60_000;
export const TOURING_INTERVAL_MS = 15_000;
export const LOW_BATTERY_INTERVAL_MS = 300_000;
export const STATIONARY_HEARTBEAT_MS = 300_000;
// Radius diam: sama dengan ambang dedup M7 (25 m) supaya perilaku
// konsisten saat M7 nanti merge — diam dihitung dari titik terakhir
// yang BERHASIL terkirim, bukan dari fix GPS terakhir.
export const STATIONARY_RADIUS_M = 25;

export function getBackgroundIntervalMs(
  tripType: TripType,
  batteryLow: boolean,
): number {
  if (batteryLow) return LOW_BATTERY_INTERVAL_MS;
  return tripType === "HIKING" ? HIKING_INTERVAL_MS : TOURING_INTERVAL_MS;
}

export interface BackgroundPositionInput {
  now: number;
  tripType: TripType;
  batteryLow: boolean;
  mocked: boolean;
  current: { lat: number; lon: number };
  lastSent: { at: number; lat: number; lon: number } | null;
}

// Gate kirim background: mock tidak pernah dikirim; belum pernah kirim
// -> kirim; diam -> hanya heartbeat; bergerak -> interval jenis trip
// (atau 5 menit bila baterai rendah).
export function shouldSendBackgroundPosition(
  input: BackgroundPositionInput,
): boolean {
  if (input.mocked) return false;
  const { lastSent } = input;
  if (lastSent === null) return true;
  const distanceM =
    haversineKm(lastSent.lat, lastSent.lon, input.current.lat, input.current.lon) *
    1000;
  const elapsed = input.now - lastSent.at;
  if (distanceM <= STATIONARY_RADIUS_M) {
    return elapsed >= STATIONARY_HEARTBEAT_MS;
  }
  return (
    elapsed >= getBackgroundIntervalMs(input.tripType, input.batteryLow)
  );
}

export type ActiveSender = "foreground" | "background" | "none";

// Satu-satunya pengirim yang boleh jalan: trip bukan ACTIVE -> tidak
// ada; layar foreground (fokus + app aktif) -> foreground; sisanya
// (layar lain / app background / HP terkunci) -> background.
export function chooseActiveSender(
  isForeground: boolean,
  status: TripStatus | null | undefined,
): ActiveSender {
  if (status !== "ACTIVE") return "none";
  return isForeground ? "foreground" : "background";
}
