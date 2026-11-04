// AI-R — laporan pasca-trip (TDD). Kontrak yang dikunci di sini:
// 1. Laporan HANYA dari data DB nyata (angka + daftar dicocokkan persis
//    dengan isi DB; narasi AI disimpan verbatim, tidak digabung data).
// 2. Trip belum CLOSED tidak bisa generate (409 TRIP_NOT_CLOSED) dan
//    tidak ada laporan yang tersimpan.
// 3. Hak akses ditegakkan: generate = leader trip + admin saja;
//    baca = anggota trip + admin; non-anggota ditolak.
// 4. Regenerate menimpa laporan yang sama (versi naik, bukan baris baru).
// 5. Fail-soft tanpa konfigurasi AI (503 AI_NOT_CONFIGURED) dan tanpa
//    respons upstream (502 AI_UPSTREAM_ERROR) — tidak ada laporan palsu
//    yang disimpan.
// Stub klien AI hanya di tes ini (fetch global dialihkan untuk base URL
// AI tes saja; panggilan HTTP tes ke localhost tetap lewat fetch asli).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4213;
const BASE = `http://localhost:${PORT}/api/v1`;
const AI_BASE = "https://ai-report-test.invalid/v1";
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;
let origFetch: typeof fetch;
let aiMode: "ok" | "upstream-error" = "ok";
let aiText = "Laporan stub: trip selesai dengan selamat.";

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `Admin-${run}-pw!`;
  process.env.META_MODEL_API_KEY = "test-key";
  process.env.META_MODEL_API_BASE = AI_BASE;
  process.env.META_MODEL_NAME = "muse-spark-open";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  // Stub klien AI (hanya tes): base URL AI dites di sini, sisanya
  // diteruskan ke fetch asli supaya helper HTTP tes tetap jalan.
  origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    if (url.startsWith(AI_BASE)) {
      if (aiMode === "upstream-error") {
        return new Response("upstream down", { status: 502 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: aiText } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return origFetch(input as never, init as never);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = origFetch;
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

let seq = 0;
async function makeUser(
  name: string,
  role: "admin" | "command_center" | "user" = "user",
): Promise<{ id: string; token: string }> {
  const { signToken } = await import("../auth.js");
  const slug = `${name}-${run}-${seq++}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const user = await testDb.createUser({
    email: `${slug}@t.local`,
    name,
    slug,
    passwordHash: "x",
    phone: null,
    isAdmin: role === "admin",
    role,
    isVerified: true,
  });
  return { id: user.id, token: signToken(user) };
}

interface Fixture {
  leader: { id: string; token: string };
  member: { id: string; token: string };
  outsider: { id: string; token: string };
  admin: { id: string; token: string };
  tripId: string;
}

async function makeClosedTrip(): Promise<Fixture> {
  const leader = await makeUser("airleader");
  const member = await makeUser("airmember");
  const outsider = await makeUser("airoutsider");
  const admin = await makeUser("airadmin", "admin");
  const trip = await testDb.createTrip({
    name: `Trip AI-R ${run}-${seq++}`,
    type: "HIKING",
    date: "2026-11-01",
    meetingPoint: "Basecamp",
    isOpenTrip: false,
    leaderId: leader.id,
  });
  await testDb.upsertMember(trip.id, member.id, "MEMBER");
  // Kehadiran nyata: leader + member berangkat.
  await testDb.updateMember(trip.id, leader.id, { attendance: "DEPARTED" });
  await testDb.updateMember(trip.id, member.id, { attendance: "DEPARTED" });
  const cp = await testDb.createCheckpoint({
    tripId: trip.id,
    name: "Pos 1",
    lat: -7.0,
    lon: 110.0,
  });
  await testDb.addCheckIn(cp.id, member.id);
  await testDb.createSos({
    tripId: trip.id,
    senderId: member.id,
    reason: "CEDERA",
    level: "URGENT",
    lat: -7.0,
    lon: 110.0,
  });
  // Data pengecoh dari trip lain — tidak boleh bocor ke laporan ini.
  const decoy = await testDb.createTrip({
    name: `Trip pengecoh ${run}-${seq++}`,
    type: "HIKING",
    date: "2026-11-01",
    meetingPoint: "Lain",
    isOpenTrip: false,
    leaderId: leader.id,
  });
  await testDb.createSos({
    tripId: decoy.id,
    senderId: leader.id,
    reason: "TERSESAT",
    level: "EMERGENCY",
    lat: -7.1,
    lon: 110.1,
  });
  await testDb.updateTrip(trip.id, { status: "CLOSED" });
  return { leader, member, outsider, admin, tripId: trip.id };
}

describe("AI-R laporan pasca-trip", () => {
  test("trip belum selesai tidak bisa generate dan tidak menyimpan laporan", async () => {
    const leader = await makeUser("airplan");
    const trip = await testDb.createTrip({
      name: `Trip planned ${run}-${seq++}`,
      type: "HIKING",
      date: "2026-11-02",
      meetingPoint: "Basecamp",
      isOpenTrip: false,
      leaderId: leader.id,
    });
    const gen = await call("POST", `/trip-groups/${trip.id}/trip-report`, leader.token);
    expect(gen.status).toBe(409);
    expect(errCode(gen)).toBe("TRIP_NOT_CLOSED");
    const got = await call("GET", `/trip-groups/${trip.id}/trip-report`, leader.token);
    expect(got.status).toBe(404);
    expect(errCode(got)).toBe("REPORT_NOT_FOUND");
  });

  test("generate ditolak untuk anggota biasa dan non-anggota; admin boleh", async () => {
    const f = await makeClosedTrip();
    const byMember = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.member.token);
    expect(byMember.status).toBe(403);
    const byOutsider = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.outsider.token);
    expect(byOutsider.status).toBe(403);
    const byAdmin = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.admin.token);
    expect(byAdmin.status).toBe(201);
    const report = data(byAdmin).report as Json;
    expect(report.model).toBe("muse-spark-open");
    expect(report.summary).toBe(aiText);
  });

  test("laporan hanya dari data DB nyata + dibaca anggota trip", async () => {
    const f = await makeClosedTrip();
    aiText = "Narasi laporan dari data nyata.";
    const gen = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(gen.status).toBe(201);
    const report = data(gen).report as Json;
    const facts = report.facts as Json;
    expect(facts.memberCount).toBe(2);
    expect(facts.departedCount).toBe(2);
    expect(facts.checkpointCount).toBe(1);
    expect(facts.checkInCount).toBe(1);
    expect(facts.sosTotal).toBe(1);
    // Hanya SOS trip ini (CEDERA), bukan SOS trip pengecoh (TERSESAT).
    expect(facts.sosByReason).toEqual([{ reason: "CEDERA", count: 1 }]);
    const attendance = facts.attendance as { name: string; attendance: string }[];
    expect(attendance.map((a) => a.name).sort()).toEqual(["airleader", "airmember"]);
    expect(attendance.every((a) => a.attendance === "DEPARTED")).toBe(true);
    expect(report.summary).toBe("Narasi laporan dari data nyata.");
    // Anggota boleh membaca laporannya sendiri; non-anggota tidak.
    const readMember = await call("GET", `/trip-groups/${f.tripId}/trip-report`, f.member.token);
    expect(readMember.status).toBe(200);
    expect((data(readMember).report as Json).id).toBe(report.id);
    const readOutsider = await call("GET", `/trip-groups/${f.tripId}/trip-report`, f.outsider.token);
    expect(readOutsider.status).toBe(403);
  });

  test("regenerate menimpa laporan yang sama dengan versi naik", async () => {
    const f = await makeClosedTrip();
    aiText = "Versi pertama.";
    const first = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(first.status).toBe(201);
    const r1 = data(first).report as Json;
    expect(r1.version).toBe(1);
    expect(r1.isRegenerated).toBe(false);
    aiText = "Versi kedua, diperbarui.";
    const second = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(second.status).toBe(200);
    const r2 = data(second).report as Json;
    expect(r2.id).toBe(r1.id);
    expect(r2.version).toBe(2);
    expect(r2.isRegenerated).toBe(true);
    expect(r2.summary).toBe("Versi kedua, diperbarui.");
    expect(r2.createdAt).toBe(r1.createdAt);
  });

  test("AI tidak dikonfigurasi: 503 dan tidak ada laporan palsu tersimpan", async () => {
    const f = await makeClosedTrip();
    const { config } = await import("../config.js");
    const savedKey = config.metaModelApiKey;
    const savedBase = config.metaModelApiBase;
    (config as unknown as Record<string, string>).metaModelApiKey = "";
    (config as unknown as Record<string, string>).metaModelApiBase = "";
    try {
      const gen = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
      expect(gen.status).toBe(503);
      expect(errCode(gen)).toBe("AI_NOT_CONFIGURED");
    } finally {
      (config as unknown as Record<string, string>).metaModelApiKey = savedKey;
      (config as unknown as Record<string, string>).metaModelApiBase = savedBase;
    }
    const got = await call("GET", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(got.status).toBe(404);
  });

  test("modul aiR mati = 403 AI_MODULE_DISABLED, lalu nyala lagi", async () => {
    const f = await makeClosedTrip();
    await testDb.updatePlatformSettings({ aiR: false });
    const off = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(off.status).toBe(403);
    expect(errCode(off)).toBe("AI_MODULE_DISABLED");
    await testDb.updatePlatformSettings({ aiR: true });
    const on = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(on.status).toBe(201);
  });

  test("upstream AI gagal: 502 dan tidak ada laporan tersimpan", async () => {
    const f = await makeClosedTrip();
    aiMode = "upstream-error";
    try {
      const gen = await call("POST", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
      expect(gen.status).toBe(502);
      expect(errCode(gen)).toBe("AI_UPSTREAM_ERROR");
    } finally {
      aiMode = "ok";
    }
    const got = await call("GET", `/trip-groups/${f.tripId}/trip-report`, f.leader.token);
    expect(got.status).toBe(404);
  });
});
