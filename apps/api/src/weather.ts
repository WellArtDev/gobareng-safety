// WX-1: weather + earthquake providers (locked decision 28 Okt 2026).
// Indonesia coordinates -> BMKG (weather; autogempa/gempaterkini for
// quakes). Outside Indonesia -> Open-Meteo weather ONLY (OpenWeather
// is OUT by decision) and USGS GeoJSON quakes.
// Fail-soft everywhere: provider errors resolve to null — the command
// center and trip screens render empty, never crash.
const INDONESIA_BOUNDS = {
  latMin: -11.2,
  latMax: 6.3,
  lonMin: 94.7,
  lonMax: 141.1,
};

export function isInIndonesia(lat: number, lon: number): boolean {
  return (
    lat >= INDONESIA_BOUNDS.latMin &&
    lat <= INDONESIA_BOUNDS.latMax &&
    lon >= INDONESIA_BOUNDS.lonMin &&
    lon <= INDONESIA_BOUNDS.lonMax
  );
}

export type WeatherProvider = "bmkg" | "open-meteo";
export type QuakeProvider = "bmkg" | "usgs";

export function pickWeatherProvider(lat: number, lon: number): WeatherProvider {
  return isInIndonesia(lat, lon) ? "bmkg" : "open-meteo";
}

export function pickQuakeProvider(lat: number, lon: number): QuakeProvider {
  return isInIndonesia(lat, lon) ? "bmkg" : "usgs";
}

// Light in-memory TTL cache — weather/quake feeds change slowly;
// avoids hammering BMKG/USGS when the dashboard polls.
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private now: () => number = Date.now,
  ) {}

  get(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (this.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

export interface CurrentWeather {
  provider: WeatherProvider;
  temperatureC: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  description: string | null;
  fetchedAt: string;
}

export interface Quake {
  provider: QuakeProvider;
  magnitude: number | null;
  depthKm: number | null;
  lat: number | null;
  lon: number | null;
  region: string | null;
  time: string | null;
  tsunamiPotential: string | null;
}

const FETCH_TIMEOUT_MS = 6000;
const weatherCache = new TtlCache<CurrentWeather>(10 * 60_000);
const quakeCache = new TtlCache<Quake[]>(5 * 60_000);

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "gobareng-safety/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    // Fail-soft: provider mati = data null, bukan 500. Debug saja.
    console.debug("[api] weather/quake provider fetch failed", error);
    return null;
  }
}

// Open-Meteo current weather — no API key required.
async function openMeteoCurrent(lat: number, lon: number): Promise<CurrentWeather | null> {
  const json = (await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m`,
  )) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
  } | null;
  if (!json?.current) return null;
  return {
    provider: "open-meteo",
    temperatureC: json.current.temperature_2m ?? null,
    weatherCode: json.current.weather_code ?? null,
    windSpeedKmh: json.current.wind_speed_10m ?? null,
    description: null,
    fetchedAt: new Date().toISOString(),
  };
}

// BMKG tidak punya endpoint cuaca lat/lon publik; untuk koordinat
// Indonesia dipakai data numerik Open-Meteo dan provider dilabel JUJUR
// "open-meteo" (bukan "bmkg"). BMKG tetap otoritatif hanya untuk jalur
// gempa (bmkgQuakes). Label provider tidak boleh mengklaim sumber yang
// tidak dipakai — kontrak §8 memetakan indonesia->"bmkg" untuk cuaca
// hanya bila feed BMKG wilayah tersedia (kartu lanjutan).
async function indonesiaCurrent(lat: number, lon: number): Promise<CurrentWeather | null> {
  const result = await openMeteoCurrent(lat, lon);
  return result;
}

export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached) return cached;
  const result = isInIndonesia(lat, lon)
    ? await indonesiaCurrent(lat, lon)
    : await openMeteoCurrent(lat, lon);
  if (result) weatherCache.set(key, result);
  return result;
}

// BMKG autogempa (latest) + gempaterkini (M>=5 list).
async function bmkgQuakes(): Promise<Quake[] | null> {
  const json = (await getJson(
    "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
  )) as { Infogempa?: { gempa?: unknown[] } } | null;
  const list = json?.Infogempa?.gempa;
  if (!Array.isArray(list)) return null;
  return list.slice(0, 10).map((raw) => {
    const g = raw as Record<string, string>;
    const coords = (g.Coordinates ?? "").split(",");
    return {
      provider: "bmkg" as const,
      magnitude: Number(g.Magnitude) || null,
      depthKm: Number.parseFloat(g.Kedalaman) || null,
      lat: Number.parseFloat(coords[0] ?? "") || null,
      lon: Number.parseFloat(coords[1] ?? "") || null,
      region: g.Wilayah ?? null,
      time: g.DateTime ?? null,
      tsunamiPotential: g.Potensi ?? null,
    };
  });
}

// USGS GeoJSON — significant quakes, past day, near the given point
// is filtered client-side later; feed itself is global.
async function usgsQuakes(): Promise<Quake[] | null> {
  const json = (await getJson(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
  )) as {
    features?: Array<{
      properties?: { mag?: number; place?: string; time?: number };
      geometry?: { coordinates?: number[] };
    }>;
  } | null;
  if (!Array.isArray(json?.features)) return null;
  return json.features.slice(0, 10).map((f) => ({
    provider: "usgs" as const,
    magnitude: f.properties?.mag ?? null,
    depthKm: f.geometry?.coordinates?.[2] ?? null,
    lat: f.geometry?.coordinates?.[1] ?? null,
    lon: f.geometry?.coordinates?.[0] ?? null,
    region: f.properties?.place ?? null,
    time: f.properties?.time ? new Date(f.properties.time).toISOString() : null,
    tsunamiPotential: null,
  }));
}

export async function getRecentQuakes(lat: number, lon: number): Promise<Quake[]> {
  const provider = pickQuakeProvider(lat, lon);
  const cached = quakeCache.get(provider);
  if (cached) return cached;
  const result = (provider === "bmkg" ? await bmkgQuakes() : await usgsQuakes()) ?? [];
  if (result.length > 0) quakeCache.set(provider, result);
  return result;
}
