// Direction in-app (3 Nov 2026): rute OSRM + logika target mengikuti
// status check-in. Hanya koordinat asal/tujuan yang dikirim ke router;
// tidak ada data katalog mentah. Tanpa fallback Google Maps.
import { describe, expect, test } from "bun:test";

import {
  currentStepIndex,
  entryDirectionTarget,
  fetchOsrmRoute,
  formatDistance,
  haversineM,
  isOffRoute,
  navStepKey,
  nearestOnRoute,
  remainingDistanceM,
  type LatLon,
  type RouteResult,
} from "../utils/direction-route";
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

const checkpoint = { kind: "checkpoint" as const, lat: -6.3, lon: 106.79, label: "Pos 1" };

describe("haversineM", () => {
  test("titik sama -> 0", () => {
    expect(haversineM({ lat: -6.2, lon: 106.8 }, { lat: -6.2, lon: 106.8 })).toBe(0);
  });

  test("1 derajat bujur di ekuator ~= 111 km", () => {
    const d = haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(d).toBeGreaterThan(111000);
    expect(d).toBeLessThan(111500);
  });
});

describe("nearestOnRoute / isOffRoute", () => {
  const route: LatLon[] = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.01 },
    { lat: 0, lon: 0.02 },
  ];

  test("posisi di atas segmen -> jarak ~0", () => {
    const n = nearestOnRoute({ lat: 0, lon: 0.005 }, route);
    expect(n.index).toBe(0);
    expect(n.distanceM).toBeLessThan(1);
  });

  test("posisi jauh dari rute -> off-route", () => {
    expect(isOffRoute({ lat: 0.01, lon: 0.01 }, route, 60)).toBe(true);
    expect(isOffRoute({ lat: 0, lon: 0.01 }, route, 60)).toBe(false);
  });
});

describe("navStepKey", () => {
  test("peta maneuver OSRM ke kunci i18n", () => {
    expect(navStepKey({ type: "turn", modifier: "left" })).toBe("direction.turnLeft");
    expect(navStepKey({ type: "turn", modifier: "right" })).toBe("direction.turnRight");
    expect(navStepKey({ type: "turn", modifier: "slight left" })).toBe("direction.slightLeft");
    expect(navStepKey({ type: "turn", modifier: "slight right" })).toBe("direction.slightRight");
    expect(navStepKey({ type: "turn", modifier: "sharp left" })).toBe("direction.sharpLeft");
    expect(navStepKey({ type: "turn", modifier: "sharp right" })).toBe("direction.sharpRight");
    expect(navStepKey({ type: "turn", modifier: "uturn" })).toBe("direction.uturn");
    expect(navStepKey({ type: "turn", modifier: "straight" })).toBe("direction.continue");
    expect(navStepKey({ type: "depart" })).toBe("direction.depart");
    expect(navStepKey({ type: "arrive" })).toBe("direction.arrive");
    expect(navStepKey({ type: "roundabout" })).toBe("direction.roundabout");
    expect(navStepKey({ type: "continue" })).toBe("direction.continue");
    expect(navStepKey({ type: "new name" })).toBe("direction.continue");
  });
});

describe("currentStepIndex / remainingDistanceM", () => {
  const route: RouteResult = {
    coords: [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 },
      { lat: 0, lon: 0.02 },
    ],
    distanceM: 2223,
    durationS: 300,
    steps: [
      { maneuver: { type: "depart" }, roadName: "", distanceM: 1111, location: { lat: 0, lon: 0 } },
      { maneuver: { type: "turn", modifier: "left" }, roadName: "Jl. A", distanceM: 1112, location: { lat: 0, lon: 0.01 } },
      { maneuver: { type: "arrive" }, roadName: "", distanceM: 0, location: { lat: 0, lon: 0.02 } },
    ],
  };

  test("posisi di segmen pertama -> langkah 0", () => {
    expect(currentStepIndex(route, { lat: 0, lon: 0.005 })).toBe(0);
  });

  test("posisi di segmen kedua -> langkah 1", () => {
    expect(currentStepIndex(route, { lat: 0, lon: 0.015 })).toBe(1);
  });

  test("sisa jarak dari tengah rute ~= setengah total", () => {
    const rest = remainingDistanceM(route, { lat: 0, lon: 0.01 });
    expect(rest).toBeGreaterThan(1000);
    expect(rest).toBeLessThan(1200);
  });
});

describe("formatDistance", () => {
  test("di bawah 1 km -> meter", () => {
    expect(formatDistance(850, ",")).toBe("850 m");
  });

  test("di atas 1 km -> km 1 desimal", () => {
    expect(formatDistance(2300, ",")).toBe("2,3 km");
    expect(formatDistance(2300, ".")).toBe("2.3 km");
  });
});

describe("entryDirectionTarget", () => {
  test("entry checkpoint sebelum check-in -> checkpoint itu", () => {
    expect(entryDirectionTarget(trip({}), "NOT_DEPARTED" as Attendance, checkpoint)).toEqual({
      lat: -6.3,
      lon: 106.79,
      label: "Pos 1",
    });
  });

  test("entry checkpoint sesudah check-in + ada tujuan -> tujuan trip", () => {
    expect(entryDirectionTarget(trip({}), "DEPARTED" as Attendance, checkpoint)).toEqual({
      lat: -6.2,
      lon: 106.8,
      label: "Warjok",
    });
  });

  test("entry checkpoint sesudah check-in tanpa tujuan -> tetap checkpoint", () => {
    expect(
      entryDirectionTarget(
        trip({ destinationLat: null, destinationLon: null }),
        "DEPARTED" as Attendance,
        checkpoint,
      ),
    ).toEqual({ lat: -6.3, lon: 106.79, label: "Pos 1" });
  });

  test("entry meeting mendelegasikan ke directionTarget", () => {
    expect(entryDirectionTarget(trip({}), "NOT_DEPARTED" as Attendance, { kind: "meeting" })).toEqual({
      lat: -6.33492,
      lon: 106.78251,
      label: "Titik kumpul",
    });
    expect(entryDirectionTarget(trip({}), "DEPARTED" as Attendance, { kind: "meeting" })).toEqual({
      lat: -6.2,
      lon: 106.8,
      label: "Warjok",
    });
  });

  test("tanpa koordinat apa pun -> null", () => {
    expect(
      entryDirectionTarget(
        trip({ meetingLat: null, meetingLon: null, destinationLat: null, destinationLon: null }),
        "NOT_DEPARTED" as Attendance,
        { kind: "meeting" },
      ),
    ).toBeNull();
  });
});

describe("fetchOsrmRoute", () => {
  const osrmOk = {
    routes: [
      {
        distance: 2300,
        duration: 600,
        geometry: { coordinates: [[106.8, -6.2], [106.81, -6.21]] },
        legs: [
          {
            steps: [
              {
                maneuver: { type: "depart", location: [106.8, -6.2] },
                name: "",
                distance: 2300,
                location: [106.8, -6.2],
              },
              {
                maneuver: { type: "arrive", location: [106.81, -6.21] },
                name: "",
                distance: 0,
                location: [106.81, -6.21],
              },
            ],
          },
        ],
      },
    ],
  };

  test("parse sukses: koordinat dibalik lon/lat -> lat/lon", async () => {
    const stub = async () => ({ ok: true, json: async () => osrmOk }) as Response;
    const route = await fetchOsrmRoute(
      { lat: -6.2, lon: 106.8 },
      { lat: -6.21, lon: 106.81 },
      stub as unknown as typeof fetch,
    );
    expect(route.distanceM).toBe(2300);
    expect(route.coords).toEqual([
      { lat: -6.2, lon: 106.8 },
      { lat: -6.21, lon: 106.81 },
    ]);
    expect(route.steps).toHaveLength(2);
    expect(route.steps[0].maneuver.type).toBe("depart");
  });

  test("URL OSRM hanya memuat koordinat asal-tujuan", async () => {
    let seen = "";
    const stub = async (url: string) => {
      seen = url;
      return { ok: true, json: async () => osrmOk } as Response;
    };
    await fetchOsrmRoute(
      { lat: -6.2, lon: 106.8 },
      { lat: -6.21, lon: 106.81 },
      stub as unknown as typeof fetch,
    );
    expect(seen).toContain("router.project-osrm.org");
    expect(seen).toContain("106.8,-6.2;106.81,-6.21");
  });

  test("tanpa rute -> error no-route", async () => {
    const stub = async () => ({ ok: true, json: async () => ({ routes: [] }) }) as Response;
    await expect(
      fetchOsrmRoute({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, stub as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "no-route" });
  });

  test("HTTP gagal -> error network", async () => {
    const stub = async () => ({ ok: false, json: async () => ({}) }) as Response;
    await expect(
      fetchOsrmRoute({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, stub as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "network" });
  });
});
