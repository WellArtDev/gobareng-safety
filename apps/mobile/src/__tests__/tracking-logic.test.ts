// TDD RED — logika layar tracking: warna marker baku (kanban M1),
// jarak haversine, akumulasi jarak tempuh, format stat.
import { describe, expect, test } from "bun:test";

import {
  accumulateDistanceKm,
  canFinishTrip,
  formatDistanceKm,
  formatDurationMin,
  formatElevation,
  haversineKm,
  markerColor,
  memberAccessibilityLabel,
  tripElapsedMin,
} from "../utils/tracking-logic";

describe("markerColor", () => {
  test("warna baku: member hijau, leader emas, sweeper oranye, medic putih", () => {
    expect(markerColor("MEMBER", false)).toBe("#22c55e");
    expect(markerColor("LEADER", false)).toBe("#e3a008");
    expect(markerColor("SWEEPER", false)).toBe("#f97316");
    expect(markerColor("MEDIC", false)).toBe("#ffffff");
  });

  test("SOS menimpa semua role dengan merah", () => {
    expect(markerColor("LEADER", true)).toBe("#dc2626");
    expect(markerColor("MEMBER", true)).toBe("#dc2626");
  });
});

describe("haversineKm", () => {
  test("jarak nol untuk titik sama", () => {
    expect(haversineKm(-7.197, 109.913, -7.197, 109.913)).toBe(0);
  });

  test("Patak Banteng -> puncak Prau kira-kira 2-4 km", () => {
    const km = haversineKm(-7.2098, 109.9195, -7.1855, 109.9292);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(4);
  });
});

describe("accumulateDistanceKm", () => {
  test("menjumlah segmen berurutan", () => {
    const points = [
      { lat: -7.21, lon: 109.905 },
      { lat: -7.2, lon: 109.91 },
      { lat: -7.192, lon: 109.915 },
    ];
    const total = accumulateDistanceKm(points);
    const manual =
      haversineKm(-7.21, 109.905, -7.2, 109.91) +
      haversineKm(-7.2, 109.91, -7.192, 109.915);
    expect(total).toBeCloseTo(manual, 10);
  });

  test("kurang dari 2 titik = 0", () => {
    expect(accumulateDistanceKm([])).toBe(0);
    expect(accumulateDistanceKm([{ lat: 0, lon: 0 }])).toBe(0);
  });
});

describe("format", () => {
  test("jarak: koma desimal Indonesia, 1 angka", () => {
    expect(formatDistanceKm(1.84)).toBe("1,8 km");
    expect(formatDistanceKm(0)).toBe("0 km");
  });

  test("elevasi: pemisah ribuan titik + ' m'; null -> strip", () => {
    expect(formatElevation(2140)).toBe("2.140 m");
    expect(formatElevation(null)).toBe("—");
  });

  test("durasi: jam+menit gaya mockup '1j 35m'; <1 jam hanya menit", () => {
    expect(formatDurationMin(95)).toBe("1j 35m");
    expect(formatDurationMin(42)).toBe("42m");
    expect(formatDurationMin(0)).toBe("0m");
  });
});

describe("tripElapsedMin", () => {
  const now = Date.parse("2026-11-03T10:00:00.000Z");
  test("trip ACTIVE: dari createdAt bila startedAt tak ada", () => {
    expect(
      tripElapsedMin(
        { status: "ACTIVE", createdAt: "2026-11-03T09:00:00.000Z" },
        now,
      ),
    ).toBe(60);
  });

  test("startedAt didahulukan atas createdAt", () => {
    expect(
      tripElapsedMin(
        {
          status: "ACTIVE",
          startedAt: "2026-11-03T09:30:00.000Z",
          createdAt: "2026-11-03T08:00:00.000Z",
        },
        now,
      ),
    ).toBe(30);
  });

  test("trip bukan ACTIVE -> 0", () => {
    expect(
      tripElapsedMin(
        { status: "PLANNED", createdAt: "2026-11-03T09:00:00.000Z" },
        now,
      ),
    ).toBe(0);
  });

  test("tanggal tak valid -> 0, bukan NaN", () => {
    expect(
      tripElapsedMin({ status: "ACTIVE", createdAt: "bukan-tanggal" }, now),
    ).toBe(0);
  });

  test("tanggal masa depan -> 0 (dijepit)", () => {
    expect(
      tripElapsedMin(
        { status: "ACTIVE", createdAt: "2026-11-03T11:00:00.000Z" },
        now,
      ),
    ).toBe(0);
  });
});

describe("tracking accessibility state", () => {
  test("finish is available only with a trip and no request in flight", () => {
    expect(canFinishTrip(true, false)).toBe(true);
    expect(canFinishTrip(true, true)).toBe(false);
    expect(canFinishTrip(false, false)).toBe(false);
  });

  test("member label includes active SOS independently of marker color", () => {
    expect(
      memberAccessibilityLabel("Wella", "Leader", true, "SOS aktif"),
    ).toBe("Wella, Leader, SOS aktif");
    expect(
      memberAccessibilityLabel("Budi", "Anggota", false, "SOS aktif"),
    ).toBe("Budi, Anggota");
  });
});
