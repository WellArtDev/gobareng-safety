// TDD RED — logika murni background tracking M5/W-5: interval adaptif,
// gating kirim (diam = jeda + heartbeat), dan pemilihan pengirim aktif
// (foreground vs background, tidak pernah dua-duanya).
// Tanpa React, tanpa GPS beneran, tanpa import expo — semua murni.
import { describe, expect, test } from "bun:test";

import {
  BACKGROUND_LOCATION_TASK,
  HIKING_INTERVAL_MS,
  LOW_BATTERY_INTERVAL_MS,
  STATIONARY_HEARTBEAT_MS,
  STATIONARY_RADIUS_M,
  TOURING_INTERVAL_MS,
  chooseActiveSender,
  getBackgroundIntervalMs,
  shouldSendBackgroundPosition,
} from "../utils/background-location-logic";

// Titik dasar + geseran: 0,0002° lintang ≈ 22 m (diam), 0,0003° ≈ 33 m
// (bergerak) — melewati radius diam 25 m di kedua sisi.
const BASE = { lat: -7.19, lon: 109.92 };
const STILL = { lat: -7.19 + 0.0002, lon: 109.92 };
const MOVING = { lat: -7.19 + 0.0003, lon: 109.92 };

function input(over: Record<string, unknown> = {}) {
  return {
    now: 1_000_000,
    tripType: "HIKING" as const,
    batteryLow: false,
    mocked: false,
    current: MOVING,
    lastSent: null as null | { at: number; lat: number; lon: number },
    ...over,
  };
}

describe("konstanta M5", () => {
  test("nama task + interval sesuai spek", () => {
    expect(BACKGROUND_LOCATION_TASK).toBe("gobareng-background-location");
    expect(HIKING_INTERVAL_MS).toBe(60_000);
    expect(TOURING_INTERVAL_MS).toBe(15_000);
    expect(LOW_BATTERY_INTERVAL_MS).toBe(300_000);
    expect(STATIONARY_HEARTBEAT_MS).toBe(300_000);
    expect(STATIONARY_RADIUS_M).toBe(25);
  });
});

describe("getBackgroundIntervalMs", () => {
  test("hiking 60 detik, touring 15 detik", () => {
    expect(getBackgroundIntervalMs("HIKING", false)).toBe(60_000);
    expect(getBackgroundIntervalMs("TOURING", false)).toBe(15_000);
  });

  test("baterai rendah mengalahkan jenis trip: 5 menit", () => {
    expect(getBackgroundIntervalMs("HIKING", true)).toBe(300_000);
    expect(getBackgroundIntervalMs("TOURING", true)).toBe(300_000);
  });
});

describe("shouldSendBackgroundPosition", () => {
  test("belum pernah kirim -> kirim", () => {
    expect(shouldSendBackgroundPosition(input())).toBe(true);
  });

  test("koordinat mock -> TIDAK PERNAH kirim", () => {
    expect(shouldSendBackgroundPosition(input({ mocked: true }))).toBe(false);
    expect(
      shouldSendBackgroundPosition(input({ mocked: true, lastSent: { at: 0, ...BASE } })),
    ).toBe(false);
  });

  test("bergerak, hiking: di bawah 60 detik tahan, pas 60 detik kirim", () => {
    const lastSent = { at: 1_000_000 - 59_000, ...BASE };
    expect(shouldSendBackgroundPosition(input({ lastSent }))).toBe(false);
    expect(
      shouldSendBackgroundPosition(
        input({ lastSent: { at: 1_000_000 - 60_000, ...BASE } }),
      ),
    ).toBe(true);
  });

  test("bergerak, touring: di bawah 15 detik tahan, pas 15 detik kirim", () => {
    const base = input({ tripType: "TOURING" as const });
    expect(
      shouldSendBackgroundPosition({
        ...base,
        lastSent: { at: 1_000_000 - 14_000, ...BASE },
      }),
    ).toBe(false);
    expect(
      shouldSendBackgroundPosition({
        ...base,
        lastSent: { at: 1_000_000 - 15_000, ...BASE },
      }),
    ).toBe(true);
  });

  test("diam (<=25 m): jeda, hanya heartbeat 5 menit yang lolos", () => {
    const current = STILL;
    expect(
      shouldSendBackgroundPosition(
        input({ current, lastSent: { at: 1_000_000 - 60_000, ...BASE } }),
      ),
    ).toBe(false);
    expect(
      shouldSendBackgroundPosition(
        input({ current, lastSent: { at: 1_000_000 - 299_000, ...BASE } }),
      ),
    ).toBe(false);
    expect(
      shouldSendBackgroundPosition(
        input({ current, lastSent: { at: 1_000_000 - 300_000, ...BASE } }),
      ),
    ).toBe(true);
  });

  test("baterai rendah + bergerak: tahan sampai 5 menit", () => {
    expect(
      shouldSendBackgroundPosition(
        input({
          batteryLow: true,
          lastSent: { at: 1_000_000 - 299_000, ...BASE },
        }),
      ),
    ).toBe(false);
    expect(
      shouldSendBackgroundPosition(
        input({
          batteryLow: true,
          lastSent: { at: 1_000_000 - 300_000, ...BASE },
        }),
      ),
    ).toBe(true);
  });
});

describe("chooseActiveSender", () => {
  test("fokus + ACTIVE -> foreground; tidak fokus + ACTIVE -> background", () => {
    expect(chooseActiveSender(true, "ACTIVE")).toBe("foreground");
    expect(chooseActiveSender(false, "ACTIVE")).toBe("background");
  });

  test("trip bukan ACTIVE -> tidak ada pengirim", () => {
    expect(chooseActiveSender(true, "PLANNED")).toBe("none");
    expect(chooseActiveSender(false, "PLANNED")).toBe("none");
    expect(chooseActiveSender(true, "CLOSED")).toBe("none");
    expect(chooseActiveSender(true, null)).toBe("none");
    expect(chooseActiveSender(true, undefined)).toBe("none");
  });
});
