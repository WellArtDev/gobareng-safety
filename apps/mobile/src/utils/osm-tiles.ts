// Sumber tile OpenStreetMap bersama — SATU-SATUNYA jalur tile OSM di
// aplikasi ini (dipakai LiveMap + header kartu trip).
//
// Kebijakan tile usage OSM mensyaratkan setiap permintaan tile dikirim
// bersama User-Agent pengenal aplikasi. Tanpa header itu OSM
// mengembalikan tile "Access blocked" 403 — persis yang tampil di HP
// nyata pada peta live 3 Nov 2026 (LiveMap lama memakai RN Image tanpa
// header apa pun) dan sebelumnya pada kartu trip (diperbaiki PR #164).
//
// Pelajaran cache dari #164: tile blokir yang pernah ter-cache bisa
// menipu seolah perbaikan tidak jalan. Karena itu setiap source di sini
// membawa cacheKey eksplisit berpenanda versi (OSM_TILE_CACHE_VERSION):
// kunci baru ini berbeda dari kunci lama (default expo-image = URI
// polos), sehingga entri cache tile blokir lama tidak pernah dibaca
// lagi. Kalau sumber/kebijakan tile berubah lagi, naikkan versinya.
export const OSM_TILE_USER_AGENT = "GoBareng/1.0 (https://gobareng.app)";

// Penanda versi kunci cache tile. Naikkan bila URL tile, header, atau
// kebijakan cache berubah — supaya cache lama tidak dipakai lagi.
export const OSM_TILE_CACHE_VERSION = "v2";

export function osmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// Kunci cache untuk satu tile, diturunkan dari URI-nya: satu tile satu
// kunci, stabil untuk tile yang sama, dan selalu berbeda dari URI
// polos (kunci default lama) berkat awalan versi.
export function osmTileCacheKey(uri: string): string {
  return `osm-tile-${OSM_TILE_CACHE_VERSION}:${uri}`;
}

// Source expo-image untuk satu tile: URL + header User-Agent pengenal
// + cacheKey eksplisit. Dipakai LiveMap; tripCardTileSource mendelegasi
// ke sini lewat osmTileCacheKey supaya pasangan URL/header/kunci ini
// tidak ditulis di dua tempat.
export function osmTileSource(
  z: number,
  x: number,
  y: number,
): {
  uri: string;
  headers: { "User-Agent": string };
  cacheKey: string;
} {
  const uri = osmTileUrl(z, x, y);
  return {
    uri,
    headers: { "User-Agent": OSM_TILE_USER_AGENT },
    cacheKey: osmTileCacheKey(uri),
  };
}
