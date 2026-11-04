// Info rute hiking di detail trip: resolver hanya menampilkan data rute
// yang benar-benar dibawa payload trip — tidak pernah menebak dari
// nama trip atau katalog. Payload API saat ini (3 Nov 2026) tidak
// membawa field rute apa pun, jadi trip seperti itu -> null dan layar
// menampilkan keadaan jujur "belum terhubung ke rute".
import { describe, expect, test } from "bun:test";

import {
  checkpointsEmptyKey,
  resolveTripRouteInfo,
} from "../utils/trip-route-info";
import type { Trip } from "../utils/trips-api";

function hikingTrip(overrides: Record<string, unknown> = {}): Trip {
  return {
    id: "trip-1",
    name: "sample hiking to gede mountain",
    type: "HIKING",
    date: "2026-11-04 06:30",
    meetingPoint: "meeting on basecamp1",
    meetingLat: null,
    meetingLon: null,
    quota: 10,
    isOpenTrip: false,
    price: null,
    status: "PLANNED",
    leaderId: "user-1",
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  } as Trip;
}

describe("resolveTripRouteInfo", () => {
  test("payload API saat ini (tanpa field rute) -> null", () => {
    expect(resolveTripRouteInfo(hikingTrip())).toBeNull();
  });

  test("trip touring tanpa field rute -> null", () => {
    const touring = hikingTrip({ type: "TOURING", meetingPoint: "Basecamp" });
    expect(resolveTripRouteInfo(touring)).toBeNull();
  });

  test("field rute lengkap -> semua terbawa", () => {
    expect(
      resolveTripRouteInfo(
        hikingTrip({
          mountainName: "Gunung Gede - Pangrango",
          routeName: "Jalur Selabintana",
          distanceKm: 12.5,
          gainM: 1400,
          estHours: 8,
        }),
      ),
    ).toEqual({
      mountainName: "Gunung Gede - Pangrango",
      routeName: "Jalur Selabintana",
      distanceKm: 12.5,
      gainM: 1400,
      estHours: 8,
    });
  });

  test("field rute sebagian -> hanya yang ada, sisanya null", () => {
    expect(
      resolveTripRouteInfo(
        hikingTrip({
          mountainName: "Gunung Gede - Pangrango",
          routeName: "Jalur Selabintana",
        }),
      ),
    ).toEqual({
      mountainName: "Gunung Gede - Pangrango",
      routeName: "Jalur Selabintana",
      distanceKm: null,
      gainM: null,
      estHours: null,
    });
  });

  test("field rute bernilai null eksplisit -> tetap null", () => {
    expect(
      resolveTripRouteInfo(
        hikingTrip({ mountainName: null, distanceKm: null }),
      ),
    ).toBeNull();
  });

  test("nama kosong (string kosong) -> dianggap tidak ada", () => {
    expect(
      resolveTripRouteInfo(hikingTrip({ mountainName: "   " })),
    ).toBeNull();
  });
});

describe("checkpointsEmptyKey", () => {
  test("hiking tanpa checkpoint -> kunci khusus rute belum terpasang", () => {
    expect(checkpointsEmptyKey(hikingTrip())).toBe(
      "tripDetail.checkpointsEmptyHiking",
    );
  });

  test("touring tanpa checkpoint -> kunci kosong umum", () => {
    const touring = hikingTrip({ type: "TOURING" });
    expect(checkpointsEmptyKey(touring)).toBe("tripDetail.checkpointsEmpty");
  });
});
