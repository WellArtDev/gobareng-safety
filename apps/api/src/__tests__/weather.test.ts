// WX-1 unit tests — provider routing (locked decision 28 Okt 2026:
// Indonesia -> BMKG; outside -> Open-Meteo only, OpenWeather is OUT;
// quakes: BMKG inside, USGS outside), bounds check, cache TTL,
// fail-soft (provider error -> null, never throws).
import { describe, expect, test } from "bun:test";

import {
  isInIndonesia,
  pickWeatherProvider,
  pickQuakeProvider,
  TtlCache,
} from "../weather.js";

describe("isInIndonesia (bounding box)", () => {
  test("Jakarta, Prau, Rinjani, Jayapura = dalam", () => {
    expect(isInIndonesia(-6.2, 106.8)).toBe(true); // Jakarta
    expect(isInIndonesia(-7.2, 109.92)).toBe(true); // Prau
    expect(isInIndonesia(-8.4, 116.46)).toBe(true); // Rinjani
    expect(isInIndonesia(-2.53, 140.72)).toBe(true); // Jayapura
  });

  test("Singapura utara, Tokyo, Sydney, Nol-nol Atlantik = luar", () => {
    expect(isInIndonesia(35.68, 139.69)).toBe(false); // Tokyo
    expect(isInIndonesia(-33.87, 151.21)).toBe(false); // Sydney
    expect(isInIndonesia(48.85, 2.35)).toBe(false); // Paris
  });
});

describe("provider routing", () => {
  test("cuaca: Indonesia -> bmkg, luar -> open-meteo (OpenWeather DICORET)", () => {
    expect(pickWeatherProvider(-6.2, 106.8)).toBe("bmkg");
    expect(pickWeatherProvider(35.68, 139.69)).toBe("open-meteo");
  });

  test("gempa: Indonesia -> bmkg, luar -> usgs", () => {
    expect(pickQuakeProvider(-6.2, 106.8)).toBe("bmkg");
    expect(pickQuakeProvider(35.68, 139.69)).toBe("usgs");
  });
});

describe("TtlCache", () => {
  test("hit sebelum TTL, miss sesudah", () => {
    let now = 1000;
    const cache = new TtlCache<string>(60_000, () => now);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    now += 59_000;
    expect(cache.get("k")).toBe("v");
    now += 2_000;
    expect(cache.get("k")).toBeNull();
  });

  test("key beda tidak bentrok", () => {
    const cache = new TtlCache<number>(60_000);
    cache.set("a", 1);
    expect(cache.get("b")).toBeNull();
  });
});
