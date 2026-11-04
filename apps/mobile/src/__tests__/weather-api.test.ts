// TDD RED — klien cuaca WX-1: current + quakes, fail-soft (null/[]).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchCurrentWeather, fetchQuakes } from "../utils/weather-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("weather client", () => {
  test("current mengembalikan weather + provider", async () => {
    mockFetch(200, {
      data: {
        provider: "bmkg",
        weather: {
          provider: "open-meteo",
          temperatureC: 18.5,
          weatherCode: 3,
          windSpeedKmh: 12,
          description: null,
          fetchedAt: "2026-10-31T01:00:00.000Z",
        },
      },
    });
    const result = await fetchCurrentWeather(-7.2, 109.92);
    expect(result?.weather?.temperatureC).toBe(18.5);
    expect(result?.provider).toBe("bmkg");
  });

  test("fail-soft: server error -> null, tidak melempar", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await fetchCurrentWeather(0, 0)).toBeNull();
    expect(await fetchQuakes(0, 0)).toEqual([]);
  });

  test("quakes mengembalikan daftar", async () => {
    mockFetch(200, {
      data: {
        provider: "bmkg",
        quakes: [
          {
            provider: "bmkg",
            magnitude: 5.2,
            depthKm: 10,
            lat: -7.1,
            lon: 109.8,
            region: "Jawa Tengah",
            time: "2026-10-31T00:30:00",
            tsunamiPotential: "Tidak berpotensi tsunami",
          },
        ],
      },
    });
    const quakes = await fetchQuakes(-7.2, 109.92);
    expect(quakes).toHaveLength(1);
    expect(quakes[0].magnitude).toBe(5.2);
  });
});
