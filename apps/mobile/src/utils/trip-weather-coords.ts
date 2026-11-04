// Koordinat cuaca tujuan di alur buat trip — kondisi SAAT INI
// (endpoint /weather/current yang sudah ada; BUKAN prakiraan tanggal
// trip). Fail-soft: tanpa koordinat valid -> null, pemanggil
// menyembunyikan bagian cuaca total, form tetap bisa disubmit.
export interface WeatherCoords {
  lat: number;
  lon: number;
  source: "destination" | "mountain" | "checkpoint";
}

export interface RoutePostCoord {
  lat: number | null;
  lon: number | null;
  isGathering?: boolean;
}

function validCoord(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// Pasangan koordinat valid: keduanya ada, dalam rentang, bukan 0,0
// (0,0 = penanda "belum dipilih", sama seperti aturan SOS umum).
export function parseCoordPair(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } | null {
  const la = validCoord(lat, -90, 90);
  const lo = validCoord(lon, -180, 180);
  if (la === null || lo === null) return null;
  if (la === 0 && lo === 0) return null;
  return { lat: la, lon: lo };
}

export function resolveCreateTripWeatherCoords(input: {
  isTouring: boolean;
  tujuanLat?: string | number | null;
  tujuanLon?: string | number | null;
  mountainLat?: number | null;
  mountainLon?: number | null;
  routePosts?: RoutePostCoord[];
}): WeatherCoords | null {
  if (input.isTouring) {
    const dest = parseCoordPair(input.tujuanLat, input.tujuanLon);
    return dest ? { ...dest, source: "destination" } : null;
  }
  const mountain = parseCoordPair(input.mountainLat, input.mountainLon);
  if (mountain) return { ...mountain, source: "mountain" };
  const posts = input.routePosts ?? [];
  const gathering = posts.find((p) => p.isGathering);
  const gatheringPair =
    gathering !== undefined
      ? parseCoordPair(gathering.lat, gathering.lon)
      : null;
  if (gatheringPair) return { ...gatheringPair, source: "checkpoint" };
  for (const post of posts) {
    const pair = parseCoordPair(post.lat, post.lon);
    if (pair) return { ...pair, source: "checkpoint" };
  }
  return null;
}
