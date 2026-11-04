// Logika seksi tambahan Beranda (2 Nov 2026): cuaca kartu trip,
// 3 paid trip, carousel trip publik. Murni, dites unit.
// Sumber data = daftar yang sama dengan Beranda (fetchMyTrips:
// trip member + open trip non-member) — tanpa endpoint baru.
// Trip expired (PLANNED + tanggal lewat, semantik trip-dates.ts)
// tidak pernah masuk seksi mana pun; trip utama Beranda dikeluarkan
// dari seksi supaya tidak tampil ganda.
import { isTripExpired } from "./trip-dates";
import type { Trip } from "./trips-api";

export interface WeatherCoords {
  lat: number;
  lon: number;
}

// Lokasi cuaca: tujuan touring dulu, lalu titik kumpul. Tanpa
// koordinat sama sekali -> null (baris cuaca disembunyikan).
export function pickWeatherCoords(trip: Trip): WeatherCoords | null {
  if (
    trip.destinationLat !== null &&
    trip.destinationLat !== undefined &&
    trip.destinationLon !== null &&
    trip.destinationLon !== undefined
  ) {
    return { lat: trip.destinationLat, lon: trip.destinationLon };
  }
  if (trip.meetingLat !== null && trip.meetingLon !== null) {
    return { lat: trip.meetingLat, lon: trip.meetingLon };
  }
  return null;
}

function isLive(trip: Trip, now: Date): boolean {
  return trip.status !== "CLOSED" && !isTripExpired(trip, now);
}

// Paid trip = harga terisi (price != null). Diacak per muat dari pool
// yang akan datang, maks 3; pool < 3 -> tampilkan yang ada.
export function pickPaidTrips(
  trips: Trip[],
  now: Date = new Date(),
  excludeId?: string,
  random: () => number = Math.random,
): Trip[] {
  const pool = trips.filter(
    (t) => t.price !== null && t.price !== undefined && isLive(t, now) && t.id !== excludeId,
  );
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3);
}

// Trip publik = open trip yang GRATIS (price null). Yang berbayar
// punya seksi sendiri, jadi tidak ikut carousel ini.
export function pickPublicTrips(
  trips: Trip[],
  now: Date = new Date(),
  excludeId?: string,
): Trip[] {
  return trips.filter(
    (t) =>
      t.isOpenTrip &&
      (t.price === null || t.price === undefined) &&
      isLive(t, now) &&
      t.id !== excludeId,
  );
}
