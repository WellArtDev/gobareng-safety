// SOS Umum (tanpa trip) — TDD: hanya akun terverifikasi, penerima
// hanya Pengguna Sekitar terverifikasi dalam 2 km, WA hanya ke
// penerima terdekat ber-HP (bukan kontak darurat, bukan leader).
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "admin-test-password-123";
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

// Email unik per register: fixture dipakai ulang antar tes, dan OTP
// request kedua untuk identifier sama dalam 60 detik kena OTP_COOLDOWN
// 429 — user segar per register juga menghindari SOS aktif sisa fixture
// sebelumnya (satu SOS umum aktif per pengirim).
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
async function adminLogin(): Promise<{ token: string; id: string }> {
  if (cachedAdmin) return cachedAdmin;
  const email = process.env.ADMIN_EMAIL as string;
  // Admin dibuat langsung via prisma (deterministik di DB apa pun):
  // seed app hanya membuat admin bila BELUM ADA admin sama sekali,
  // jadi di DB bersama login OTP mengandalkan seed rapuh — verify
  // pertama mengembalikan needsName, cachedAdmin gagal terisi, lalu
  // semua tes berikut kena OTP_COOLDOWN 429. Pola sama seperti
  // trip-invites.test.ts.
  await testDb.prisma.user.create({
    data: {
      email,
      slug: `admin-${run}`,
      name: "Admin GS",
      isAdmin: true,
      role: "admin",
      isVerified: true,
      passwordHash: null,
      phone: null,
    },
  });
  const req = await call("POST", "/auth/otp/request", undefined, { identifier: email });
  expect(req.status).toBe(200);
  const code = sentCodes.get(email);
  const ver = await call("POST", "/auth/otp/verify", undefined, { identifier: email, code });
  expect(ver.status).toBe(200);
  const d = data(ver);
  cachedAdmin = { token: d.token as string, id: (d.user as Json).id as string };
  return cachedAdmin;
}

async function verifyUser(adminToken: string, userId: string): Promise<void> {
  const r = await call("PATCH", `/admin/members/${userId}/verify`, adminToken);
  expect(r.status).toBe(200);
}

const SOS_LAT = -7.2;
const SOS_LON = 109.91;
const NEAR = { lat: -7.195, lon: 109.915 };
const FAR = { lat: -7.0, lon: 109.91 };

async function fixture(): Promise<{
  sender: { token: string; id: string };
  nearVerified: { token: string; id: string };
  nearUnverified: { token: string; id: string };
  farVerified: { token: string; id: string };
  stranger: { token: string; id: string };
  tripId: string;
}> {
  const admin = await adminLogin();
  const sender = await register("gs-sender");
  const nearVerified = await register("gs-near-v");
  const nearUnverified = await register("gs-near-u");
  const farVerified = await register("gs-far-v");
  const stranger = await register("gs-stranger");
  await verifyUser(admin.token, sender.id);
  await verifyUser(admin.token, nearVerified.id);
  await verifyUser(admin.token, farVerified.id);
  await verifyUser(admin.token, stranger.id);
  await call("PATCH", "/auth/me", nearVerified.token, { phone: "0822222222" });
  await call("PATCH", "/auth/me", nearUnverified.token, { phone: "0823333333" });
  await call("PATCH", "/auth/me", farVerified.token, { phone: "0824444444" });
  // Kontak darurat pengirim — TIDAK boleh menerima WA SOS umum.
  await call("POST", "/auth/me/emergency-contacts", sender.token, {
    name: "Kakak",
    phone: "0833333333",
  });
  // Trip penampung posisi terakhir (posisi global dibaca lintas trip).
  // Buat trip wajib HP (2 Nov 2026) — sender set HP dulu.
  await call("PATCH", "/auth/me", sender.token, { phone: "0821111111" });
  const trip = await call("POST", "/trip-groups", sender.token, {
    name: "GS Trip",
    type: "HIKING",
    date: "2026-11-03",
    meetingPoint: "X",
  });
  const tripId = (data(trip).trip as Json).id as string;
  for (const u of [nearVerified, nearUnverified, farVerified]) {
    await call("POST", `/trip-groups/${tripId}/join`, u.token);
  }
  const now = new Date().toISOString();
  await call("POST", `/trip-groups/${tripId}/locations`, nearVerified.token, { ...NEAR, timestamp: now });
  await call("POST", `/trip-groups/${tripId}/locations`, nearUnverified.token, { ...NEAR, timestamp: now });
  await call("POST", `/trip-groups/${tripId}/locations`, farVerified.token, { ...FAR, timestamp: now });
  return { sender, nearVerified, nearUnverified, farVerified, stranger, tripId };
}

describe("SOS umum", () => {
  test("pengirim belum verifikasi ditolak 403", async () => {
    const u = await register("gs-unver");
    const r = await call("POST", "/sos-general", u.token, {
      reason: "KECELAKAAN_LALU_LINTAS",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("GENERAL_SOS_UNVERIFIED_SENDER");
  });

  test("alasan tidak dikenal, lokasi kosong, dan 0,0 ditolak 400", async () => {
    const admin = await adminLogin();
    const u = await register("gs-bad");
    await verifyUser(admin.token, u.id);
    const badReason = await call("POST", "/sos-general", u.token, {
      reason: "TERSESAT",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(badReason.status).toBe(400);
    const noLoc = await call("POST", "/sos-general", u.token, { reason: "KEBAKARAN" });
    expect(noLoc.status).toBe(400);
    const zero = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: 0,
      lon: 0,
    });
    expect(zero.status).toBe(400);
    expect(errCode(zero)).toBe("INVALID_LOCATION");
  });

  test("SOS umum tanpa trip: penerima hanya Pengguna Sekitar terverifikasi dalam 2 km", async () => {
    const f = await fixture();
    const r = await call("POST", "/sos-general", f.sender.token, {
      reason: "KECELAKAAN_LALU_LINTAS",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(201);
    const sos = data(r).sos as Json;
    expect(sos.tripId).toBeNull();
    expect(sos.status).toBe("ACTIVE");
    expect(sos.reason).toBe("KECELAKAAN_LALU_LINTAS");
    const recipients = (data(r).recipients as Json[]).map((x) => x.userId);
    expect(recipients).toContain(f.nearVerified.id);
    expect(recipients).not.toContain(f.nearUnverified.id);
    expect(recipients).not.toContain(f.farVerified.id);
    expect(recipients).not.toContain(f.sender.id);
    // WA hanya ke penerima terdekat ber-HP — bukan kontak darurat.
    const wa = data(r).waRecipients as string[];
    expect(wa).toEqual(["0822222222"]);
    // Notifikasi in-app hanya untuk penerima.
    const nearNotifs = await testDb.prisma.notification.findMany({
      where: { userId: f.nearVerified.id, refId: sos.id as string },
    });
    expect(nearNotifs).toHaveLength(1);
    expect(nearNotifs[0]?.kind).toBe("GENERAL_SOS_ALERT");
    const farNotifs = await testDb.prisma.notification.findMany({
      where: { userId: f.farVerified.id, refId: sos.id as string },
    });
    expect(farNotifs).toHaveLength(0);
    // Log WA: hanya BYSTANDER, tanpa konfigurasi = SKIPPED_UNCONFIGURED.
    const logs = await testDb.prisma.waDispatchLog.findMany({
      where: { sosId: sos.id as string },
    });
    expect(logs.map((l) => l.toPhone)).toEqual(["0822222222"]);
    expect(logs[0]?.recipient).toBe("BYSTANDER");
    expect(logs[0]?.status).toBe("SKIPPED_UNCONFIGURED");
    expect(logs[0]?.tripId).toBeNull();
  });

  test("satu SOS umum aktif per pengirim; kedua ditolak 409", async () => {
    const admin = await adminLogin();
    const u = await register("gs-dup");
    await verifyUser(admin.token, u.id);
    const first = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(first.status).toBe(201);
    const second = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(second.status).toBe(409);
    expect(errCode(second)).toBe("GENERAL_SOS_ALREADY_ACTIVE");
  });

  test("detail: penerima bisa baca + jarak; orang asing ditolak", async () => {
    const f = await fixture();
    const created = await call("POST", "/sos-general", f.sender.token, {
      reason: "SAKIT_MENDADAK",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    const id = (data(created).sos as Json).id as string;
    const detail = await call("GET", `/sos-general/${id}`, f.nearVerified.token);
    expect(detail.status).toBe(200);
    const d = data(detail).sos as Json;
    expect(d.senderName).toBeTruthy();
    expect(d.responderCount).toBe(0);
    expect(typeof d.distanceKm).toBe("number");
    expect(d.distanceKm as number).toBeLessThan(2);
    const stranger = await call("GET", `/sos-general/${id}`, f.stranger.token);
    expect(stranger.status).toBe(403);
  });

  test("respond GOING menambah hitungan responder (idempotent); IGNORE tidak", async () => {
    const f = await fixture();
    const created = await call("POST", "/sos-general", f.sender.token, {
      reason: "BUTUH_AMBULANS",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    const id = (data(created).sos as Json).id as string;
    const go = await call("PATCH", `/sos-general/${id}/respond`, f.nearVerified.token, {
      action: "GOING",
    });
    expect(go.status).toBe(200);
    expect((data(go).sos as Json).responderCount).toBe(1);
    const goAgain = await call("PATCH", `/sos-general/${id}/respond`, f.nearVerified.token, {
      action: "GOING",
    });
    expect((data(goAgain).sos as Json).responderCount).toBe(1);
    const senderView = await call("GET", `/sos-general/${id}`, f.sender.token);
    expect((data(senderView).sos as Json).responderCount).toBe(1);
  });

  test("batal oleh pengirim menutup SOS + notif penutup ke penerima; bukan pengirim ditolak", async () => {
    const f = await fixture();
    const created = await call("POST", "/sos-general", f.sender.token, {
      reason: "KEJAHATAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    const id = (data(created).sos as Json).id as string;
    const forbiddenCancel = await call("PATCH", `/sos-general/${id}/cancel`, f.nearVerified.token);
    expect(forbiddenCancel.status).toBe(403);
    const cancel = await call("PATCH", `/sos-general/${id}/cancel`, f.sender.token);
    expect(cancel.status).toBe(200);
    expect((data(cancel).sos as Json).status).toBe("CANCELLED");
    const closed = await testDb.prisma.notification.findMany({
      where: { userId: f.nearVerified.id, refId: id, kind: "GENERAL_SOS_CLOSED" },
    });
    expect(closed.length).toBeGreaterThan(0);
    const after = await call("GET", `/sos-general/${id}`, f.nearVerified.token);
    expect((data(after).sos as Json).status).toBe("CANCELLED");
  });

  test("selesai oleh pengirim menutup SOS + notif penutup", async () => {
    const admin = await adminLogin();
    const u = await register("gs-resolve");
    await verifyUser(admin.token, u.id);
    const created = await call("POST", "/sos-general", u.token, {
      reason: "BANJIR_POHON_TUMBANG",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    const id = (data(created).sos as Json).id as string;
    const resolve = await call("PATCH", `/sos-general/${id}/resolve`, u.token);
    expect(resolve.status).toBe(200);
    expect((data(resolve).sos as Json).status).toBe("RESOLVED");
  });
});

describe("SOS umum — pengaman anti-penyalahgunaan (Wella 2 Nov 2026)", () => {
  test("maks 3 SOS umum per 24 jam: kiriman ke-4 ditolak 429", async () => {
    const admin = await adminLogin();
    const u = await register("gs-limit");
    await verifyUser(admin.token, u.id);
    // 3 kiriman lama (1–3 jam lalu): dalam jendela 24 jam, di luar
    // cooldown 10 menit — jadi yang menghalangi kiriman ke-4 murni batas.
    const now = Date.now();
    for (const hoursAgo of [1, 2, 3]) {
      await testDb.prisma.generalSos.create({
        data: {
          senderId: u.id,
          reason: "KEBAKARAN",
          level: "EMERGENCY",
          lat: SOS_LAT,
          lon: SOS_LON,
          status: "CANCELLED",
          createdAt: new Date(now - hoursAgo * 60 * 60_000),
        },
      });
    }
    const r = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(r.status).toBe(429);
    expect(errCode(r)).toBe("GENERAL_SOS_DAILY_LIMIT");
  });

  test("cooldown 10 menit: kirim lagi setelah batal langsung ditolak 429", async () => {
    const admin = await adminLogin();
    const u = await register("gs-cool");
    await verifyUser(admin.token, u.id);
    const first = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(first.status).toBe(201);
    const id = (data(first).sos as Json).id as string;
    const cancelled = await call("PATCH", `/sos-general/${id}/cancel`, u.token);
    expect(cancelled.status).toBe(200);
    const again = await call("POST", "/sos-general", u.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(again.status).toBe(429);
    expect(errCode(again)).toBe("GENERAL_SOS_COOLDOWN");
  });

  test("penerima bisa lapor SOS palsu; duplikat 409; pengirim/orang asing 403", async () => {
    const f = await fixture();
    const created = await call("POST", "/sos-general", f.sender.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    expect(created.status).toBe(201);
    const id = (data(created).sos as Json).id as string;

    const report = await call(
      "POST",
      `/sos-general/${id}/report`,
      f.nearVerified.token,
    );
    expect(report.status).toBe(201);

    const dup = await call(
      "POST",
      `/sos-general/${id}/report`,
      f.nearVerified.token,
    );
    expect(dup.status).toBe(409);
    expect(errCode(dup)).toBe("GENERAL_SOS_ALREADY_REPORTED");

    const own = await call(
      "POST",
      `/sos-general/${id}/report`,
      f.sender.token,
    );
    expect(own.status).toBe(403);
    expect(errCode(own)).toBe("GENERAL_SOS_REPORT_NOT_ALLOWED");

    const stranger = await call(
      "POST",
      `/sos-general/${id}/report`,
      f.stranger.token,
    );
    expect(stranger.status).toBe(403);
    expect(errCode(stranger)).toBe("GENERAL_SOS_NOT_ALLOWED");
  });

  test("admin: daftar laporan + flag/unflag; non-admin ditolak 403", async () => {
    const f = await fixture();
    const created = await call("POST", "/sos-general", f.sender.token, {
      reason: "KEBAKARAN",
      lat: SOS_LAT,
      lon: SOS_LON,
    });
    const id = (data(created).sos as Json).id as string;
    await call("POST", `/sos-general/${id}/report`, f.nearVerified.token);

    const denied = await call(
      "GET",
      "/admin/general-sos-reports",
      f.nearVerified.token,
    );
    expect(denied.status).toBe(403);

    const admin = await adminLogin();
    const list = await call("GET", "/admin/general-sos-reports", admin.token);
    expect(list.status).toBe(200);
    const items = (data(list).items as Json[]) ?? [];
    const mine = items.find(
      (x) => ((x.sos as Json).id as string) === id,
    );
    expect(mine).toBeDefined();
    expect(mine?.reportCount).toBe(1);

    const flagged = await call(
      "PATCH",
      `/admin/general-sos/${id}/flag`,
      admin.token,
    );
    expect(flagged.status).toBe(200);
    expect(((data(flagged).sos as Json).flagged as boolean)).toBe(true);

    const unflagged = await call(
      "PATCH",
      `/admin/general-sos/${id}/unflag`,
      admin.token,
    );
    expect(unflagged.status).toBe(200);
    expect(((data(unflagged).sos as Json).flagged as boolean)).toBe(false);
  });
});

describe("SOS umum — dispatch realtime sungguhan (bukan mockup)", () => {
  test("penerima terhubung menerima sos-bystander-alert; yang jauh tidak", async () => {
    const { io } = await import("socket.io-client");
    const f = await fixture();
    const senderName = `User gs-sender`;

    async function connectAs(token: string) {
      const socket = io(`http://localhost:${PORT}`, {
        auth: { token },
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", (e: Error) => reject(e));
        setTimeout(() => reject(new Error("socket connect timeout")), 5000);
      });
      return socket;
    }

    const nearSocket = await connectAs(f.nearVerified.token);
    const farSocket = await connectAs(f.farVerified.token);
    try {
      const nearEvents: unknown[] = [];
      const farEvents: unknown[] = [];
      nearSocket.on("sos-bystander-alert", (p: unknown) => nearEvents.push(p));
      farSocket.on("sos-bystander-alert", (p: unknown) => farEvents.push(p));

      const created = await call("POST", "/sos-general", f.sender.token, {
        reason: "KEBAKARAN",
        lat: SOS_LAT,
        lon: SOS_LON,
      });
      expect(created.status).toBe(201);
      const id = (data(created).sos as Json).id as string;

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error("alert realtime tidak sampai")),
          5000,
        );
        const check = () => {
          if (nearEvents.length > 0) {
            clearTimeout(t);
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });

      const payload = nearEvents[0] as Json;
      expect(payload.generalSosId).toBe(id);
      expect(payload.tripId).toBeNull();
      expect(payload.reason).toBe("KEBAKARAN");
      expect(payload.status).toBe("ACTIVE");
      // Identitas pengirim tampil jelas di alert (bukan anonim).
      expect(payload.senderName).toBe(senderName);

      // Beri jeda: yang jauh tidak boleh menerima apa pun.
      await new Promise((r) => setTimeout(r, 500));
      expect(farEvents).toHaveLength(0);
    } finally {
      nearSocket.disconnect();
      farSocket.disconnect();
    }
  });
});
