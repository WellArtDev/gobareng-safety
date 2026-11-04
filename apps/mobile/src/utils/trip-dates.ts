// Semantik expired trip mobile — sepadan dengan dashboard web
// (apps/web/src/lib/trip-dates.ts, PR #143/#144): PLANNED + tanggal
// lewat = Expired, tampilan saja, enum status di DB tidak berubah.
// Perbandingan memakai awal hari lokal supaya trip yang tanggalnya hari
// ini belum expired; tanggal tak valid = BUKAN past (perilaku lama).
// Parsing manual per komponen (seperti format-date.ts) supaya tanggal
// ISO date-only tidak bergeser karena zona waktu perangkat.
import type { Trip } from "./trips-api";

export function isTripDatePast(raw: string, now: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const tripDay = new Date(year, month - 1, day);
  tripDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return tripDay < today;
}

export function isTripExpired(trip: Trip, now: Date = new Date()): boolean {
  return trip.status === "PLANNED" && isTripDatePast(trip.date, now);
}

// Tombol "Mulai Trip" hanya untuk trip PLANNED yang belum expired.
// ACTIVE/CLOSED tidak bisa dimulai (lagi); trip expired ditolak guard
// ini di klien dan guard TRIP_EXPIRED di API.
export function canStartTrip(trip: Trip, now: Date = new Date()): boolean {
  return trip.status === "PLANNED" && !isTripExpired(trip, now);
}
