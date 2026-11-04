// TDD RED — seksi Beranda: cuaca, 3 paid trip, carousel publik.
import { describe, expect, test } from "bun:test";

import {
  pickPaidTrips,
  pickPublicTrips,
  pickWeatherCoords,
} from "../utils/home-sections";
import type { Trip } from "../utils/trips-api";

const NOW = new Date(2026, 10, 2); // 2 Nov 2026

let n = 0;
function trip(partial: Partial<Trip>): Trip {
  n += 1;
  return {
    id: `t${n}`,
    name: `Trip ${n}`,
    type: "HIKING",
    date: "2026-11-10",
    meetingPoint: "Basecamp",
    meetingLat: null,
    meetingLon: null,
    quota: null,
    isOpenTrip: false,
    price: null,
    status: "PLANNED",
    leaderId: "u1",
    createdAt: "2026-10-20T00:00:00.000Z",
    ...partial,
  };
}

describe("pickWeatherCoords", () => {
  test("tujuan touring didahulukan atas titik kumpul", () => {
    expect(
      pickWeatherCoords(
        trip({
          destinationLat: -7.5,
          destinationLon: 110.1,
          meetingLat: -6.2,
          meetingLon: 106.8,
        }),
      ),
    ).toEqual({ lat: -7.5, lon: 110.1 });
  });
  test("tanpa tujuan -> titik kumpul; tanpa keduanya -> null", () => {
    expect(
      pickWeatherCoords(trip({ meetingLat: -6.2, meetingLon: 106.8 })),
    ).toEqual({ lat: -6.2, lon: 106.8 });
    expect(pickWeatherCoords(trip({}))).toBeNull();
    expect(
      pickWeatherCoords(trip({ meetingLat: -6.2, meetingLon: null })),
    ).toBeNull();
  });
});

describe("pickPaidTrips", () => {
  test("hanya berbayar + hidup; CLOSED/expired/gratis tersaring; maks 3", () => {
    const list = [
      trip({ id: "p1", price: 150000, isOpenTrip: true }),
      trip({ id: "p2", price: 150000, isOpenTrip: true }),
      trip({ id: "p3", price: 150000, isOpenTrip: true }),
      trip({ id: "p4", price: 150000, isOpenTrip: true }),
      trip({ id: "free", price: null, isOpenTrip: true }),
      trip({ id: "closed", price: 150000, status: "CLOSED" }),
      trip({ id: "expired", price: 150000, date: "2026-10-28" }),
    ];
    const picked = pickPaidTrips(list, NOW, undefined, () => 0.99);
    expect(picked).toHaveLength(3);
    expect(picked.map((t) => t.id).sort()).toEqual(["p1", "p2", "p3"]);
  });
  test("trip utama dikeluarkan; pool < 3 tampil apa adanya", () => {
    const list = [
      trip({ id: "main", price: 150000, isOpenTrip: true }),
      trip({ id: "p2", price: 150000, isOpenTrip: true }),
    ];
    expect(pickPaidTrips(list, NOW, "main", () => 0.5).map((t) => t.id)).toEqual([
      "p2",
    ]);
    expect(pickPaidTrips([], NOW)).toEqual([]);
  });
});

describe("pickPublicTrips", () => {
  test("hanya open + gratis + hidup; berbayar/CLOSED/expired/privat tersaring", () => {
    const list = [
      trip({ id: "pub1", isOpenTrip: true }),
      trip({ id: "pub2", isOpenTrip: true }),
      trip({ id: "paid", isOpenTrip: true, price: 150000 }),
      trip({ id: "priv", isOpenTrip: false }),
      trip({ id: "closed", isOpenTrip: true, status: "CLOSED" }),
      trip({ id: "expired", isOpenTrip: true, date: "2026-10-28" }),
    ];
    expect(pickPublicTrips(list, NOW).map((t) => t.id)).toEqual([
      "pub1",
      "pub2",
    ]);
    expect(pickPublicTrips(list, NOW, "pub1").map((t) => t.id)).toEqual([
      "pub2",
    ]);
  });
});
