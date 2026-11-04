// Target direction Detail Trip (QA 2 Nov 2026): sebelum check-in di
// titik kumpul, direction mengarah ke titik kumpul; setelah anggota
// check-in (attendance DEPARTED), direction berubah ke tujuan trip
// (bila trip punya koordinat tujuan). Tanpa koordinat apa pun -> null.
import { describe, expect, test } from "bun:test";

import {
  directionTarget,
} from "../utils/trip-direction";
import type { Attendance, Trip } from "../utils/trips-api";

function trip(over: Partial<Trip>): Trip {
  return {
    id: "trip-1",
    name: "Trip Tes",
    type: "TOURING",
    date: "2026-11-03",
    meetingPoint: "Titik Kumpul",
    meetingLat: -6.33492,
    meetingLon: 106.78251,
    destination: "Warjok",
    destinationLat: -6.2,
    destinationLon: 106.8,
    quota: 10,
    isOpenTrip: false,
    price: null,
    status: "PLANNED",
    leaderId: "leader-1",
    createdAt: "2026-11-02",
    ...over,
  };
}

describe("directionTarget", () => {
  test("belum check-in -> titik kumpul", () => {
    const target = directionTarget(trip({}), "NOT_DEPARTED" as Attendance);
    expect(target).toEqual({
      lat: -6.33492,
      lon: 106.78251,
      label: "Titik kumpul",
    });
  });

  test("sudah check-in + ada tujuan -> tujuan trip", () => {
    const target = directionTarget(trip({}), "DEPARTED" as Attendance);
    expect(target).toEqual({ lat: -6.2, lon: 106.8, label: "Warjok" });
  });

  test("sudah check-in tapi tanpa koordinat tujuan -> tetap titik kumpul", () => {
    const target = directionTarget(
      trip({ destinationLat: null, destinationLon: null }),
      "DEPARTED" as Attendance,
    );
    expect(target).toEqual({
      lat: -6.33492,
      lon: 106.78251,
      label: "Titik kumpul",
    });
  });

  test("tanpa koordinat titik kumpul -> null", () => {
    expect(
      directionTarget(
        trip({ meetingLat: null, meetingLon: null }),
        "NOT_DEPARTED" as Attendance,
      ),
    ).toBeNull();
  });

  test("trip hiking tanpa tujuan: sesudah check-in tetap titik kumpul", () => {
    const target = directionTarget(
      trip({
        type: "HIKING",
        destination: null,
        destinationLat: null,
        destinationLon: null,
      }),
      "DEPARTED" as Attendance,
    );
    expect(target).toEqual({
      lat: -6.33492,
      lon: 106.78251,
      label: "Titik kumpul",
    });
  });
});
