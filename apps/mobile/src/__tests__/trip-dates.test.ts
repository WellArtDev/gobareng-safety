// TDD RED — semantik expired trip mobile, sepadan dengan dashboard web
// (apps/web/src/lib/trip-dates.ts, PR #144): PLANNED + tanggal lewat =
// Expired, tampilan saja, enum DB tidak berubah. Perbandingan memakai
// awal hari lokal supaya trip yang tanggalnya hari ini belum expired;
// tanggal tak valid = BUKAN past (perilaku lama dipertahankan).
import { describe, expect, test } from "bun:test";

import {
  canStartTrip,
  isTripDatePast,
  isTripExpired,
} from "../utils/trip-dates";
import type { Trip } from "../utils/trips-api";

// "Sekarang" tetap: 2 Nov 2026 siang waktu lokal — tes tidak bergantung
// pada tanggal kalender saat dijalankan.
const NOW = new Date(2026, 10, 2, 12, 0, 0);

function trip(partial: Partial<Trip>): Trip {
  return {
    id: "t1",
    name: "Demo Trip Prau",
    type: "HIKING",
    date: "2026-10-28",
    meetingPoint: "Basecamp",
    meetingLat: null,
    meetingLon: null,
    quota: 10,
    isOpenTrip: false,
    price: null,
    status: "PLANNED",
    leaderId: "u1",
    createdAt: "2026-10-20T00:00:00.000Z",
    ...partial,
  };
}

describe("isTripDatePast", () => {
  test("tanggal kemarin = past", () => {
    expect(isTripDatePast("2026-11-01", NOW)).toBe(true);
  });

  test("tanggal hari ini = belum past", () => {
    expect(isTripDatePast("2026-11-02", NOW)).toBe(false);
  });

  test("tanggal besok = belum past", () => {
    expect(isTripDatePast("2026-11-03", NOW)).toBe(false);
  });

  test("tanggal tak valid = bukan past", () => {
    expect(isTripDatePast("", NOW)).toBe(false);
    expect(isTripDatePast("bukan-tanggal", NOW)).toBe(false);
    expect(isTripDatePast("2026-13-40", NOW)).toBe(false);
  });
});

describe("isTripExpired", () => {
  test("PLANNED + tanggal lewat (Demo Trip Prau 28 Okt) = expired", () => {
    expect(isTripExpired(trip({}), NOW)).toBe(true);
  });

  test("PLANNED + tanggal hari ini/ke depan = tidak expired", () => {
    expect(isTripExpired(trip({ date: "2026-11-02" }), NOW)).toBe(false);
    expect(isTripExpired(trip({ date: "2026-11-03" }), NOW)).toBe(false);
  });

  test("ACTIVE/CLOSED + tanggal lewat = tidak expired", () => {
    expect(isTripExpired(trip({ status: "ACTIVE" }), NOW)).toBe(false);
    expect(isTripExpired(trip({ status: "CLOSED" }), NOW)).toBe(false);
  });

  test("PLANNED + tanggal tak valid = tidak expired", () => {
    expect(isTripExpired(trip({ date: "bukan-tanggal" }), NOW)).toBe(false);
  });
});

describe("canStartTrip", () => {
  test("PLANNED + tanggal lewat = tidak bisa mulai", () => {
    expect(canStartTrip(trip({}), NOW)).toBe(false);
  });

  test("PLANNED + tanggal hari ini/masa depan = bisa mulai", () => {
    expect(canStartTrip(trip({ date: "2026-11-02" }), NOW)).toBe(true);
    expect(canStartTrip(trip({ date: "2026-11-03" }), NOW)).toBe(true);
  });

  test("ACTIVE/CLOSED = tidak bisa mulai (lagi)", () => {
    expect(canStartTrip(trip({ status: "ACTIVE" }), NOW)).toBe(false);
    expect(canStartTrip(trip({ status: "CLOSED" }), NOW)).toBe(false);
  });

  test("PLANNED + tanggal tak valid = bisa mulai (bukan past, perilaku lama)", () => {
    expect(canStartTrip(trip({ date: "bukan-tanggal" }), NOW)).toBe(true);
  });
});
