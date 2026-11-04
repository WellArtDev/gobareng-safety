// TDD RED — jenis checkpoint jalur (cermin persis web
// apps/web/src/lib/route-checkpoint-type.ts) + pembangunan baris
// daftar dari posts (nama) yang digabung ke checkpoints by order,
// seperti modal Lihat Jalur web: pos tanpa koordinat tetap tampil
// sebagai baris nama saja, bukan hilang dari daftar.
import { describe, expect, test } from "bun:test";

import {
  buildRouteCheckpointRows,
  checkpointKind,
  checkpointMarkerColor,
  type RouteCheckpoint,
} from "../utils/route-checkpoint-kind";

const cp = (over: Partial<RouteCheckpoint>): RouteCheckpoint => ({
  name: "Pos 1",
  order: 0,
  lat: -7.9,
  lon: 110.1,
  elevationM: null,
  autoCheckpoint: false,
  isTarget: false,
  tags: [],
  isGathering: false,
  ...over,
});

describe("checkpointKind (cermin web)", () => {
  test("isTarget -> peak, menang atas tag apa pun", () => {
    expect(checkpointKind([], true)).toBe("peak");
    expect(checkpointKind(["CampArea"], true)).toBe("peak");
  });

  test("tag Peak -> peak", () => {
    expect(checkpointKind(["Peak"])).toBe("peak");
  });

  test("tag CampArea -> camp", () => {
    expect(checkpointKind(["CampArea"])).toBe("camp");
  });

  test("tag lain / kosong / null -> post", () => {
    expect(checkpointKind([])).toBe("post");
    expect(checkpointKind(["Basecamp", "Shelter"])).toBe("post");
    expect(checkpointKind(null)).toBe("post");
    expect(checkpointKind(undefined)).toBe("post");
  });

  test("Peak menang atas CampArea", () => {
    expect(checkpointKind(["CampArea", "Peak"])).toBe("peak");
  });
});

describe("checkpointMarkerColor (cermin web)", () => {
  test("warna marker per jenis", () => {
    expect(checkpointMarkerColor("post")).toBe("#268c4a");
    expect(checkpointMarkerColor("camp")).toBe("#f78308");
    expect(checkpointMarkerColor("peak")).toBe("#f5c518");
  });
});

describe("buildRouteCheckpointRows", () => {
  test("posts digabung ke checkpoints berdasarkan order", () => {
    const rows = buildRouteCheckpointRows(["Basecamp", "Pos 2", "Puncak"], [
      cp({ name: "Basecamp", order: 0, tags: ["Basecamp"] }),
      cp({ name: "Pos 2", order: 1, elevationM: 1800 }),
      cp({ name: "Puncak", order: 2, isTarget: true }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].kind).toBe("post");
    expect(rows[0].checkpoint?.elevationM).toBeNull();
    expect(rows[1].checkpoint?.elevationM).toBe(1800);
    expect(rows[2].kind).toBe("peak");
    expect(rows[2].name).toBe("Puncak");
  });

  test("pos tanpa checkpoint tetap tampil sebagai baris nama (kind post)", () => {
    const rows = buildRouteCheckpointRows(["Basecamp", "Pos Tanpa Koordinat"], [
      cp({ name: "Basecamp", order: 0 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe("Pos Tanpa Koordinat");
    expect(rows[1].checkpoint).toBeNull();
    expect(rows[1].kind).toBe("post");
  });

  test("checkpoint di luar jangkauan posts diabaikan (bukan baris baru)", () => {
    const rows = buildRouteCheckpointRows(["Basecamp"], [
      cp({ name: "Basecamp", order: 0 }),
      cp({ name: "Yatim", order: 5 }),
    ]);
    expect(rows).toHaveLength(1);
  });

  test("posts kosong -> baris kosong", () => {
    expect(buildRouteCheckpointRows([], [])).toEqual([]);
  });
});
