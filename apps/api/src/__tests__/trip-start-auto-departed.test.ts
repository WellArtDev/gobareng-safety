// Start Trip otomatis Berangkat (keputusan pemilik 3 Nov 2026 16:51 WIB):
// leader menekan Start Trip -> SEMUA anggota otomatis DEPARTED tanpa
// check-in manual, semua anggota dapat notifikasi trip dimulai, dan
// Akhiri Trip tidak lagi terblokir "anggota belum terkonfirmasi".
// TDD: file ini ditulis dulu, implementasi menyusul.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4198;
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

async function callGet(
  path: string,
  token?: string,
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: res.status, json: (await res.json()) as Json };
}

async function callMethod(
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
  const req = await callMethod("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const first = await callMethod("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(first.status).toBe(200);
  const second = await callMethod("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
    name: `User ${name}`,
  });
  expect(second.status).toBe(200);
  const d = data(second);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

async function setPhone(token: string, phone: string): Promise<void> {
  const r = await callMethod("PATCH", "/auth/me", token, { phone });
  expect(r.status).toBe(200);
}

async function createTrip(token: string): Promise<{ id: string }> {
  const r = await callMethod("POST", "/trip-groups", token, {
    name: `Trip ${run}-${Math.random().toString(36).slice(2, 8)}`,
    type: "TOURING",
    date: "2027-06-01",
    meetingPoint: "Titik kumpul",
    quota: null,
    price: null,
  });
  expect(r.status).toBe(201);
  return { id: (data(r).trip as Json).id as string };
}

async function setupTrip(): Promise<{
  tripId: string;
  leader: { token: string; id: string };
  member: { token: string; id: string };
}> {
  const leader = await register("start-leader");
  await setPhone(leader.token, "0811111111");
  const trip = await createTrip(leader.token);
  const member = await register("start-member");
  const joined = await callMethod("POST", `/trip-groups/${trip.id}/join`, member.token);
  expect(joined.status).toBe(200);
  return { tripId: trip.id, leader, member };
}

async function attendance(tripId: string, token: string): Promise<Json> {
  const r = await callGet(`/trip-groups/${tripId}/attendance-summary`, token);
  expect(r.status).toBe(200);
  return data(r);
}

async function notifications(token: string): Promise<Json[]> {
  const r = await callGet("/notifications", token);
  expect(r.status).toBe(200);
  return data(r).notifications as Json[];
}

describe("START OTOMATIS BERANGKAT: semua anggota DEPARTED saat start", () => {
  test("sebelum start: belum ada yang berangkat", async () => {
    const { tripId, leader } = await setupTrip();
    const s = await attendance(tripId, leader.token);
    expect(s.total).toBe(2);
    expect(s.departed).toBe(0);
    expect(s.notDeparted).toBe(2);
  });

  test("start: status ACTIVE + semua DEPARTED + close tanpa konfirmasi lolos", async () => {
    const { tripId, leader } = await setupTrip();
    const started = await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(started.status).toBe(200);
    expect((data(started).trip as Json).status).toBe("ACTIVE");
    const s = await attendance(tripId, leader.token);
    expect(s.total).toBe(2);
    expect(s.departed).toBe(2);
    expect(s.notDeparted).toBe(0);
    const headcount = await callGet(`/trip-groups/${tripId}/headcount`, leader.token);
    expect(headcount.status).toBe(200);
    expect((data(headcount).unaccounted as Json[]).length).toBe(0);
    // Akhiri Trip tidak boleh lagi 409 TRIP_HAS_UNACCOUNTED_MEMBERS.
    const closed = await callMethod("POST", `/trip-groups/${tripId}/close`, leader.token);
    expect(closed.status).toBe(200);
    expect((data(closed).trip as Json).status).toBe("CLOSED");
  });

  test("check-in titik kumpul setelah start tetap sukses (idempotent)", async () => {
    const { tripId, leader, member } = await setupTrip();
    const started = await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(started.status).toBe(200);
    const checkin = await callMethod(
      "POST",
      `/trip-groups/${tripId}/check-in-meeting-point`,
      member.token,
    );
    expect(checkin.status).toBe(200);
    expect(((data(checkin).member as Json).attendance as string)).toBe("DEPARTED");
    const s = await attendance(tripId, leader.token);
    expect(s.departed).toBe(2);
  });

  test("semua anggota dapat notifikasi in-app TRIP_STARTED", async () => {
    const { tripId, leader, member } = await setupTrip();
    const started = await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(started.status).toBe(200);
    for (const viewer of [leader, member]) {
      const rows = (await notifications(viewer.token)).filter(
        (n) => n.kind === "TRIP_STARTED" && n.tripId === tripId,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].refId).toBe(tripId);
    }
  });

  test("start kedua (sudah ACTIVE) tidak menggandakan notifikasi", async () => {
    const { tripId, leader, member } = await setupTrip();
    expect((await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token)).status).toBe(200);
    expect((await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token)).status).toBe(200);
    const rows = (await notifications(member.token)).filter(
      (n) => n.kind === "TRIP_STARTED" && n.tripId === tripId,
    );
    expect(rows.length).toBe(1);
    const s = await attendance(tripId, leader.token);
    expect(s.departed).toBe(2);
  });

  test("member biasa start tetap 403 LEADER_ONLY", async () => {
    const { tripId, member } = await setupTrip();
    const r = await callMethod("POST", `/trip-groups/${tripId}/start`, member.token);
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("LEADER_ONLY");
  });

  test("trip ACTIVE lama tidak diubah retroaktif oleh start baru (isolasi per trip)", async () => {
    // Trip A sudah ACTIVE (dibuat + start di tes ini); trip B PLANNED
    // milik leader lain tidak ikut berubah saat A di-start ulang.
    const { tripId, leader } = await setupTrip();
    expect((await callMethod("POST", `/trip-groups/${tripId}/start`, leader.token)).status).toBe(200);
    const other = await setupTrip();
    const s = await attendance(other.tripId, other.leader.token);
    expect(s.departed).toBe(0);
  });
});
