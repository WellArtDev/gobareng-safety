// M6 live-tracking alerts — GET /trip-groups/:id/member-alerts (integration,
// real Express app + real Postgres). TDD: written before the implementation.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-m6-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "admin123";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await testDb.prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL as string },
    create: {
      email: process.env.ADMIN_EMAIL as string,
      slug: `admin-m6-${run}`,
      name: "Admin",
      isAdmin: true,
      role: "admin",
      isVerified: true,
      passwordHash: null,
      phone: null,
    },
    update: { isAdmin: true, role: "admin", isVerified: true },
  });
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

async function register(name: string): Promise<{ token: string; id: string }> {
  const email = `${name}-${run}@t.local`;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
  });
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

async function makeTrip(
  token: string,
  name: string,
  opts: { start?: boolean } = {},
): Promise<string> {
  await call("PATCH", "/auth/me", token, { phone: "0811111111" });
  const trip = await call("POST", "/trip-groups", token, {
    name,
    type: "HIKING",
    date: "2027-06-01",
    meetingPoint: "X",
  });
  expect(trip.status).toBe(201);
  const tripId = (data(trip).trip as Json).id as string;
  if (opts.start) {
    const started = await call("POST", `/trip-groups/${tripId}/start`, token);
    expect(started.status).toBe(200);
  }
  return tripId;
}

async function postPos(
  tripId: string,
  token: string,
  lat: number,
  lon: number,
  tsMs: number,
  extra: Record<string, unknown> = {},
) {
  const r = await call("POST", `/trip-groups/${tripId}/locations`, token, {
    lat,
    lon,
    timestamp: new Date(tsMs).toISOString(),
    ...extra,
  });
  expect(r.status).toBe(201);
}

async function getAlerts(tripId: string, token: string): Promise<Json[]> {
  const res = await call("GET", `/trip-groups/${tripId}/member-alerts`, token);
  expect(res.status).toBe(200);
  return data(res).alerts as Json[];
}

function ofType(alerts: Json[], userId: string, type: string): Json[] {
  return alerts.filter((a) => a.userId === userId && a.type === type);
}

// Base point + offsets: 0.00005 deg lat ~= 5.5 m (inside 25 m);
// 0.0005 deg lat ~= 55 m (outside 25 m, inside 100 m);
// 0.01 deg lat ~= 1111 m (outside 100 m).
const LAT = -7.2;
const LON = 109.9;
const MIN = 60_000;

describe("M6 NO_MOVEMENT", () => {
  test("stationary member gets NO_MOVEMENT, never signal loss", async () => {
    const leader = await register("m6stat");
    const tripId = await makeTrip(leader.token, "M6 stationary", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT, LON, base - 10 * MIN);
    await postPos(tripId, leader.token, LAT + 0.00005, LON, base - 5 * MIN);
    await postPos(tripId, leader.token, LAT + 0.00008, LON, base);
    const alerts = await getAlerts(tripId, leader.token);
    const nm = ofType(alerts, leader.id, "NO_MOVEMENT");
    expect(nm.length).toBe(1);
    expect(nm[0]!.userName).toBe("User m6stat");
    expect(typeof nm[0]!.lastSeen).toBe("string");
    expect(ofType(alerts, leader.id, "SIGNAL_LOSS").length).toBe(0);
  });

  test("member who just joined (span < 10 min) does not alert", async () => {
    const leader = await register("m6fresh");
    const tripId = await makeTrip(leader.token, "M6 fresh", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT, LON, base - 9 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base);
    const alerts = await getAlerts(tripId, leader.token);
    expect(ofType(alerts, leader.id, "NO_MOVEMENT").length).toBe(0);
  });

  test("movement clears NO_MOVEMENT", async () => {
    const leader = await register("m6move");
    const tripId = await makeTrip(leader.token, "M6 move-clear", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT, LON, base - 20 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base - 15 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base - 10 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base - 5 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "NO_MOVEMENT").length).toBe(1);
    // > 25 m away: the condition clears.
    await postPos(tripId, leader.token, LAT + 0.0005, LON, base + 30_000);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "NO_MOVEMENT").length).toBe(0);
  });
});

describe("M6 signal-loss vs no-movement distinction", () => {
  test("silent member gets signal loss, never NO_MOVEMENT", async () => {
    const leader = await register("m6silent");
    const tripId = await makeTrip(leader.token, "M6 silent", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT, LON, base - 11 * MIN);
    const alerts = await getAlerts(tripId, leader.token);
    expect(ofType(alerts, leader.id, "SIGNAL_LOSS").length).toBe(1);
    expect(ofType(alerts, leader.id, "NO_MOVEMENT").length).toBe(0);
  });
});

describe("M6 OFF_ROUTE", () => {
  async function tripWithRoute(name: string) {
    const leader = await register(name);
    const tripId = await makeTrip(leader.token, `M6 ${name}`, { start: true });
    // East-west polyline along lat -7.2.
    for (const [n, lon] of [
      ["A", 109.9],
      ["B", 110.0],
    ] as const) {
      const cp = await call("POST", `/trip-groups/${tripId}/checkpoints`, leader.token, {
        name: n,
        lat: LAT,
        lon,
      });
      expect(cp.status).toBe(201);
    }
    return { leader, tripId };
  }

  test("fires on the 2nd consecutive off-route position, not the 1st", async () => {
    const { leader, tripId } = await tripWithRoute("m6off1");
    const base = Date.now();
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base - MIN);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "OFF_ROUTE").length).toBe(0);
    await postPos(tripId, leader.token, LAT - 0.01, 109.96, base);
    const alerts = await getAlerts(tripId, leader.token);
    const off = ofType(alerts, leader.id, "OFF_ROUTE");
    expect(off.length).toBe(1);
    expect(off[0]!.userName).toBe("User m6off1");
  });

  test("a position within 100 m of the polyline clears OFF_ROUTE", async () => {
    const { leader, tripId } = await tripWithRoute("m6off2");
    const base = Date.now();
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base - 2 * MIN);
    await postPos(tripId, leader.token, LAT - 0.01, 109.96, base - MIN);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "OFF_ROUTE").length).toBe(1);
    await postPos(tripId, leader.token, LAT - 0.0005, 109.95, base);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "OFF_ROUTE").length).toBe(0);
  });

  test("no checkpoints = off-route inapplicable, never alerts", async () => {
    const leader = await register("m6nocp");
    const tripId = await makeTrip(leader.token, "M6 no checkpoints", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base - MIN);
    await postPos(tripId, leader.token, LAT - 0.01, 109.96, base);
    const alerts = await getAlerts(tripId, leader.token);
    expect(ofType(alerts, leader.id, "OFF_ROUTE").length).toBe(0);
  });
});

describe("M6 anti-flood + trip-status gate", () => {
  test("one alert per member+type while the condition persists; re-fires after clear", async () => {
    const leader = await register("m6flood");
    const tripId = await makeTrip(leader.token, "M6 flood", { start: true });
    const base = Date.now();
    await postPos(tripId, leader.token, LAT, LON, base - 10 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base - 5 * MIN);
    await postPos(tripId, leader.token, LAT, LON, base);
    const first = await getAlerts(tripId, leader.token);
    expect(ofType(first, leader.id, "NO_MOVEMENT").length).toBe(1);
    const second = await getAlerts(tripId, leader.token);
    expect(ofType(second, leader.id, "NO_MOVEMENT").length).toBe(1);
    // Clear by moving, then go stationary at the new place: exactly one again.
    await postPos(tripId, leader.token, LAT + 0.0005, LON, base + 30_000);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "NO_MOVEMENT").length).toBe(0);
    await postPos(tripId, leader.token, LAT + 0.0005, LON, base + 60_000);
    await postPos(tripId, leader.token, LAT + 0.0005, LON, base + 6 * MIN);
    await postPos(tripId, leader.token, LAT + 0.0005, LON, base + 11 * MIN);
    expect(ofType(await getAlerts(tripId, leader.token), leader.id, "NO_MOVEMENT").length).toBe(1);
  });

  test("non-ACTIVE trips: no NO_MOVEMENT/OFF_ROUTE; old alert kinds unchanged", async () => {
    const leader = await register("m6planned");
    const tripId = await makeTrip(leader.token, "M6 planned");
    // Checkpoints exist, so on an ACTIVE trip these positions would fire
    // BOTH new alert kinds (stationary 10+ min AND 2+ consecutive far
    // positions) — the PLANNED gate must suppress both.
    for (const [n, lon] of [
      ["A", 109.9],
      ["B", 110.0],
    ] as const) {
      const cp = await call("POST", `/trip-groups/${tripId}/checkpoints`, leader.token, {
        name: n,
        lat: LAT,
        lon,
      });
      expect(cp.status).toBe(201);
    }
    const base = Date.now();
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base - 10 * MIN);
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base - 5 * MIN);
    await postPos(tripId, leader.token, LAT - 0.01, 109.95, base, { batteryLevel: 10 });
    const alerts = await getAlerts(tripId, leader.token);
    expect(ofType(alerts, leader.id, "NO_MOVEMENT").length).toBe(0);
    expect(ofType(alerts, leader.id, "OFF_ROUTE").length).toBe(0);
    expect(ofType(alerts, leader.id, "LOW_BATTERY").length).toBe(1);
  });
});
