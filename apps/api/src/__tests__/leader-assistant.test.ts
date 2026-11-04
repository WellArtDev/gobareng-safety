// AI-L — integration: GET /trip-groups/:id/leader-assistant.
// Runs against the real app + the gbtest_ail Postgres DB (fresh per
// run via unique emails). AI is NOT configured in this env, so the
// endpoint must still return 200 with full DB facts + an explicit
// AI_NOT_CONFIGURED status — the leader workflow never depends on
// the model being up.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4195;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;
let leaderToken = "";
let memberToken = "";
let tripId = "";

beforeAll(async () => {
  // DATABASE_URL for gbtest_ail is injected by the test runner env;
  // config.ts reads it at import, hence the dynamic import here.
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));

  // Register password dimatikan (410 OTP_ONLY): seed user langsung
  // lewat Db + token JWT lokal, seperti pola legacy di api.test.ts.
  const { signToken } = await import("../auth.js");
  const mkUser = async (name: string) => {
    const u = await testDb.createUser({
      email: `${name}-${run}@t.local`,
      name: `User ${name}`,
      slug: `${name}-${run}`,
      passwordHash: "unused-in-this-test",
      phone: null,
      isAdmin: false,
      role: "user",
      isVerified: true,
    });
    return { user: u, token: signToken(u) };
  };
  const leader = await mkUser("ailleader");
  leaderToken = leader.token;
  const member = await mkUser("ailmember");
  memberToken = member.token;

  // createTrip otomatis menambahkan leader sebagai anggota LEADER.
  const createdTrip = await testDb.createTrip({
    name: "Gede AI-L",
    type: "HIKING",
    date: "2020-01-01",
    meetingPoint: "Basecamp",
    quota: 10,
    isOpenTrip: false,
    leaderId: leader.user.id,
  });
  tripId = createdTrip.id;

  await testDb.upsertMember(tripId, member.user.id, "MEMBER");
  // Member departs (meeting-point check-in); leader stays NOT_DEPARTED
  // so the headcount split is 1/2 in the assertions below.
  await testDb.updateMember(tripId, member.user.id, { attendance: "DEPARTED" });
  await testDb.addLocation({
    tripId,
    userId: member.user.id,
    lat: -6.7,
    lon: 106.9,
    batteryLevel: 90,
    ts: new Date().toISOString(),
  });
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

describe("AI-L leader-assistant endpoint", () => {
  test("leader dapat fakta lengkap + status AI eksplisit tanpa model", async () => {
    const r = await call(
      "GET",
      `/trip-groups/${tripId}/leader-assistant`,
      leaderToken,
    );
    expect(r.status).toBe(200);
    const d = data(r);
    expect(d.aiStatus).toBe("AI_NOT_CONFIGURED");
    expect(d.summary).toBeNull();
    expect(d.model).toBeNull();
    const facts = d.facts as Json;
    const headcount = facts.headcount as Json;
    expect(headcount.total).toBe(2);
    expect(headcount.departed).toBe(1);
    expect(headcount.notDeparted).toBe(1);
    // Fakta tidak boleh membocorkan gender anggota.
    expect(JSON.stringify(facts)).not.toContain("gender");
    expect(Array.isArray(facts.members)).toBe(true);
    expect(Array.isArray(facts.overdueCheckins)).toBe(true);
    expect((facts.risk as Json).highRisk).toBe(false);
  });

  test("modul aiL mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    await testDb.updatePlatformSettings({ aiL: false });
    const off = await call("GET", `/trip-groups/${tripId}/leader-assistant`, leaderToken);
    expect(off.status).toBe(403);
    expect((off.json.error as Record<string, unknown>).code).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiL: true });
    const on = await call("GET", `/trip-groups/${tripId}/leader-assistant`, leaderToken);
    expect(on.status).toBe(200);
  });

  test("anggota biasa ditolak LEADER_ONLY", async () => {
    const r = await call(
      "GET",
      `/trip-groups/${tripId}/leader-assistant`,
      memberToken,
    );
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("LEADER_ONLY");
  });

  test("tanpa token = 401", async () => {
    const r = await call("GET", `/trip-groups/${tripId}/leader-assistant`);
    expect(r.status).toBe(401);
  });
});
