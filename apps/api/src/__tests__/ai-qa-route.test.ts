// AI-Q konteks jalur + pos selanjutnya (Scope B, TDD).
// Tes unit murni — tanpa HTTP/DB: buildTripQaContext dipanggil dengan
// stub Db (tripMembersWithUser, tripCheckpoints, mountainRoute,
// latestLocations) dan computeNextPost diuji langsung. Koordinat tidak
// boleh muncul di teks fakta apa pun: model hanya menerima nama pos
// dan angka jarak/waktu yang sudah dihitung server.
import { describe, expect, test } from "bun:test";
import {
  buildTripQaContext,
  computeNextPost,
  selectSources,
  type TripQaFact,
} from "../ai-qa.js";
import type { Db } from "../db.js";
import type { Trip } from "../store.js";

const BASECAMP = { name: "Basecamp", order: 1, lat: -6.7, lon: 106.9 };
const POS1 = { name: "Pos 1", order: 2, lat: -6.71, lon: 106.91 };
const PUNCAK = { name: "Puncak", order: 3, lat: -6.72, lon: 106.92 };

function fact(facts: TripQaFact[], key: string): TripQaFact | undefined {
  return facts.find((f) => f.key === key);
}

function baseTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "trip-rute-1",
    name: "Trip Rute Tes",
    type: "HIKING",
    date: "2026-12-20",
    meetingPoint: "Basecamp",
    meetingLat: null,
    meetingLon: null,
    destination: null,
    destinationLat: null,
    destinationLon: null,
    quota: 10,
    durationDays: null,
    prevJoined: null,
    image: null,
    note: null,
    isOpenTrip: false,
    price: null,
    mountainId: "mtn-1",
    routeId: "rte-1",
    mountainName: null,
    routeName: null,
    distanceKm: null,
    gainM: null,
    estHours: null,
    status: "OPEN",
    leaderId: "user-leader",
    createdAt: "2026-11-03T00:00:00.000Z",
    ...overrides,
  };
}

function stubDb(opts: {
  leaderPos: { lat: number; lon: number } | null;
  route?: {
    name: string;
    distanceKm: number | null;
    gainM: number | null;
    estHours: number | null;
    posts: string[];
    checkpoints: { name: string; order: number; lat: number | null; lon: number | null }[];
  } | null;
}): Db {
  const route =
    opts.route === undefined
      ? {
          name: "Jalur Tes",
          distanceKm: 8.5,
          gainM: 1200,
          estHours: 6,
          posts: ["Basecamp", "Pos 1", "Puncak"],
          checkpoints: [BASECAMP, POS1, PUNCAK],
        }
      : opts.route;
  return {
    tripMembersWithUser: async () => [
      {
        tripId: "trip-rute-1",
        userId: "user-leader",
        role: "LEADER",
        attendance: "NOT_DEPARTED",
        user: { id: "user-leader", name: "Leader Tes" },
      },
      {
        tripId: "trip-rute-1",
        userId: "user-mem",
        role: "MEMBER",
        attendance: "NOT_DEPARTED",
        user: { id: "user-mem", name: "Member Tes" },
      },
    ],
    tripCheckpoints: async () => [],
    mountainRoute: async () => route,
    latestLocations: async () =>
      opts.leaderPos
        ? [{ userId: "user-leader", lat: opts.leaderPos.lat, lon: opts.leaderPos.lon }]
        : [],
  } as unknown as Db;
}

describe("computeNextPost (murni, tanpa DB)", () => {
  const posts = [BASECAMP, POS1, PUNCAK];

  test("leader di Basecamp -> pos selanjutnya Pos 1 + jarak meter + menit", () => {
    const r = computeNextPost({ lat: -6.7, lon: 106.9 }, posts);
    expect(r.kind).toBe("next");
    if (r.kind !== "next") return;
    expect(r.nextPost).toBe("Pos 1");
    // Basecamp -> Pos 1: ~1,5 km (haversine, toleransi longgar).
    expect(r.distanceM).toBeGreaterThan(1400);
    expect(r.distanceM).toBeLessThan(1700);
    // 3 km/jam -> ~31 menit.
    expect(r.minutes).toBeGreaterThanOrEqual(28);
    expect(r.minutes).toBeLessThanOrEqual(34);
  });

  test("leader di dekat Pos 1 -> pos selanjutnya Puncak", () => {
    const r = computeNextPost({ lat: -6.7105, lon: 106.9105 }, posts);
    expect(r.kind).toBe("next");
    if (r.kind !== "next") return;
    expect(r.nextPost).toBe("Puncak");
  });

  test("leader di pos terakhir -> past-last, tanpa jarak", () => {
    const r = computeNextPost({ lat: -6.72, lon: 106.92 }, posts);
    expect(r.kind).toBe("past-last");
    if (r.kind !== "past-last") return;
    expect(r.lastPost).toBe("Puncak");
  });

  test("tanpa posisi leader -> no-position", () => {
    expect(computeNextPost(null, posts).kind).toBe("no-position");
  });

  test("rute tanpa pos berkoordinat -> no-coords", () => {
    const noCoords = [
      { name: "Basecamp", order: 1, lat: null, lon: null },
      { name: "Puncak", order: 2, lat: null, lon: null },
    ];
    expect(computeNextPost({ lat: -6.7, lon: 106.9 }, noCoords).kind).toBe(
      "no-coords",
    );
  });

  test("pos tanpa koordinat di tengah dilewati: nearest Basecamp -> next Puncak", () => {
    const sparse = [
      BASECAMP,
      { name: "Pos Tanpa Koordinat", order: 2, lat: null, lon: null },
      PUNCAK,
    ];
    const r = computeNextPost({ lat: -6.7, lon: 106.9 }, sparse);
    expect(r.kind).toBe("next");
    if (r.kind !== "next") return;
    expect(r.nextPost).toBe("Puncak");
  });
});

describe("buildTripQaContext — fakta jalur", () => {
  test("trip ber-rute -> fakta trip.route (nama + pos urut + jarak/gain/estimasi)", async () => {
    const facts = await buildTripQaContext(
      stubDb({ leaderPos: { lat: -6.7, lon: 106.9 } }),
      baseTrip(),
    );
    const route = fact(facts, "trip.route");
    expect(route).toBeDefined();
    expect(route!.text).toContain("Jalur Tes");
    expect(route!.text).toContain("Basecamp, Pos 1, Puncak");
    expect(route!.text).toContain("8.5");
    expect(route!.text).toContain("1200");
    expect(route!.text).toContain("6");
    // Guardrail: koordinat tidak boleh masuk teks fakta.
    expect(route!.text).not.toContain("106.9");
    expect(route!.text).not.toContain("-6.7");
  });

  test("trip ber-rute + posisi leader -> fakta trip.nextPost dengan meter + menit + asumsi pace", async () => {
    const facts = await buildTripQaContext(
      stubDb({ leaderPos: { lat: -6.7, lon: 106.9 } }),
      baseTrip(),
    );
    const next = fact(facts, "trip.nextPost");
    expect(next).toBeDefined();
    expect(next!.text).toContain("Pos 1");
    expect(next!.text).toMatch(/\d+ meter/);
    expect(next!.text).toMatch(/\d+ menit/);
    expect(next!.text).toContain("3 km/jam");
    expect(next!.text).not.toContain("106.9");
    expect(next!.text).not.toContain("-6.7");
  });

  test("trip tanpa routeId -> tidak ada fakta rute sama sekali", async () => {
    const facts = await buildTripQaContext(
      stubDb({ leaderPos: { lat: -6.7, lon: 106.9 } }),
      baseTrip({ mountainId: null, routeId: null }),
    );
    expect(fact(facts, "trip.route")).toBeUndefined();
    expect(fact(facts, "trip.nextPost")).toBeUndefined();
  });

  test("leader tanpa posisi tersimpan -> fakta nextPost jujur: posisi belum tersedia", async () => {
    const facts = await buildTripQaContext(
      stubDb({ leaderPos: null }),
      baseTrip(),
    );
    expect(fact(facts, "trip.route")).toBeDefined();
    const next = fact(facts, "trip.nextPost");
    expect(next).toBeDefined();
    expect(next!.text).toMatch(/posisi leader belum tersedia/i);
    expect(next!.text).not.toMatch(/\d+ meter/);
  });

  test("leader sudah melewati pos terakhir -> fakta nextPost jujur, tanpa jarak", async () => {
    const facts = await buildTripQaContext(
      stubDb({ leaderPos: { lat: -6.72, lon: 106.92 } }),
      baseTrip(),
    );
    const next = fact(facts, "trip.nextPost");
    expect(next).toBeDefined();
    expect(next!.text).toMatch(/melewati pos terakhir/i);
    expect(next!.text).toContain("Puncak");
    expect(next!.text).not.toMatch(/\d+ meter/);
  });

  test("rute tanpa pos berkoordinat -> fakta rute saja, tanpa fakta nextPost", async () => {
    const facts = await buildTripQaContext(
      stubDb({
        leaderPos: { lat: -6.7, lon: 106.9 },
        route: {
          name: "Jalur Tanpa Koordinat",
          distanceKm: null,
          gainM: null,
          estHours: null,
          posts: ["Basecamp", "Puncak"],
          checkpoints: [
            { name: "Basecamp", order: 1, lat: null, lon: null },
            { name: "Puncak", order: 2, lat: null, lon: null },
          ],
        },
      }),
      baseTrip(),
    );
    expect(fact(facts, "trip.route")).toBeDefined();
    expect(fact(facts, "trip.nextPost")).toBeUndefined();
  });

  test("leader dari trip.leaderId bila tidak ada member LEADER", async () => {
    const db = {
      tripMembersWithUser: async () => [
        {
          tripId: "trip-rute-1",
          userId: "user-leader",
          role: "MEMBER",
          attendance: "NOT_DEPARTED",
          user: { id: "user-leader", name: "Leader Tes" },
        },
      ],
      tripCheckpoints: async () => [],
      mountainRoute: async () => ({
        name: "Jalur Tes",
        distanceKm: 8.5,
        gainM: 1200,
        estHours: 6,
        posts: ["Basecamp", "Pos 1", "Puncak"],
        checkpoints: [BASECAMP, POS1, PUNCAK],
      }),
      latestLocations: async () => [
        { userId: "user-leader", lat: -6.7, lon: 106.9 },
      ],
    } as unknown as Db;
    const facts = await buildTripQaContext(db, baseTrip());
    expect(fact(facts, "trip.nextPost")!.text).toContain("Pos 1");
  });
});

describe("selectSources — kata kunci jalur / pos selanjutnya", () => {
  const facts: TripQaFact[] = [
    { key: "trip.route", text: "Jalur: Jalur Tes" },
    { key: "trip.nextPost", text: "Pos selanjutnya: Pos 1" },
    { key: "trip.name", text: "Nama trip: Trip Rute Tes" },
    { key: "trip.price", text: "Harga: gratis" },
  ];

  test.each([
    ["pos selanjutnya apa?", ["trip.route", "trip.nextPost"]],
    ["berapa jauh pos berikutnya?", ["trip.route", "trip.nextPost"]],
    ["jarak ke pos terdekat berapa?", ["trip.route", "trip.nextPost"]],
    ["jalur apa yang dipakai trip ini?", ["trip.route", "trip.nextPost"]],
    ["rute pendakian ini lewat pos apa saja?", ["trip.route", "trip.nextPost"]],
    // Laporan HP nyata 3 Nov 2026: "how far to check point" hanya
    // memilih trip.checkpoints -> jawaban "Not in the trip data".
    // Frasa jarak berbahasa Inggris harus ikut memilih rute + nextPost.
    ["how far to check point?", ["trip.route", "trip.nextPost"]],
    ["how far to the next checkpoint?", ["trip.route", "trip.nextPost"]],
    ["what is the nearest checkpoint?", ["trip.route", "trip.nextPost"]],
    ["distance to the next post?", ["trip.route", "trip.nextPost"]],
  ])("'%s' -> %s", (q, keys) => {
    expect(selectSources(q, facts).map((f) => f.key).sort()).toEqual(
      [...keys].sort(),
    );
  });

  test("OUT_OF_SCOPE tetap menang atas kata kunci jalur", () => {
    expect(selectSources("bagaimana cuaca di jalur ini?", facts)).toEqual([]);
    expect(selectSources("berapa harga tiket masuk jalur ini?", facts)).toEqual(
      [],
    );
  });

  test("pertanyaan tanpa kata kunci -> tidak ada sumber (notFound)", () => {
    expect(selectSources("siapa presiden?", facts)).toEqual([]);
  });
});
