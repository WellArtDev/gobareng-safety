// Peta tujuan di header kartu trip — pengganti bidang warna kosong
// saat trip tidak punya foto (kasus kartu Beranda "ke warjok").
//
// KEPUTUSAN IMPLEMENTASI (bukan WebView, bukan layanan peta statis):
// - Kartu dirender di dalam ScrollView di semua layar (Beranda, Trip
//   Saya, Jelajahi, detail) — satu WebView Leaflet per kartu berarti
//   satu konteks browser per kartu yang mount bersamaan. Itu yang
//   merusak scroll. Jadi header memakai SATU gambar raster biasa.
// - Layanan peta statis keyless tidak dipakai: staticmap.openstreetmap.de
//   sudah discontinued (wiki OSM, revisi Jan 2024) dan tidak bisa
//   dihubungi dari VM ini; layanan lain butuh API key. Sebagai gantinya
//   header memakai SATU tile raster dari tile.openstreetmap.org +
//   matematika Web Mercator untuk menengahkan titik tujuan di dalam
//   tile. Tanpa dependensi baru; tile di-cache expo-image (memory-disk)
//   antar kartu.
// - Tile OSM WAJIB dikirim bersama User-Agent pengenal aplikasi
//   (TRIP_CARD_TILE_USER_AGENT) — itu syarat kebijakan tile usage OSM.
//   Dulu expo-image dikirim tanpa header sehingga tile tampil
//   "Access blocked" di HP nyata; CARTO sempat dipakai sebagai
//   pengganti, tapi sejak 3 Nov 2026 CARTO mengembalikan watermark
//   "API KEY REQUIRED" untuk pola URL gratis ini, jadi CARTO
//   ditinggalkan dan tile kembali ke OSM — kali ini dengan header.
// - Keterbatasan jujur: satu tile zoom 14 hanya memuat ~2,4 km (khatulistiwa).
//   Titik di tepi tile membuat gambar digeser sampai tepi (dijepit, bukan
//   dipotong) supaya titik tetap terlihat; tidak ada jahitan multi-tile.
//
// Aturan fallback (fail-soft, tidak pernah peta rusak/kosong):
// foto (kalau ada) > peta > logo GoBareng di tengah area, di atas
// warna kategori. Kartu expired tetap warna abu seperti sekarang
// (bukan peta), hanya saja logonya tampil di tengah. Tile gagal
// dimuat -> logo. Tanpa koordinat -> logo.
import { OSM_TILE_USER_AGENT, osmTileCacheKey } from "./osm-tiles";
import { parseCoordPair } from "./trip-weather-coords";
import type { Trip } from "./trips-api";

export interface TripCardMapCenter {
  lat: number;
  lon: number;
  source: "destination" | "meeting";
}

export interface TripCardTile {
  url: string;
  // Posisi titik di dalam tile, 0..1 (dipakai memposisikan pin + offset
  // vertikal gambar supaya titik jatuh di tengah header).
  fracX: number;
  fracY: number;
}

export type TripCardHeaderKind = "photo" | "map" | "logo";

// Pusat peta header: tujuan touring dulu, lalu titik kumpul. Untuk
// hiking, destination selalu null sehingga hasilnya titik kumpul —
// yaitu "lokasi apa pun yang sudah dibawa data kartu". Validasi sama
// dengan aturan koordinat repo: berpasangan, dalam rentang, bukan 0,0.
export function tripCardMapCenter(trip: Trip): TripCardMapCenter | null {
  const dest = parseCoordPair(trip.destinationLat, trip.destinationLon);
  if (dest) return { ...dest, source: "destination" };
  const meet = parseCoordPair(trip.meetingLat, trip.meetingLon);
  if (meet) return { ...meet, source: "meeting" };
  return null;
}

export const TRIP_CARD_MAP_ZOOM = 14;

// Atribusi wajib tile OSM: tampil di kartu di bawah tile, dipakai
// verbatim oleh TripCard.tsx.
export const TRIP_CARD_MAP_ATTRIBUTION = "© OpenStreetMap contributors";

// User-Agent pengenal yang dikirim bersama permintaan tile, sesuai
// kebijakan tile usage OSM (tanpa ini permintaan dari expo-image ditolak).
// Satu sumber kebenaran ada di ./osm-tiles (dipakai bersama LiveMap);
// konstanta ini dipertahankan sebagai re-export supaya import lama
// (komponen + tes) tidak berubah.
export { OSM_TILE_USER_AGENT as TRIP_CARD_TILE_USER_AGENT } from "./osm-tiles";

// Tile OSM yang memuat pusat + posisi titik di dalamnya. Di luar
// jangkauan Web Mercator (mis. lintang ekstrem) -> null, pemanggil
// jatuh ke warna kategori.
export function tripCardTile(
  center: { lat: number; lon: number },
  zoom: number = TRIP_CARD_MAP_ZOOM,
): TripCardTile | null {
  const n = 2 ** zoom;
  const xFloat = ((center.lon + 180) / 360) * n;
  const latRad = (center.lat * Math.PI) / 180;
  const yFloat =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    n;
  if (
    !Number.isFinite(xFloat) ||
    !Number.isFinite(yFloat) ||
    xFloat < 0 ||
    xFloat >= n ||
    yFloat < 0 ||
    yFloat >= n
  ) {
    return null;
  }
  const tileX = Math.floor(xFloat);
  const tileY = Math.floor(yFloat);
  return {
    url: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
    fracX: xFloat - tileX,
    fracY: yFloat - tileY,
  };
}

// Source expo-image untuk satu tile: URL + header User-Agent pengenal
// + cacheKey eksplisit berpenanda versi (lihat ./osm-tiles).
// Dipisah sebagai helper supaya komponen dan tes tidak mengulang
// pasangan URL/header ini (dan supaya tes bisa membuktikan headernya).
export function tripCardTileSource(tile: TripCardTile): {
  uri: string;
  headers: { "User-Agent": string };
  cacheKey: string;
} {
  return {
    uri: tile.url,
    headers: { "User-Agent": OSM_TILE_USER_AGENT },
    cacheKey: osmTileCacheKey(tile.url),
  };
}

export interface TripCardHeader {
  kind: TripCardHeaderKind;
  tile: TripCardTile | null;
}

// Keputusan header kartu, dalam urutan menang yang eksplisit.
// Trip SAAT INI belum punya field foto di API (lihat komentar lama di
// TripCard.tsx), jadi pemanggil mengoper photoUri undefined — parameter
// ini ada supaya aturan "foto menang" teruji dan tinggal disambung saat
// field foto itu ada, bukan tersembunyi di JSX.
export function resolveTripCardHeader(input: {
  trip: Trip;
  photoUri?: string | null;
  expired: boolean;
  mapFailed: boolean;
}): TripCardHeader {
  if (input.photoUri) return { kind: "photo", tile: null };
  if (input.expired || input.mapFailed) return { kind: "logo", tile: null };
  const center = tripCardMapCenter(input.trip);
  if (!center) return { kind: "logo", tile: null };
  const tile = tripCardTile(center);
  if (!tile) return { kind: "logo", tile: null };
  return { kind: "map", tile };
}
