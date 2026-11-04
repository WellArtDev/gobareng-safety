// Validasi form tambah checkpoint manual (Detail Trip, leader):
// nama wajib, lat -90..90, lon -180..180. Input kosong / bukan angka /
// di luar rentang -> null (form menampilkan error, bukan kirim palsu).
import { describe, expect, test } from "bun:test";

import { parseCheckpointCoords } from "../utils/trip-checkpoints";

describe("parseCheckpointCoords", () => {
  test("input valid -> nama ter-trim + angka", () => {
    expect(parseCheckpointCoords("  Pos 1 ", "-6.33492", "106.78251")).toEqual({
      name: "Pos 1",
      lat: -6.33492,
      lon: 106.78251,
    });
  });

  test("nama kosong -> null", () => {
    expect(parseCheckpointCoords("   ", "-6.3", "106.7")).toBeNull();
  });

  test("bukan angka -> null", () => {
    expect(parseCheckpointCoords("Pos", "abc", "106.7")).toBeNull();
    expect(parseCheckpointCoords("Pos", "-6.3", "")).toBeNull();
  });

  test("di luar rentang -> null", () => {
    expect(parseCheckpointCoords("Pos", "-91", "106.7")).toBeNull();
    expect(parseCheckpointCoords("Pos", "90.0001", "106.7")).toBeNull();
    expect(parseCheckpointCoords("Pos", "-6.3", "180.5")).toBeNull();
    expect(parseCheckpointCoords("Pos", "-6.3", "-180.5")).toBeNull();
  });

  test("batas rentang diterima", () => {
    expect(parseCheckpointCoords("Pos", "-90", "180")).toEqual({
      name: "Pos",
      lat: -90,
      lon: 180,
    });
  });
});
