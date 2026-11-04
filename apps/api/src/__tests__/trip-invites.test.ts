// INVITE + SHARE (2 Nov 2026): link undangan HANYA dari leader trip,
// berlaku SAMPAI TRIP DIMULAI (status harus PLANNED; ACTIVE/CLOSED =
// tidak berlaku), kuota dihitung dari MEMBER YANG SUDAH JOIN (bukan
// jumlah link), penegakan kuota HANYA di jalur undangan (join biasa
// tidak berubah), buat trip wajib HP pembuat. TDD: file ini ditulis
// dulu, implementasi menyusul.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4194;
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

let cachedAdmin: { token: string; id: string } | undefined;
// Admin dibuat langsung via prisma (bukan seed env): deterministik di
// DB apa pun — seed admin hanya jalan bila belum ada admin sama sekali,
// jadi di DB bersama antar-run, seed bisa ter-skip dan login admin
// gagal needsName. Peran dibaca dari DB (isDashboardRole), sama seperti
// jalur seed.
async function adminLogin(): Promise<{ token: string; id: string }> {
  if (cachedAdmin) return cachedAdmin;
  const email = `admin-${run}@t.local`;
  const created = await testDb.prisma.user.create({
    data: {
      email,
      name: "Admin",
      slug: `admin-${run}`,
      passwordHash: null,
      phone: null,
      isAdmin: true,
      role: "admin",
      isVerified: true,
    },
  });
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  const ver = await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(ver.status).toBe(200);
  const d = data(ver);
  cachedAdmin = { token: d.token as string, id: created.id };
  return cachedAdmin;
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
  opts: { quota?: number | null; price?: number | null } = {},
): Promise<{ id: string }> {
  const r = await call("POST", "/trip-groups", token, {
    name: `Trip ${run}-${Math.random().toString(36).slice(2, 8)}`,
    type: "TOURING",
    date: "2027-06-01",
    meetingPoint: "Titik kumpul",
    quota: opts.quota ?? null,
    price: opts.price ?? null,
  });
  expect(r.status).toBe(201);
  return { id: (data(r).trip as Json).id as string };
}

async function joinRegular(tripId: string, token: string): Promise<number> {
  const r = await call("POST", `/trip-groups/${tripId}/join`, token);
  return r.status;
}

async function createInvite(
  tripId: string,
  token: string,
  label = "Undangan",
): Promise<{ status: number; json: Json }> {
  return call("POST", `/trip-groups/${tripId}/invites`, token, { label });
}

async function resolveInvite(token: string): Promise<{ status: number; json: Json }> {
  return call("GET", `/invites/${token}`);
}

async function joinViaInvite(token: string, userToken: string): Promise<{ status: number; json: Json }> {
  return call("POST", `/invites/${token}/join`, userToken);
}

describe("INVITE: hanya leader boleh membuat/melihat/mencabut", () => {
  test("leader membuat 201 + token; daftar memuatnya", async () => {
    const leader = await register("inv-leader");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const created = await createInvite(trip.id, leader.token);
    expect(created.status).toBe(201);
    const invite = data(created).invite as Json;
    expect(typeof invite.token).toBe("string");
    expect((invite.token as string).length).toBeGreaterThan(10);
    const list = await call("GET", `/trip-groups/${trip.id}/invites`, leader.token);
    expect(list.status).toBe(200);
    expect((data(list).invites as Json[]).length).toBe(1);
  });

  test("anggota biasa, admin, dan orang luar: 403", async () => {
    const leader = await register("inv-leader2");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const member = await register("inv-member");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const admin = await adminLogin();
    const stranger = await register("inv-stranger");
    expect((await createInvite(trip.id, member.token)).status).toBe(403);
    expect((await createInvite(trip.id, admin.token)).status).toBe(403);
    expect((await createInvite(trip.id, stranger.token)).status).toBe(403);
    expect((await call("GET", `/trip-groups/${trip.id}/invites`, member.token)).status).toBe(403);
    expect((await call("GET", `/trip-groups/${trip.id}/invites`, admin.token)).status).toBe(403);
    const created = await createInvite(trip.id, leader.token);
    const inviteId = (data(created).invite as Json).id as string;
    expect((await call("DELETE", `/trip-groups/${trip.id}/invites/${inviteId}`, member.token)).status).toBe(403);
    expect((await call("DELETE", `/trip-groups/${trip.id}/invites/${inviteId}`, admin.token)).status).toBe(403);
    const revoked = await call("DELETE", `/trip-groups/${trip.id}/invites/${inviteId}`, leader.token);
    expect(revoked.status).toBe(200);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(resolved.status).toBe(404);
    expect(errCode(resolved)).toBe("INVITE_NOT_FOUND");
    const joinRevoked = await joinViaInvite((data(created).invite as Json).token as string, stranger.token);
    expect(joinRevoked.status).toBe(404);
  });

  test("label kosong: 400", async () => {
    const leader = await register("inv-leader3");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const r = await call("POST", `/trip-groups/${trip.id}/invites`, leader.token, { label: "  " });
    expect(r.status).toBe(400);
  });
});

describe("INVITE: masa berlaku sampai trip dimulai", () => {
  test("PLANNED: resolve usable true + info trip tanpa data privat", async () => {
    const leader = await register("inv-resolve");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 5 });
    const created = await createInvite(trip.id, leader.token);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(resolved.status).toBe(200);
    const d = data(resolved);
    expect(d.usable).toBe(true);
    const tripInfo = d.trip as Json;
    expect(tripInfo.name).toBeDefined();
    expect(tripInfo.status).toBe("PLANNED");
    expect(d.memberCount).toBe(1);
    expect(d.quota).toBe(5);
    expect(d.leaderPhone).toBeNull();
    expect(JSON.stringify(d)).not.toContain("0811111111");
    expect(JSON.stringify(d)).not.toContain("@t.local");
  });

  test("ACTIVE: resolve usable false, join ditolak TRIP_STARTED, buat invite ditolak", async () => {
    const leader = await register("inv-active");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const created = await createInvite(trip.id, leader.token);
    const token = (data(created).invite as Json).token as string;
    const started = await call("POST", `/trip-groups/${trip.id}/start`, leader.token);
    expect(started.status).toBe(200);
    const resolved = await resolveInvite(token);
    expect(resolved.status).toBe(200);
    expect(data(resolved).usable).toBe(false);
    const friend = await register("inv-active-friend");
    const joined = await joinViaInvite(token, friend.token);
    expect(joined.status).toBe(409);
    expect(errCode(joined)).toBe("TRIP_STARTED");
    expect((await createInvite(trip.id, leader.token)).status).toBe(409);
    // Join biasa pada trip ACTIVE tetap jalan (tidak diubah).
    expect(await joinRegular(trip.id, friend.token)).toBe(200);
  });

  test("CLOSED: resolve usable false, join ditolak TRIP_CLOSED, buat invite ditolak", async () => {
    const leader = await register("inv-closed");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const created = await createInvite(trip.id, leader.token);
    const token = (data(created).invite as Json).token as string;
    const closed = await call("POST", `/trip-groups/${trip.id}/close`, leader.token, {
      confirmUnaccounted: true,
    });
    expect(closed.status).toBe(200);
    const resolved = await resolveInvite(token);
    expect(data(resolved).usable).toBe(false);
    const friend = await register("inv-closed-friend");
    const joined = await joinViaInvite(token, friend.token);
    expect(joined.status).toBe(409);
    expect(errCode(joined)).toBe("TRIP_CLOSED");
    expect((await createInvite(trip.id, leader.token)).status).toBe(409);
  });

  test("token tidak dikenal: 404", async () => {
    const r = await resolveInvite("tidak-ada-token");
    expect(r.status).toBe(404);
    expect(errCode(r)).toBe("INVITE_NOT_FOUND");
  });
});

describe("INVITE: kuota dari member yang sudah join, hanya di jalur undangan", () => {
  test("penuh (2/2): join via undangan 409 QUOTA_FULL; naikkan kuota -> join berhasil", async () => {
    const leader = await register("inv-quota");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 2 });
    const member = await register("inv-quota-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const created = await createInvite(trip.id, leader.token);
    const token = (data(created).invite as Json).token as string;
    const friend = await register("inv-quota-f");
    const denied = await joinViaInvite(token, friend.token);
    expect(denied.status).toBe(409);
    expect(errCode(denied)).toBe("QUOTA_FULL");
    const raised = await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: 3 });
    expect(raised.status).toBe(200);
    expect((data(raised).trip as Json).quota).toBe(3);
    const joined = await joinViaInvite(token, friend.token);
    expect(joined.status).toBe(200);
    expect(data(joined).joined).toBe(true);
  });

  test("membuat banyak link TIDAK memakan kuota", async () => {
    const leader = await register("inv-links");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 2 });
    for (let i = 0; i < 3; i++) {
      expect((await createInvite(trip.id, leader.token, `Link ${i}`)).status).toBe(201);
    }
    const friend = await register("inv-links-f");
    const created = await createInvite(trip.id, leader.token, "Link pakai");
    const joined = await joinViaInvite((data(created).invite as Json).token as string, friend.token);
    expect(joined.status).toBe(200);
  });

  test("sudah anggota + kuota penuh: join via undangan tetap 200 (idempotent)", async () => {
    const leader = await register("inv-idem");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 2 });
    const member = await register("inv-idem-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const created = await createInvite(trip.id, leader.token);
    const again = await joinViaInvite((data(created).invite as Json).token as string, member.token);
    expect(again.status).toBe(200);
  });

  test("join BIASA saat kuota penuh tetap 200 (tidak diubah)", async () => {
    const leader = await register("inv-regular");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 2 });
    const member = await register("inv-regular-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const late = await register("inv-regular-late");
    expect(await joinRegular(trip.id, late.token)).toBe(200);
  });

  test("trip berbayar via undangan: non-Pro 403 PRO_REQUIRED, Pro 200", async () => {
    const leader = await register("inv-paid-leader");
    await setPhone(leader.token, "0811111111");
    await makePro(leader.id);
    // Aturan baru: trip berbayar wajib punya rekening organizer.
    expect(
      (
        await call("PATCH", "/auth/me", leader.token, {
          bankName: "BCA",
          bankAccountNumber: "1234567890",
          bankAccountHolder: "Leader Inv Paid",
        })
      ).status,
    ).toBe(200);
    const trip = await createTrip(leader.token, { quota: 10, price: 50000 });
    const created = await createInvite(trip.id, leader.token);
    const token = (data(created).invite as Json).token as string;
    const poor = await register("inv-paid-poor");
    const denied = await joinViaInvite(token, poor.token);
    expect(denied.status).toBe(403);
    expect(errCode(denied)).toBe("PRO_REQUIRED");
    const pro = await register("inv-paid-pro");
    await makePro(pro.id);
    const joined = await joinViaInvite(token, pro.token);
    expect(joined.status).toBe(200);
  });
});

describe("INVITE: endpoint ubah kuota", () => {
  test("leader ok, admin ok, anggota 403; validasi nilai", async () => {
    const leader = await register("inv-setquota");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 5 });
    const member = await register("inv-setquota-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const member2 = await register("inv-setquota-m2");
    expect(await joinRegular(trip.id, member2.token)).toBe(200);
    const admin = await adminLogin();
    expect((await call("PATCH", `/trip-groups/${trip.id}/quota`, member.token, { quota: 6 })).status).toBe(403);
    expect((await call("PATCH", `/trip-groups/${trip.id}/quota`, admin.token, { quota: 6 })).status).toBe(200);
    // Di bawah jumlah anggota (3) tapi >= 2 -> 409; di bawah 2 -> 400;
    // bukan bilangan -> 400; null -> 400.
    const below = await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: 2 });
    expect(below.status).toBe(409);
    expect(errCode(below)).toBe("QUOTA_BELOW_MEMBERS");
    expect((await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: 0 })).status).toBe(400);
    expect((await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: 2.5 })).status).toBe(400);
    expect((await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: null })).status).toBe(400);
    const ok = await call("PATCH", `/trip-groups/${trip.id}/quota`, leader.token, { quota: 8 });
    expect(ok.status).toBe(200);
    expect((data(ok).trip as Json).quota).toBe(8);
    const created = await createInvite(trip.id, leader.token);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(data(resolved).quota).toBe(8);
  });
});

describe("INVITE: landing kuota penuh + nomor leader", () => {
  test("penuh + leader punya HP: leaderPhone dibersihkan (tanpa spasi/dash/+)", async () => {
    const leader = await register("inv-fullphone");
    await setPhone(leader.token, "+62 812-3456-789");
    const trip = await createTrip(leader.token, { quota: 2 });
    const member = await register("inv-fullphone-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    const created = await createInvite(trip.id, leader.token);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(data(resolved).leaderPhone).toBe("628123456789");
  });

  test("penuh + leader tanpa HP: leaderPhone null (teks saja, tanpa link)", async () => {
    const leader = await register("inv-nophone");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 2 });
    const member = await register("inv-nophone-m");
    expect(await joinRegular(trip.id, member.token)).toBe(200);
    // Hapus HP leader (null eksplisit di PATCH /auth/me).
    const cleared = await call("PATCH", "/auth/me", leader.token, { phone: null });
    expect(cleared.status).toBe(200);
    const created = await createInvite(trip.id, leader.token);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(data(resolved).leaderPhone).toBeNull();
  });

  test("belum penuh: leaderPhone null walau leader punya HP", async () => {
    const leader = await register("inv-notfull");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 5 });
    const created = await createInvite(trip.id, leader.token);
    const resolved = await resolveInvite((data(created).invite as Json).token as string);
    expect(data(resolved).leaderPhone).toBeNull();
  });
});

describe("BUAT TRIP: wajib HP pembuat", () => {
  test("tanpa HP: 400 PHONE_REQUIRED; dengan HP: 201", async () => {
    const noPhone = await register("trip-nophone");
    const denied = await call("POST", "/trip-groups", noPhone.token, {
      name: "Trip tanpa HP",
      type: "TOURING",
      date: "2027-06-01",
      meetingPoint: "Titik kumpul",
    });
    expect(denied.status).toBe(400);
    expect(errCode(denied)).toBe("PHONE_REQUIRED");
    await setPhone(noPhone.token, "0811111111");
    const ok = await call("POST", "/trip-groups", noPhone.token, {
      name: "Trip dengan HP",
      type: "TOURING",
      date: "2027-06-01",
      meetingPoint: "Titik kumpul",
    });
    expect(ok.status).toBe(201);
  });
});

describe("SHARE: scope tetap di respons pantau publik", () => {
  test("ANYONE: scope ikut; EC tetap resolve (API tidak dilonggarkan/diubah)", async () => {
    const leader = await register("share-scope");
    await setPhone(leader.token, "0811111111");
    const trip = await createTrip(leader.token, { quota: 10 });
    const anyone = await call("POST", `/trip-groups/${trip.id}/share-links`, leader.token, {
      label: "Publik",
      scope: "ANYONE",
    });
    expect(anyone.status).toBe(201);
    const anyoneToken = (data(anyone).shareLink as Json).token as string;
    const anyoneRes = await call("GET", `/shared-trips/${anyoneToken}`);
    expect(anyoneRes.status).toBe(200);
    expect(data(anyoneRes).scope).toBe("ANYONE");
    const ec = await call("POST", `/trip-groups/${trip.id}/share-links`, leader.token, {
      label: "Darurat",
      scope: "EMERGENCY_CONTACT",
    });
    expect(ec.status).toBe(201);
    const ecToken = (data(ec).shareLink as Json).token as string;
    const ecRes = await call("GET", `/shared-trips/${ecToken}`);
    expect(ecRes.status).toBe(200);
    expect(data(ecRes).scope).toBe("EMERGENCY_CONTACT");
  });
});
