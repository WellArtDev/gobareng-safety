// Klien cuaca + gempa WX-1 — keputusan 28 Okt 2026: Indonesia -> BMKG,
// luar -> Open-Meteo (OpenWeather DICORET); gempa BMKG/USGS. Fail-soft
// total: error jaringan/server -> null/[], layar tampil kosong.
import { apiRequest } from "./api-client";

export interface CurrentWeather {
  provider: "bmkg" | "open-meteo";
  temperatureC: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  description: string | null;
  fetchedAt: string;
}

export interface Quake {
  provider: "bmkg" | "usgs";
  magnitude: number | null;
  depthKm: number | null;
  lat: number | null;
  lon: number | null;
  region: string | null;
  time: string | null;
  tsunamiPotential: string | null;
}

export interface WeatherResult {
  provider: string;
  weather: CurrentWeather | null;
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
): Promise<WeatherResult | null> {
  try {
    return await apiRequest<WeatherResult>(
      `/weather/current?lat=${lat}&lon=${lon}`,
    );
  } catch {
    return null;
  }
}

export async function fetchQuakes(lat: number, lon: number): Promise<Quake[]> {
  try {
    const data = await apiRequest<{ provider: string; quakes: Quake[] }>(
      `/weather/quakes?lat=${lat}&lon=${lon}`,
    );
    return data.quakes;
  } catch {
    return [];
  }
}
