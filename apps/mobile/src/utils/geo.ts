// Posisi perangkat untuk payload SOS — expo-location, fail-soft:
// gagal/ditolak -> null, SOS tetap bisa dikirim dengan posisi terakhir
// yang diketahui server (jangan pernah memblokir alur SOS).
import * as ExpoLocation from "expo-location";

import { withTimeout } from "./timeout";

// Batas akuisisi GPS Direction (perbaikan 4 Nov 2026): tanpa batas,
// getCurrentPositionAsync bisa menggantung selamanya pada layar
// "Mencari posisimu…" — kini gagal-lembut setelah 15 detik dan layar
// menampilkan tombol coba lagi.
export const GPS_TIMEOUT_MS = 15_000;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface DetailedGeoPoint extends GeoPoint {
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  mocked?: boolean;
}

export async function getCurrentPosition(): Promise<GeoPoint | null> {
  try {
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await withTimeout(
      ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      }),
      GPS_TIMEOUT_MS,
    );
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

// Varian lengkap buat pengirim posisi: field tambahan diteruskan ke
// LocationPayload, flag mocked diteruskan apa adanya (server menolak
// posisi palsu). Sama fail-soft-nya: gagal/ditolak -> null.
export async function getCurrentPositionDetailed(): Promise<DetailedGeoPoint | null> {
  try {
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.Balanced,
    });
    return {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      altitude: pos.coords.altitude,
      mocked: pos.mocked,
    };
  } catch {
    return null;
  }
}
