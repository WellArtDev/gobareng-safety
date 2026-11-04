// TDD RED — pembagian daftar trip (menu Trip, keputusan Wella 28 Okt):
// bagian "diikuti" (ACTIVE dulu, lalu PLANNED) dan "selesai" (CLOSED).
import { describe, expect, test } from "bun:test";

import { splitTripList } from "../utils/trip-list-logic";
import type { Trip } from "../utils/trips-api";

function trip(partial: Partial<Trip>): Trip {
  return {
    id: "t1",
    name: "Pendakian Prau",
    type: "HIKING",
    date: "2026-10-25",
    meetingPoint: "Basecamp Patak Banteng",
    meetingLat: null,
    meetingLon: null,
    quota: null,
    isOpenTrip: false,
    status: "PLANNED",
    leaderId: "u1",
    createdAt: "2026-10-20T00:00:00.000Z",
    ...partial,
  };
}

describe("splitTripList", () => {
  test("ACTIVE dulu, lalu PLANNED, CLOSED masuk selesai", () => {
    const active = trip({ id: "a", status: "ACTIVE" });
    const planned = trip({ id: "p", status: "PLANNED" });
    const closed = trip({ id: "c", status: "CLOSED" });
    const { ongoing, finished } = splitTripList([closed, planned, active]);
    expect(ongoing.map((t) => t.id)).toEqual(["a", "p"]);
    expect(finished.map((t) => t.id)).toEqual(["c"]);
  });

  test("kosong: dua-duanya kosong", () => {
    expect(splitTripList([])).toEqual({ ongoing: [], finished: [] });
  });

  // Klarifikasi Wella 2 Nov 2026: di daftar Trip Saya trip expired TETAP
  // ADA (tidak seperti Beranda yang menyembunyikannya) — label Expired
  // ditampilkan lewat TripCard, jadi pembagiannya tidak berubah.
  test("trip expired PLANNED tetap di ongoing, bukan pindah ke selesai", () => {
    const expired = trip({ id: "e", status: "PLANNED", date: "2026-10-28" });
    const closed = trip({ id: "c", status: "CLOSED" });
    const { ongoing, finished } = splitTripList([expired, closed]);
    expect(ongoing.map((t) => t.id)).toEqual(["e"]);
    expect(finished.map((t) => t.id)).toEqual(["c"]);
  });

  test("selesai terbaru dulu (createdAt menurun)", () => {
    const oldClosed = trip({
      id: "c1",
      status: "CLOSED",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const newClosed = trip({
      id: "c2",
      status: "CLOSED",
      createdAt: "2026-10-20T00:00:00.000Z",
    });
    const { finished } = splitTripList([oldClosed, newClosed]);
    expect(finished.map((t) => t.id)).toEqual(["c2", "c1"]);
  });
});
