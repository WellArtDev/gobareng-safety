// AI-Q jarak checkpoint untuk trip TANPA rute (touring) — TDD.
// Laporan HP nyata 4 Nov 2026: "how far the check point" di trip
// touring Night ride Ancol dijawab "Not in the trip data" karena trip
// itu tidak punya mountainId/routeId, jadi fakta trip.route +
// trip.nextPost tidak pernah dibangun, sementara fakta
// trip.checkpoints hanya berisi NAMA tanpa jarak.
// Perbaikan: trip tanpa rute mendapat fakta trip.nearestCheckpoint
// yang dihitung server dari posisi leader terakhir ke checkpoint
// trip terdekat (haversine). HANYA jarak — tanpa estimasi waktu
// (pace 3 km/jam adalah asumsi jalan kaki, tidak berlaku buat touring).
// Tes unit murni — tanpa HTTP/DB: stub Db seperti ai-qa-route.test.ts.
// Guardrail: koordinat tidak boleh muncul di teks fakta apa pun.
import { describe, expect, test } from "bun:test";
import {
  buildTripQaContext,
  computeNearestCheckpoint,
  selectSources,
  type TripQaFact,
} from "../ai-qa.js";
import type { Db } from "../db.js";
import type { Trip } from "../store.js";

function fact(facts: TripQaFact[], key: string): TripQaFact | undefined {
  return facts.find((f) => f.key === key);
}

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-touring-1",
    name: "Trip Touring Tes",
    type: "TOURING",
    date: "2026-12-20",
    meetingPoint: "Ancol",
    meetingLat: -6.29163,
    meetingLon: 106.79984,
    destination: "Ancol",
    destinationLat: -6.1,
    destinationLon: 106.8,
    quota: 10,
    durationDays: null,
    prevJoined: null,
    image: null,
    note: null,
    isOpenTrip: false,
    price: null,
    mountainId: null,
    routeId: null,
    mountainName: null,
    routeName: null,
    distanceKm: null,
    gainM: null,
    estHours: null,
    status: "OPEN",
    leaderId: "user-leader",
    createdAt: "2026-11-04T00:00:00.000Z",
    ...overrides,
  };
}

const CP_A = { id: "cp-a", tripId: "trip-touring-1", name: "Pintu Ancol", lat: -6.3, lon: 106.8 };
const CP_B = { id: "cp-b", tripId: "trip-touring-1", name: "Pantai Ancol", lat: -6.35, lon: 106.85 };

function stubTouringDb(opts: {
  leaderPos: { lat: number; lon: number } | null;
  checkpoints?: { id: string; tripId: string; name: string; lat: number; lon: number }[];
}): Db {
  return {
    tripMembersWithUser: async () => [
      {
        tripId: "trip-touring-1",
        userId: "user-leader",
        role: "LEADER",
        attendance: "NOT_DEPARTED",
        user: { id: "user-leader", name: "Leader Tes" },
      },
      {
        tripId: "trip-touring-1",
        userId: "user-mem",
        role: "MEMBER",
        attendance: "NOT_DEPARTED",
        user: { id: "user-mem", name: "Member Tes" },
      },
    ],
    tripCheckpoints: async () => opts.checkpoints ?? [CP_A, CP_B],
    // Trip tanpa rute TIDAK BOLEH menyentuh mountainRoute.
    mountainRoute: async () => {
      throw new Error("mountainRoute must not be called for non-route trips");
    },
    latestLocations: async () =>
      opts.leaderPos
        ? [{ userId: "user-leader", lat: opts.leaderPos.lat, lon: opts.leaderPos.lon }]
        : [],
  } as unknown as Db;
}

describe("computeNearestCheckpoint (murni, tanpa DB)", () => {
  const cps = [CP_A, CP_B];

  test("leader dekat CP A -> terdekat CP A + jarak meter", () => {
    const r = computeNearestCheckpoint({ lat: -6.301, lon: 106.801 }, cps);
    expect(r.kind).toBe("nearest");
    if (r.kind !== "nearest") return;
    expect(r.checkpoint).toBe("Pintu Ancol");
    // Delta 0,001 derajat ~ 157 m (toleransi longgar).
    expect(r.distanceM).toBeGreaterThan(100);
    expect(r.distanceM).toBeLessThan(250);
  });

  test("leader tepat di CP B -> terdekat CP B, jarak 0", () => {
    const r = computeNearestCheckpoint({ lat: -6.35, lon: 106.85 }, cps);
    expect(r.kind).toBe("nearest");
    if (r.kind !== "nearest") return;
    expect(r.checkpoint).toBe("Pantai Ancol");
    expect(r.distanceM).toBe(0);
  });

  test("tanpa posisi leader -> no-position", () => {
    expect(computeNearestCheckpoint(null, cps).kind).toBe("no-position");
  });

  test("checkpoint tanpa koordinat -> no-coords", () => {
    const noCoords = [
      { name: "Tanpa Koordinat", lat: null, lon: null },
    ];
    expect(
      computeNearestCheckpoint({ lat: -6.3, lon: 106.8 }, noCoords).kind,
    ).toBe("no-coords");
  });

  test("seri jarak -> checkpoint pertama dalam urutan menang", () => {
    const tied = [
      { name: "Pertama", lat: -6.3, lon: 106.8 },
      { name: "Kedua", lat: -6.3, lon: 106.8 },
    ];
    const r = computeNearestCheckpoint({ lat: -6.31, lon: 106.81 }, tied);
    expect(r.kind).toBe("nearest");
    if (r.kind !== "nearest") return;
    expect(r.checkpoint).toBe("Pertama");
  });
});

describe("buildTripQaContext — fakta checkpoint terdekat touring", () => {
  test("trip tanpa rute + checkpoint + posisi leader -> fakta trip.nearestCheckpoint (meter, tanpa waktu, tanpa koordinat)", async () => {
    const facts = await buildTripQaContext(
      stubTouringDb({ leaderPos: { lat: -6.301, lon: 106.801 } }),
      baseTrip(),
    );
    const nearest = fact(facts, "trip.nearestCheckpoint");
    expect(nearest).toBeDefined();
    expect(nearest!.text).toContain("Pintu Ancol");
    expect(nearest!.text).toMatch(/\d+ meter/);
    // Touring: jarak saja, tanpa estimasi waktu / pace jalan kaki.
    expect(nearest!.text).not.toMatch(/menit|jam|km\/jam/);
    // Guardrail: koordinat tidak boleh masuk teks fakta.
    expect(nearest!.text).not.toContain("106.8");
    expect(nearest!.text).not.toContain("-6.3");
    // Perilaku rute tidak ikut terbangun di trip tanpa rute.
    expect(fact(facts, "trip.route")).toBeUndefined();
    expect(fact(facts, "trip.nextPost")).toBeUndefined();
  });

  test("trip tanpa rute + checkpoint, leader tanpa posisi -> fakta jujur: posisi belum tersedia, tanpa angka meter", async () => {
    const facts = await buildTripQaContext(
      stubTouringDb({ leaderPos: null }),
      baseTrip(),
    );
    const nearest = fact(facts, "trip.nearestCheckpoint");
    expect(nearest).toBeDefined();
    expect(nearest!.text).toMatch(/posisi leader belum tersedia/i);
    expect(nearest!.text).not.toMatch(/\d+ meter/);
  });

  test("trip tanpa rute tanpa checkpoint -> tidak ada fakta nearestCheckpoint", async () => {
    const facts = await buildTripQaContext(
      stubTouringDb({ leaderPos: { lat: -6.301, lon: 106.801 }, checkpoints: [] }),
      baseTrip(),
    );
    expect(fact(facts, "trip.nearestCheckpoint")).toBeUndefined();
    // Fakta checkpoints tetap ada ("belum ada") untuk jawaban jujur.
    expect(fact(facts, "trip.checkpoints")!.text).toMatch(/belum ada/);
  });

  test("trip ber-rute tetap pakai nextPost, TANPA nearestCheckpoint (perilaku rute tidak berubah)", async () => {
    const db = {
      tripMembersWithUser: async () => [
        {
          tripId: "trip-touring-1",
          userId: "user-leader",
          role: "LEADER",
          attendance: "NOT_DEPARTED",
          user: { id: "user-leader", name: "Leader Tes" },
        },
      ],
      tripCheckpoints: async () => [CP_A, CP_B],
      mountainRoute: async () => ({
        name: "Jalur Tes",
        distanceKm: 8.5,
        gainM: 1200,
        estHours: 6,
        posts: ["Basecamp", "Pos 1", "Puncak"],
        checkpoints: [
          { name: "Basecamp", order: 1, lat: -6.7, lon: 106.9 },
          { name: "Pos 1", order: 2, lat: -6.71, lon: 106.91 },
          { name: "Puncak", order: 3, lat: -6.72, lon: 106.92 },
        ],
      }),
      latestLocations: async () => [
        { userId: "user-leader", lat: -6.7, lon: 106.9 },
      ],
    } as unknown as Db;
    const facts = await buildTripQaContext(
      db,
      baseTrip({ type: "HIKING", mountainId: "mtn-1", routeId: "rte-1" }),
    );
    expect(fact(facts, "trip.nextPost")).toBeDefined();
    expect(fact(facts, "trip.nearestCheckpoint")).toBeUndefined();
  });

  test("trip hanya mountainId (routeId null) tetap dapat nearestCheckpoint dari checkpoint trip", async () => {
    const facts = await buildTripQaContext(
      stubTouringDb({ leaderPos: { lat: -6.301, lon: 106.801 } }),
      baseTrip({ mountainId: "mtn-1", routeId: null }),
    );
    expect(fact(facts, "trip.nearestCheckpoint")).toBeDefined();
    expect(fact(facts, "trip.route")).toBeUndefined();
  });
});

describe("selectSources — kata kunci jarak touring", () => {
  // Daftar fakta trip TANPA rute: tidak ada trip.route / trip.nextPost.
  const facts: TripQaFact[] = [
    { key: "trip.checkpoints", text: "Checkpoint: Pintu Ancol, Pantai Ancol" },
    { key: "trip.nearestCheckpoint", text: "Checkpoint terdekat: Pintu Ancol, jarak sekitar 157 meter" },
    { key: "trip.name", text: "Nama trip: Trip Touring Tes" },
  ];

  test.each([
    ["how far the check point?", ["trip.checkpoints", "trip.nearestCheckpoint"]],
    ["checkpoint terdekat berapa jauh?", ["trip.checkpoints", "trip.nearestCheckpoint"]],
    ["jarak ke checkpoint terdekat?", ["trip.checkpoints", "trip.nearestCheckpoint"]],
    ["berapa jauh checkpoint terdekat?", ["trip.checkpoints", "trip.nearestCheckpoint"]],
    ["distance to the nearest checkpoint?", ["trip.checkpoints", "trip.nearestCheckpoint"]],
  ])("'%s' -> %s", (q, keys) => {
    expect(selectSources(q, facts).map((f) => f.key).sort()).toEqual(
      [...keys].sort(),
    );
  });

  test("OUT_OF_SCOPE tetap menang atas kata kunci jarak touring", () => {
    expect(selectSources("cuaca di checkpoint terdekat?", facts)).toEqual([]);
  });

  test("trip ber-rute: 'how far' tetap memilih rute + nextPost, bukan nearestCheckpoint", () => {
    const routeFacts: TripQaFact[] = [
      { key: "trip.route", text: "Jalur: Jalur Tes" },
      { key: "trip.nextPost", text: "Pos selanjutnya: Pos 1" },
      { key: "trip.checkpoints", text: "Checkpoint: Pintu Ancol" },
    ];
    expect(
      selectSources("how far the check point?", routeFacts).map((f) => f.key).sort(),
    ).toEqual(["trip.checkpoints", "trip.nextPost", "trip.route"].sort());
  });
});
