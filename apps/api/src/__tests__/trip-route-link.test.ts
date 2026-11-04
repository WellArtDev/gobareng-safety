// TAUTAN RUTE TRIP HIKING (3 Nov 2026, PR api-rute-trip-hiking):
// POST /trip-groups menerima + menyimpan mountainId/routeId untuk
// trip hiking; GET mengembalikan field turunan mountainName /
// routeName / distanceKm / gainM / estHours (bentuk yang diharapkan
// helper mobile resolveTripRouteInfo() di PR #191); saat pembuatan,
// pos jalur (RoutePost) berkoordinat disalin menjadi Checkpoint trip
// secara otomatis, urut sesuai RoutePost.order. TDD: file ini ditulis
// dulu, implementasi menyusul.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4197;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

beforeAll(async () => {
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
});

afterAll(() => {
  http?.close();
});

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Json };
}

function data(r: { json: Json }): Json {
  return r.json.data as Json;
}
function errCode(r: { json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    _channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean }> => {
    sentCodes.set(destination, code);
    return { ok: true };
  },
}));

let registerSeq = 0;

async function register(name: string): Promise<{ token: string; id: string }> {
  const email = `${name}-${run}-${registerSeq++}@t.local`;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(first.status).toBe(200);
  const second = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
    name: `User ${name}`,
  });
  expect(second.status).toBe(200);
  const d = data(second);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

async function setPhone(token: string, phone: string): Promise<void> {
  const r = await call("PATCH", "/auth/me", token, { phone });
  expect(r.status).toBe(200);
}

let seedSeq = 0;

async function seedRoute(opts: {
  distanceKm?: number | null;
  gainM?: number | null;
  estHours?: number | null;
  posts?: { order: number; name: string; lat: number | null; lon: number | null; isGathering?: boolean }[];
} = {}): Promise<{ mountainId: string; routeId: string }> {
  const n = seedSeq++;
  const mountainId = `mtn-${run}-${n}`;
  const routeId = `rte-${run}-${n}`;
  await testDb.prisma.mountain.create({
    data: {
      id: mountainId,
      name: `Gunung Tes ${n}`,
      elevationM: 2958,
      location: "Jawa Barat",
      difficultyKey: "MEDIUM",
    },
  });
  await testDb.prisma.mountainRoute.create({
    data: {
      id: routeId,
      mountainId,
      name: `Jalur Tes ${n}`,
      meetingPoint: "Basecamp",
      distanceKm: opts.distanceKm ?? 8.5,
      gainM: opts.gainM ?? 1200,
      estHours: opts.estHours ?? 6,
    },
  });
  const posts = opts.posts ?? [
    { order: 1, name: "Basecamp", lat: -6.7, lon: 106.9, isGathering: true },
    { order: 2, name: "Pos 1", lat: -6.71, lon: 106.91 },
    { order: 3, name: "Puncak", lat: -6.72, lon: 106.92 },
  ];
  for (const p of posts) {
    await testDb.prisma.routePost.create({
      data: {
        routeId,
        order: p.order,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        isGathering: p.isGathering ?? false,
      },
    });
  }
  return { mountainId, routeId };
}

async function createHikingTrip(
  token: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; json: Json }> {
  return call("POST", "/trip-groups", token, {
    name: `Hiking ${run}-${Math.random().toString(36).slice(2, 8)}`,
    type: "HIKING",
    date: "2027-06-01",
    meetingPoint: "Basecamp",
    ...extra,
  });
}

async function tripCheckpoints(tripId: string, token: string): Promise<Json[]> {
  const r = await call("GET", `/trip-groups/${tripId}/checkpoints`, token);
  expect(r.status).toBe(200);
  return (data(r).checkpoints as Json[]) ?? [];
}

describe("ROUTE LINK: POST hiking menyimpan tautan rute + menyalin pos jalur", () => {
  test("mountainId + routeId -> field turunan di GET + checkpoint tersalin urut", async () => {
    const leader = await register("route-leader");
    await setPhone(leader.token, "6281234567890");
    const { mountainId, routeId } = await seedRoute();
    const created = await createHikingTrip(leader.token, { mountainId, routeId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    expect(trip.mountainId).toBe(mountainId);
    expect(trip.routeId).toBe(routeId);
    expect(trip.mountainName).toMatch(/^Gunung Tes /);
    expect(trip.routeName).toMatch(/^Jalur Tes /);
    expect(trip.distanceKm).toBe(8.5);
    expect(trip.gainM).toBe(1200);
    expect(trip.estHours).toBe(6);

    const detail = await call("GET", `/trip-groups/${trip.id}`, leader.token);
    expect(detail.status).toBe(200);
    const dt = data(detail).trip as Json;
    expect(dt.mountainName).toBe(trip.mountainName);
    expect(dt.routeName).toBe(trip.routeName);
    expect(dt.distanceKm).toBe(8.5);

    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.map((c) => c.name)).toEqual(["Basecamp", "Pos 1", "Puncak"]);
    expect(cps[0].lat).toBe(-6.7);
    expect(cps[2].lon).toBe(106.92);
  });

  test("hanya routeId -> mountainId diturunkan dari jalur", async () => {
    const leader = await register("route-only");
    await setPhone(leader.token, "6281234567891");
    const { mountainId, routeId } = await seedRoute();
    const created = await createHikingTrip(leader.token, { routeId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    expect(trip.routeId).toBe(routeId);
    expect(trip.mountainId).toBe(mountainId);
    expect(trip.mountainName).toMatch(/^Gunung Tes /);
    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.length).toBe(3);
  });

  test("hanya mountainId -> nama gunung ada, tanpa rute/checkpoint", async () => {
    const leader = await register("mtn-only");
    await setPhone(leader.token, "6281234567892");
    const { mountainId } = await seedRoute();
    const created = await createHikingTrip(leader.token, { mountainId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    expect(trip.mountainId).toBe(mountainId);
    expect(trip.routeId).toBeNull();
    expect(trip.mountainName).toMatch(/^Gunung Tes /);
    expect(trip.routeName).toBeNull();
    expect(trip.distanceKm).toBeNull();
    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.length).toBe(0);
  });

  test("routeId tidak ada -> 400 INVALID_ROUTE, trip tidak dibuat", async () => {
    const leader = await register("route-bad");
    await setPhone(leader.token, "6281234567893");
    const created = await createHikingTrip(leader.token, { routeId: "tidak-ada" });
    expect(created.status).toBe(400);
    expect(errCode(created)).toBe("INVALID_ROUTE");
  });

  test("mountainId tidak cocok dengan gunung si jalur -> 400 INVALID_ROUTE", async () => {
    const leader = await register("route-mismatch");
    await setPhone(leader.token, "6281234567894");
    const a = await seedRoute();
    const b = await seedRoute();
    const created = await createHikingTrip(leader.token, {
      mountainId: b.mountainId,
      routeId: a.routeId,
    });
    expect(created.status).toBe(400);
    expect(errCode(created)).toBe("INVALID_ROUTE");
  });

  test("touring membawa mountainId/routeId -> 400 INVALID_ROUTE (touring tak berubah)", async () => {
    const leader = await register("route-touring");
    await setPhone(leader.token, "6281234567895");
    const { mountainId, routeId } = await seedRoute();
    const r = await call("POST", "/trip-groups", leader.token, {
      name: `Touring ${run}`,
      type: "TOURING",
      date: "2027-06-01",
      meetingPoint: "Titik kumpul",
      mountainId,
      routeId,
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("INVALID_ROUTE");
  });

  test("tanpa field rute -> perilaku lama: field null, tanpa checkpoint", async () => {
    const leader = await register("route-none");
    await setPhone(leader.token, "6281234567896");
    const created = await createHikingTrip(leader.token);
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    expect(trip.mountainId).toBeNull();
    expect(trip.routeId).toBeNull();
    expect(trip.mountainName).toBeNull();
    expect(trip.routeName).toBeNull();
    expect(trip.distanceKm).toBeNull();
    expect(trip.gainM).toBeNull();
    expect(trip.estHours).toBeNull();
    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.length).toBe(0);
  });

  test("pos tanpa koordinat dilewati, urutan RoutePost.order dipertahankan", async () => {
    const leader = await register("route-skip");
    await setPhone(leader.token, "6281234567897");
    const { mountainId, routeId } = await seedRoute({
      posts: [
        { order: 2, name: "Pos 2", lat: -6.71, lon: 106.91 },
        { order: 1, name: "Basecamp", lat: -6.7, lon: 106.9, isGathering: true },
        { order: 3, name: "Pos Tanpa Koordinat", lat: null, lon: null },
        { order: 4, name: "Puncak", lat: -6.72, lon: 106.92 },
      ],
    });
    const created = await createHikingTrip(leader.token, { mountainId, routeId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.map((c) => c.name)).toEqual(["Basecamp", "Pos 2", "Puncak"]);
  });

  test("checkpoint manual leader sesudahnya tidak menduplikasi salinan rute", async () => {
    const leader = await register("route-manual");
    await setPhone(leader.token, "6281234567898");
    const { mountainId, routeId } = await seedRoute();
    const created = await createHikingTrip(leader.token, { mountainId, routeId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    const add = await call("POST", `/trip-groups/${trip.id}/checkpoints`, leader.token, {
      name: "Pos Manual",
      lat: -6.73,
      lon: 106.93,
    });
    expect(add.status).toBe(201);
    const cps = await tripCheckpoints(trip.id as string, leader.token);
    expect(cps.map((c) => c.name)).toEqual(["Basecamp", "Pos 1", "Puncak", "Pos Manual"]);
  });

  test("daftar trip ikut membawa field rute", async () => {
    const leader = await register("route-list");
    await setPhone(leader.token, "6281234567899");
    const { mountainId, routeId } = await seedRoute();
    const created = await createHikingTrip(leader.token, { mountainId, routeId });
    expect(created.status).toBe(201);
    const trip = data(created).trip as Json;
    const list = await call("GET", "/trip-groups", leader.token);
    expect(list.status).toBe(200);
    const trips = data(list).trips as Json[];
    const found = trips.find((t) => t.id === trip.id);
    expect(found).toBeDefined();
    expect(found!.mountainName).toMatch(/^Gunung Tes /);
    expect(found!.routeName).toMatch(/^Jalur Tes /);
    expect(found!.distanceKm).toBe(8.5);
  });
});
