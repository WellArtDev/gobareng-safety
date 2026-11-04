// TDD — pola morse SOS harus persis ··· −−− ··· dengan timing baku.
import { describe, expect, test } from "bun:test";

import { buildSosCycle } from "../utils/morse";

describe("buildSosCycle", () => {
  test("9 nyala: 3 titik (200ms), 3 strip (600ms), 3 titik", () => {
    const cycle = buildSosCycle();
    const flashes = cycle.filter((s) => s.on);
    expect(flashes).toHaveLength(9);
    expect(flashes.slice(0, 3).every((s) => s.ms === 200)).toBe(true);
    expect(flashes.slice(3, 6).every((s) => s.ms === 600)).toBe(true);
    expect(flashes.slice(6, 9).every((s) => s.ms === 200)).toBe(true);
  });

  test("jeda akhir = jeda kata 1400ms sebelum ulang", () => {
    const cycle = buildSosCycle();
    const last = cycle[cycle.length - 1];
    expect(last.on).toBe(false);
    expect(last.ms).toBe(1400);
  });

  test("segmen bergantian on/off", () => {
    const cycle = buildSosCycle();
    for (let i = 0; i < cycle.length; i += 1) {
      expect(cycle[i].on).toBe(i % 2 === 0);
    }
  });
});
