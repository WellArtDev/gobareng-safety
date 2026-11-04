// Grid tile + proyeksi LiveMap (fungsi murni, tanpa dependensi RN).
// Zoom lebih tinggi = satu derajat menempati piksel lebih banyak, jadi
// grid tile dan marker anggota + checkpoint selalu konsisten pada
// zoom yang sama. Diekstrak dari LiveMap agar bisa dites unit.
export const LIVE_MAP_TILE_SIZE = 256;
export const LIVE_MAP_GRID = 5;
export const LIVE_MAP_DEFAULT_ZOOM = 15;
export const LIVE_MAP_MIN_ZOOM = 12;
export const LIVE_MAP_MAX_ZOOM = 18;

export function liveMapPoint(
  lat: number,
  lon: number,
  zoom: number,
): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * LIVE_MAP_TILE_SIZE * n,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      LIVE_MAP_TILE_SIZE *
      n,
  };
}

export function liveMapCenterShifted(
  prevLat: number,
  prevLon: number,
  nextLat: number,
  nextLon: number,
  zoom: number,
): boolean {
  // Skip hitung ulang grid bila geser < setengah tile: pemicu render
  // 25 tile ulang tiap fix GPS kecil (watch 3 dtk) tanpa perubahan visual.
  const prev = liveMapPoint(prevLat, prevLon, zoom);
  const next = liveMapPoint(nextLat, nextLon, zoom);
  return (
    Math.abs(next.x - prev.x) >= LIVE_MAP_TILE_SIZE / 2 ||
    Math.abs(next.y - prev.y) >= LIVE_MAP_TILE_SIZE / 2
  );
}

export function liveMapGrid(centerLat: number, centerLon: number, zoom: number) {
  const center = liveMapPoint(centerLat, centerLon, zoom);
  const n = Math.pow(2, zoom);
  const startX = Math.floor(center.x / LIVE_MAP_TILE_SIZE) - 2;
  const startY = Math.floor(center.y / LIVE_MAP_TILE_SIZE) - 2;
  const tiles: Array<{
    key: string;
    x: number;
    y: number;
    left: number;
    top: number;
  }> = [];
  for (let dx = 0; dx < LIVE_MAP_GRID; dx += 1) {
    for (let dy = 0; dy < LIVE_MAP_GRID; dy += 1) {
      const rawX = startX + dx;
      const rawY = startY + dy;
      const wrappedX = ((rawX % n) + n) % n;
      const clampedY = Math.max(0, Math.min(n - 1, rawY));
      tiles.push({
        key: `${dx}-${dy}`,
        x: wrappedX,
        y: clampedY,
        left: dx * LIVE_MAP_TILE_SIZE,
        top: dy * LIVE_MAP_TILE_SIZE,
      });
    }
  }
  return {
    tiles,
    originX: startX * LIVE_MAP_TILE_SIZE,
    originY: startY * LIVE_MAP_TILE_SIZE,
    centerX: center.x,
    centerY: center.y,
  };
}
