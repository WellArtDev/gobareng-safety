// TDD RED — koordinat cuaca tujuan di alur buat trip: touring pakai
// titik tujuan, hiking pakai koordinat gunung (fallback pos jalur);
// tanpa koordinat valid -> null (bagian cuaca hilang, form tetap jalan).
import { describe, expect, test } from "bun:test";

import {
  parseCoordPair,
  resolveCreateTripWeatherCoords,
} from "../utils/trip-weather-coords";

describe("parseCoordPair", () => {
  test("string angka valid lolos", () => {
    expect(parseCoordPair("-7.2", "110.4")).toEqual({
      lat: -7.2,
      lon: 110.4,
    });
  });

  test("angka langsung lolos", () => {
    expect(parseCoordPair(-7.2, 110.4)).toEqual({ lat: -7.2, lon: 110.4 });
  });

  test("kosong / bukan angka / tak berpasangan -> null", () => {
    expect(parseCoordPair("", "110.4")).toBeNull();
    expect(parseCoordPair("-7.2", "")).toBeNull();
    expect(parseCoordPair("abc", "110.4")).toBeNull();
    expect(parseCoordPair(null, null)).toBeNull();
  });

  test("di luar rentang -> null", () => {
    expect(parseCoordPair("-91", "110")).toBeNull();
    expect(parseCoordPair("-7", "181")).toBeNull();
  });

  test("0,0 dianggap tidak ada koordinat -> null", () => {
    expect(parseCoordPair("0", "0")).toBeNull();
  });
});

describe("resolveCreateTripWeatherCoords", () => {
  test("touring: pakai titik tujuan", () => {
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: true,
        tujuanLat: "-6.9",
        tujuanLon: "107.6",
      }),
    ).toEqual({ lat: -6.9, lon: 107.6, source: "destination" });
  });

  test("touring tanpa tujuan valid -> null walau ada koordinat gunung", () => {
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: true,
        tujuanLat: "",
        tujuanLon: "",
        mountainLat: -7.2,
        mountainLon: 110.4,
      }),
    ).toBeNull();
  });

  test("hiking: pakai koordinat gunung", () => {
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: false,
        mountainLat: -7.2,
        mountainLon: 110.4,
      }),
    ).toEqual({ lat: -7.2, lon: 110.4, source: "mountain" });
  });

  test("hiking tanpa koordinat gunung: fallback pos kumpul jalur", () => {
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: false,
        mountainLat: null,
        mountainLon: null,
        routePosts: [
          { lat: null, lon: null },
          { lat: -7.31, lon: 109.9, isGathering: true },
          { lat: -7.29, lon: 109.91 },
        ],
      }),
    ).toEqual({ lat: -7.31, lon: 109.9, source: "checkpoint" });
  });

  test("hiking tanpa pos kumpul: pakai pos pertama yang berkoordinat", () => {
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: false,
        routePosts: [
          { lat: null, lon: null },
          { lat: -7.29, lon: 109.91 },
        ],
      }),
    ).toEqual({ lat: -7.29, lon: 109.91, source: "checkpoint" });
  });

  test("hiking tanpa koordinat sama sekali -> null", () => {
    expect(
      resolveCreateTripWeatherCoords({ isTouring: false }),
    ).toBeNull();
    expect(
      resolveCreateTripWeatherCoords({
        isTouring: false,
        routePosts: [{ lat: null, lon: null }],
      }),
    ).toBeNull();
  });
});
