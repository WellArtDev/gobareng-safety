// TDD RED — LiveMap (perbaikan 4 Nov 2026): zoom tidak lagi paten
// 15 — grid tile harus dihitung ulang untuk zoom yang dipilih, dan
// titik checkpoint harus bisa diproyeksikan ke piksel yang sama
// dengan marker anggota (satu fungsi dunia->piksel per zoom).
import { describe, expect, test } from "bun:test";

import {
  liveMapCenterShifted,
  liveMapGrid,
  liveMapPoint,
} from "../utils/live-map-grid";

describe("liveMapGrid", () => {
  test("zoom mengubah jumlah dunia (bukan sekadar label): grid zoom 16 lebih rapat dari zoom 15", () => {
    const g15 = liveMapGrid(-6.2, 106.8, 15);
    const g16 = liveMapGrid(-6.2, 106.8, 16);
    expect(g15.tiles).toHaveLength(25);
    expect(g16.tiles).toHaveLength(25);
    // Pada zoom lebih tinggi, satu derajat menempati piksel lebih banyak.
    const p15a = liveMapPoint(-6.2, 106.8, 15);
    const p15b = liveMapPoint(-6.21, 106.8, 15);
    const p16a = liveMapPoint(-6.2, 106.8, 16);
    const p16b = liveMapPoint(-6.21, 106.8, 16);
    expect(Math.abs(p16b.y - p16a.y)).toBeGreaterThan(
      Math.abs(p15b.y - p15a.y),
    );
  });

  test("tile grid memusat pada pusat yang diminta", () => {
    const g = liveMapGrid(-6.2, 106.8, 15);
    const center = liveMapPoint(-6.2, 106.8, 15);
    expect(center.x - g.originX).toBeGreaterThan(0);
    expect(center.x - g.originX).toBeLessThan(5 * 256);
  });

  test("geser kecil (< setengah tile) tidak butuh hitung ulang grid", () => {
    expect(liveMapCenterShifted(-6.2, 106.8, -6.2001, 106.8001, 15)).toBe(
      false,
    );
  });

  test("geser besar butuh hitung ulang grid", () => {
    expect(liveMapCenterShifted(-6.2, 106.8, -6.25, 106.85, 15)).toBe(true);
  });
});
