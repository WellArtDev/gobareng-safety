// Rekening organizer untuk trip berbayar — TDD RED.
// - Field rekening (nama bank, nomor rekening, atas nama) di level User,
//   satu paket: isi semua atau kosong semua; nomor hanya digit 6-20.
// - Trip berbayar (price != null) hanya boleh dibuat bila rekening
//   organizer lengkap, bila tidak 400 ORGANIZER_BANK_DETAILS_REQUIRED.
// - Rekening hanya terlihat member trip berbayar yang sudah gabung,
//   lewat GET /trip-groups/:id/payments/me (organizerBank); TIDAK
//   pernah di profil publik maupun daftar member trip.
import { mock } from "bun:test";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4211;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    _channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean; errorCode?: string }> => {
    sentCodes.set(destination, code);
    return { ok: true };
  },
}));

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "admin-tes-123";
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

function codeOf(r: { json: Json }): string {
  return ((r.json.error as Json)?.code as string) ?? "";
}

let userSeq = 0;
async function otpLogin(name: string): Promise<{ token: string; id: string }> {
  userSeq += 1;
  const identifier = `bank-${run}-${userSeq}@t.local`;
  const req = await call("POST", "/auth/otp/request", undefined, { identifier });
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const ver = await call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
    name,
  });
  expect(ver.status).toBe(200);
  const d = data(ver);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

async function setPhone(token: string, phone: string): Promise<void> {
  const r = await call("PATCH", "/auth/me", token, { phone });
  expect(r.status).toBe(200);
}

async function makePro(userId: string): Promise<void> {
  await testDb.prisma.upgradeRequest.create({
    data: { userId, amount: 100000, status: "VERIFIED" },
  });
}

async function createTrip(
  token: string,
  price: number | null,
): Promise<{ status: number; json: Json }> {
  return call("POST", "/trip-groups", token, {
    name: `Trip bank ${run}-${Math.random().toString(36).slice(2, 8)}`,
    type: "TOURING",
    date: "2027-06-01",
    meetingPoint: "Titik kumpul",
    quota: null,
    price,
  });
}

const BANK = {
  bankName: "BCA",
  bankAccountNumber: "1234567890",
  bankAccountHolder: "Budi Organizer",
};

describe("rekening organizer", () => {
  test("PATCH /me sebagian (hanya nama bank) ditolak 400", async () => {
    const me = await otpLogin("Budi");
    const r = await call("PATCH", "/auth/me", me.token, {
      bankName: "BCA",
    });
    expect(r.status).toBe(400);
    expect(codeOf(r)).toBe("INVALID_PAYLOAD");
  });

  test("PATCH /me nomor rekening huruf / terlalu pendek ditolak 400", async () => {
    const me = await otpLogin("Budi");
    const bad1 = await call("PATCH", "/auth/me", me.token, {
      ...BANK,
      bankAccountNumber: "12AB34",
    });
    expect(bad1.status).toBe(400);
    const bad2 = await call("PATCH", "/auth/me", me.token, {
      ...BANK,
      bankAccountNumber: "12345",
    });
    expect(bad2.status).toBe(400);
  });

  test("PATCH /me lengkap lalu GET bank-details mengembalikan ketiganya", async () => {
    const me = await otpLogin("Budi");
    const r = await call("PATCH", "/auth/me", me.token, BANK);
    expect(r.status).toBe(200);
    const got = await call("GET", "/auth/me/bank-details", me.token);
    expect(got.status).toBe(200);
    expect(data(got).bankDetails).toEqual(BANK);
  });

  test("PATCH /me kosong semua menghapus rekening (bank-details null)", async () => {
    const me = await otpLogin("Budi");
    await call("PATCH", "/auth/me", me.token, BANK);
    const cleared = await call("PATCH", "/auth/me", me.token, {
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
    });
    expect(cleared.status).toBe(200);
    const got = await call("GET", "/auth/me/bank-details", me.token);
    expect(data(got).bankDetails).toBeNull();
  });

  test("buat trip berbayar tanpa rekening ditolak ORGANIZER_BANK_DETAILS_REQUIRED", async () => {
    const me = await otpLogin("Budi");
    await setPhone(me.token, "+628123456789");
    await makePro(me.id);
    const r = await createTrip(me.token, 150000);
    expect(r.status).toBe(400);
    expect(codeOf(r)).toBe("ORGANIZER_BANK_DETAILS_REQUIRED");
  });

  test("buat trip berbayar dengan rekening lengkap lolos 201", async () => {
    const me = await otpLogin("Budi");
    await setPhone(me.token, "+628123456789");
    await makePro(me.id);
    await call("PATCH", "/auth/me", me.token, BANK);
    const r = await createTrip(me.token, 150000);
    expect(r.status).toBe(201);
  });

  test("payments/me member gabung memuat organizerBank; setelah rekening dihapus jadi null", async () => {
    const org = await otpLogin("Budi");
    await setPhone(org.token, "+628123456789");
    await makePro(org.id);
    await call("PATCH", "/auth/me", org.token, BANK);
    const trip = await createTrip(org.token, 150000);
    expect(trip.status).toBe(201);
    const tripId = (data(trip).trip as Json).id as string;

    const member = await otpLogin("Siti");
    await makePro(member.id);
    const join = await call("POST", `/trip-groups/${tripId}/join`, member.token);
    expect(join.status).toBe(200);
    const pay = await call(
      "GET",
      `/trip-groups/${tripId}/payments/me`,
      member.token,
    );
    expect(pay.status).toBe(200);
    expect(data(pay).organizerBank).toEqual(BANK);

    await call("PATCH", "/auth/me", org.token, {
      bankName: "",
      bankAccountNumber: "",
      bankAccountHolder: "",
    });
    const pay2 = await call(
      "GET",
      `/trip-groups/${tripId}/payments/me`,
      member.token,
    );
    expect(data(pay2).organizerBank).toBeNull();
  });

  test("rekening TIDAK bocor ke profil publik maupun daftar member trip", async () => {
    const org = await otpLogin("Budi");
    await setPhone(org.token, "+628123456789");
    await makePro(org.id);
    await call("PATCH", "/auth/me", org.token, BANK);
    const trip = await createTrip(org.token, 150000);
    expect(trip.status).toBe(201);
    const tripId = (data(trip).trip as Json).id as string;

    const member = await otpLogin("Siti");
    await makePro(member.id);
    await call("POST", `/trip-groups/${tripId}/join`, member.token);

    const orgSlug = ((await call("GET", "/auth/me", org.token)).json.data as Json)
      .user as Json;
    const pub = await call(
      "GET",
      `/users/${orgSlug.slug as string}/profile`,
      member.token,
    );
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.json)).not.toContain("1234567890");
    expect(JSON.stringify(pub.json)).not.toContain("bankName");

    const members = await call(
      "GET",
      `/trip-groups/${tripId}/members`,
      member.token,
    );
    expect(members.status).toBe(200);
    expect(JSON.stringify(members.json)).not.toContain("1234567890");
    expect(JSON.stringify(members.json)).not.toContain("bankAccountNumber");
  });
});
