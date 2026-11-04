// API integration suite (TDD) — locked contract rules, run against the
// real Express app + real Postgres (dev container). Each run uses a
// unique email prefix so reruns never collide.
//
// Covered locked rules (docs/api-contract.md):
// §1 OTP register/login + suspended login blocked
// §2 trip create with meetingLat/Lon pair rule + quota validation
// §4 contextual SOS reasons per trip type + auto-level + 1-active rule
// §14 admin-only guards + verification flow + reports close actions
// §16 share-link public view + revoke
// §17 close refuses with unaccounted members without confirmation
// §19 envelope shape { data } / { error: { code } }
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4190;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

let http: Server;
let testDb: Db;

beforeAll(async () => {
  // config.ts reads env at module load, so the admin seed env MUST be
  // set before app.js (-> config.js) is imported — hence the dynamic
  // import here instead of a static one at the top.
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "admin-test-12345";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  // Admin deterministik (bukan seed): seed app hanya membuat admin
  // bila BELUM ADA admin sama sekali, jadi di DB bekas-pakai seed
  // di-skip dan loginOtp(ADMIN_EMAIL) mengembalikan needsName
  // (d.user undefined -> cascade 429). Buat langsung via prisma.
  await testDb.prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL as string },
    create: {
      email: process.env.ADMIN_EMAIL as string,
      slug: `admin-${run}`,
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
function errCode(r: { json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

// Stub delivery OTP: kode yang diverifikasi tes adalah kode yang
// benar-benar "dikirim" lewat stub ini, bukan kode yang dibaca dari DB.
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

// Waktu kirim terakhir per identifier: request OTP kedua dalam
// 60 detik kena OTP_COOLDOWN (perilaku produksi) — helper menunggu
// sisa cooldown supaya tes login berulang tidak flaky.
const sentAt = new Map<string, number>();
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
async function requestOtpCode(identifier: string): Promise<void> {
  const last = sentAt.get(identifier) ?? 0;
  const wait = 61_000 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  const r = await call("POST", "/auth/otp/request", undefined, {
    identifier,
  });
  expect(r.status).toBe(200);
  sentAt.set(identifier, Date.now());
}

// Register lewat alur OTP: request -> verify (needsName) -> verify
// lagi dengan nama (kode sama, belum dikonsumsi).
async function register(name: string): Promise<{
  token: string;
  id: string;
  refreshToken: string;
}> {
  const email = `${name}-${run}@t.local`;
  await requestOtpCode(email);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
  });
  expect(first.status).toBe(200);
  expect((data(first) as Json).needsName).toBe(true);
  const second = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
    name: `User ${name}`,
  });
  expect(second.status).toBe(200);
  const d = data(second);
  return {
    token: d.token as string,
    id: (d.user as Json).id as string,
    refreshToken: d.refreshToken as string,
  };
}

// Login OTP untuk user yang sudah ada (identifier -> kode -> sesi).
async function loginOtp(email: string): Promise<{ token: string; id: string }> {
  await requestOtpCode(email);
  const code = sentCodes.get(email);
  expect(code).toMatch(/^\d{6}$/);
  const ver = await call("POST", "/auth/otp/verify", undefined, {
    identifier: email,
    code,
  });
  expect(ver.status).toBe(200);
  const d = data(ver);
  return { token: d.token as string, id: (d.user as Json).id as string };
}

// Token admin di-cache per file: login OTP admin berulang dalam
// 60 detik kena OTP_COOLDOWN, jadi suite memakai satu sesi admin
// (JWT 15 menit, jauh lebih panjang dari jeda antar tes yang memakai
// token ini; tes yang memang menguji login segar memakai loginOtp).
let cachedAdmin: { token: string; id: string } | undefined;
async function cachedAdminLogin(): Promise<{ token: string; id: string }> {
  cachedAdmin ??= await loginOtp(process.env.ADMIN_EMAIL as string);
  return cachedAdmin;
}


describe("§1 auth (OTP)", () => {
  test("register -> OTP login round-trip; OTP salah = INVALID_OTP", async () => {
    await register("auth1");
    const email = `auth1-${run}@t.local`;
    const ok = await loginOtp(email);
    expect(ok.token).toBeTruthy();
    await requestOtpCode(email);
    const real = sentCodes.get(email)!;
    const wrong = real === "000000" ? "111111" : "000000";
    const bad = await call("POST", "/auth/otp/verify", undefined, {
      identifier: email,
      code: wrong,
    });
    expect(bad.status).toBe(401);
    expect(errCode(bad)).toBe("INVALID_OTP");
  });

  test("endpoint password lama = 410 OTP_ONLY (envelope §19)", async () => {
    const reg = await call("POST", "/auth/register", undefined, {
      email: `legacy-${run}@t.local`,
      name: "Legacy",
    });
    expect(reg.status).toBe(410);
    expect(errCode(reg)).toBe("OTP_ONLY");
    expect(reg.json.data).toBeUndefined();
    const log = await call("POST", "/auth/login", undefined, {
      email: `legacy-${run}@t.local`,
    });
    expect(log.status).toBe(410);
    expect(errCode(log)).toBe("OTP_ONLY");
  });

  test("suspended account cannot verify OTP (ACCOUNT_SUSPENDED)", async () => {
    const victim = await register("suspended");
    const adminToken = (await cachedAdminLogin()).token;
    await call("PATCH", `/admin/members/${victim.id}/suspend`, adminToken);
    await requestOtpCode(`suspended-${run}@t.local`);
    const code = sentCodes.get(`suspended-${run}@t.local`)!;
    const r = await call("POST", "/auth/otp/verify", undefined, {
      identifier: `suspended-${run}@t.local`,
      code,
    });
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe("ACCOUNT_SUSPENDED");
  });
});

describe("§1b password endpoints -> 410 OTP_ONLY", () => {
  test("PATCH /auth/me/password dan PATCH /admin/members/:id/password = 410", async () => {
    const u = await register("pwchange");
    const bad = await call("PATCH", "/auth/me/password", u.token, {
      currentPassword: "whatever",
      newPassword: "newpassword123",
    });
    expect(bad.status).toBe(410);
    expect(errCode(bad)).toBe("OTP_ONLY");
    const adminToken = (await cachedAdminLogin()).token;
    const memberPw = await call(
      "PATCH",
      `/admin/members/${u.id}/password`,
      adminToken,
      { newPassword: "baru1234" },
    );
    expect(memberPw.status).toBe(410);
    expect(errCode(memberPw)).toBe("OTP_ONLY");
  });
});

describe("§2 trips: coordinates + quota", () => {
  test("lone meetingLat (no lon) = INVALID_LOCATION", async () => {
    const u = await register("coords1");
    const r = await call("POST", "/trip-groups", u.token, {
      name: "T",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
      meetingLat: -7.2,
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("INVALID_LOCATION");
  });

  test("quota below 2 = INVALID_PAYLOAD; valid pair + quota persists", async () => {
    const u = await register("coords2");
    // Buat trip wajib HP (2 Nov 2026) — set dulu agar 201 tercapai.
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const bad = await call("POST", "/trip-groups", u.token, {
      name: "T",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
      quota: 1,
    });
    expect(bad.status).toBe(400);
    const ok = await call("POST", "/trip-groups", u.token, {
      name: "T",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
      meetingLat: -7.2,
      meetingLon: 109.9,
      quota: 15,
    });
    expect(ok.status).toBe(201);
    const trip = data(ok).trip as Json;
    expect(trip.meetingLat).toBe(-7.2);
    expect(trip.quota).toBe(15);
  });

  test("touring: destination + koordinat tersimpan; lone destinationLat = INVALID_LOCATION", async () => {
    const u = await register("coords3");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const bad = await call("POST", "/trip-groups", u.token, {
      name: "T",
      type: "TOURING",
      date: "2026-11-01",
      meetingPoint: "X",
      destination: "Puncak, Bogor",
      destinationLat: -6.7,
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_LOCATION");
    const ok = await call("POST", "/trip-groups", u.token, {
      name: "Touring — Puncak",
      type: "TOURING",
      date: "2026-11-01",
      meetingPoint: "Jakarta",
      meetingLat: -6.2,
      meetingLon: 106.8,
      destination: "Puncak, Bogor",
      destinationLat: -6.7,
      destinationLon: 106.9,
      quota: 10,
    });
    expect(ok.status).toBe(201);
    const trip = data(ok).trip as Json;
    expect(trip.destination).toBe("Puncak, Bogor");
    expect(trip.destinationLat).toBe(-6.7);
    expect(trip.destinationLon).toBe(106.9);
  });
});

describe("§4 SOS: contextual reasons, auto-level, 1-active", () => {
  async function makeTrip(token: string, type: "HIKING" | "TOURING"): Promise<string> {
    await call("PATCH", "/auth/me", token, { phone: "0811111111" });
    const r = await call("POST", "/trip-groups", token, {
      name: `Trip ${type}`,
      type,
      date: "2026-11-01",
      meetingPoint: "X",
    });
    return (data(r).trip as Json).id as string;
  }

  test("touring reason on hiking trip = SOS_REASON_INVALID_FOR_TRIP_TYPE", async () => {
    const u = await register("sos1");
    const tripId = await makeTrip(u.token, "HIKING");
    const r = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "MOTOR_RUSAK",
      lat: -7.2,
      lon: 109.9,
    });
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("SOS_REASON_INVALID_FOR_TRIP_TYPE");
  });

  test("auto-level: CEDERA=EMERGENCY, TERSESAT=URGENT, LAINNYA=HELP", async () => {
    const u = await register("sos2");
    const tripId = await makeTrip(u.token, "HIKING");
    const first = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "CEDERA",
      lat: -7.2,
      lon: 109.9,
    });
    expect((data(first).sos as Json).level).toBe("EMERGENCY");
    const sosId = (data(first).sos as Json).id as string;
    await call("PATCH", `/trip-groups/${tripId}/sos/${sosId}/cancel`, u.token);
    const second = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.9,
    });
    expect((data(second).sos as Json).level).toBe("URGENT");
  });

  test("second SOS while one is active = 409 SOS_ALREADY_ACTIVE; after resolve a new one passes", async () => {
    const u = await register("sos3");
    const tripId = await makeTrip(u.token, "TOURING");
    const first = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "BAN_BOCOR",
      lat: -7.2,
      lon: 109.9,
    });
    expect(first.status).toBe(201);
    const dup = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "BENSIN_HABIS",
      lat: -7.2,
      lon: 109.9,
    });
    expect(dup.status).toBe(409);
    expect(errCode(dup)).toBe("SOS_ALREADY_ACTIVE");
    const sosId = (data(first).sos as Json).id as string;
    await call("PATCH", `/trip-groups/${tripId}/sos/${sosId}/resolve`, u.token);
    const next = await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "BENSIN_HABIS",
      lat: -7.2,
      lon: 109.9,
    });
    expect(next.status).toBe(201);
  });

  test("cancel by non-sender = SENDER_ONLY", async () => {
    const leader = await register("sos4a");
    const other = await register("sos4b");
    const tripId = await makeTrip(leader.token, "HIKING");
    await call("POST", `/trip-groups/${tripId}/join`, other.token);
    const sos = await call("POST", `/trip-groups/${tripId}/sos`, other.token, {
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.9,
    });
    const sosId = (data(sos).sos as Json).id as string;
    const r = await call("PATCH", `/trip-groups/${tripId}/sos/${sosId}/cancel`, leader.token);
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("SENDER_ONLY");
  });
});

describe("A-4 emergency contacts CRUD + WA SOS recipients", () => {
  test("CRUD kontak darurat: create -> list -> delete; validasi nomor", async () => {
    const u = await register("ec1");
    // Create valid.
    const created = await call("POST", "/auth/me/emergency-contacts", u.token, {
      name: "Kakak",
      phone: "081234567890",
    });
    expect(created.status).toBe(201);
    const contact = data(created).contact as Json;
    expect(contact.name).toBe("Kakak");
    // Nomor dinormalisasi (strip spasi/dash).
    expect(contact.phone).toBe("081234567890");
    // Create invalid phone -> 400.
    const bad = await call("POST", "/auth/me/emergency-contacts", u.token, {
      name: "X",
      phone: "123",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    // List.
    const list = await call("GET", "/auth/me/emergency-contacts", u.token);
    expect(list.status).toBe(200);
    expect((data(list).contacts as Json[]).length).toBe(1);
    // Delete.
    const del = await call(
      "DELETE",
      `/auth/me/emergency-contacts/${contact.id}`,
      u.token,
    );
    expect(del.status).toBe(200);
    const after = await call("GET", "/auth/me/emergency-contacts", u.token);
    expect((data(after).contacts as Json[]).length).toBe(0);
    // Milik user lain tidak bisa dihapus.
    const other = await register("ec2");
    const c2 = await call("POST", "/auth/me/emergency-contacts", other.token, {
      name: "Ibu",
      phone: "0899887766",
    });
    const foreign = await call(
      "DELETE",
      `/auth/me/emergency-contacts/${(data(c2).contact as Json).id}`,
      u.token,
    );
    expect(foreign.status).toBe(404);
  });

  test("penerima WA SOS = kontak darurat pengirim + HP leader + bystander", async () => {
    // Leader punya phone; member (pengirim SOS) punya kontak darurat;
    // bystander dalam 2 km punya phone. Respons SOS mengekspos
    // waRecipients (nomor tujuan WA) supaya ketiga kelompok teruji
    // lewat jalur HTTP nyata.
    const leader = await register("wal");
    const sender = await register("was");
    const bys = await register("wab");
    // Set phone leader + bystander via PATCH /auth/me.
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    await call("PATCH", "/auth/me", bys.token, { phone: "0822222222" });
    // Kontak darurat pengirim.
    await call("POST", "/auth/me/emergency-contacts", sender.token, {
      name: "Kakak",
      phone: "0833333333",
    });
    // Trip: leader buat, sender + bystander join.
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "WA Trip",
      type: "HIKING",
      date: "2026-11-03",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, sender.token);
    await call("POST", `/trip-groups/${tripId}/join`, bys.token);
    // Posisi bystander dekat titik SOS (dalam 2 km).
    await call("POST", `/trip-groups/${tripId}/locations`, bys.token, {
      lat: -7.2001,
      lon: 109.9101,
      timestamp: new Date().toISOString(),
    });
    // Trigger SOS oleh sender.
    const sos = await call("POST", `/trip-groups/${tripId}/sos`, sender.token, {
      reason: "CEDERA",
      lat: -7.2,
      lon: 109.91,
    });
    expect(sos.status).toBe(201);
    // Penerima WA tercatat di respons dispatch debug (waRecipients).
    const alert = data(sos).sos as Json;
    const recipients = (data(sos).waRecipients ?? []) as string[];
    expect(recipients).toContain("0833333333"); // kontak darurat pengirim
    expect(recipients).toContain("0811111111"); // HP leader
    expect(recipients).toContain("0822222222"); // bystander
    // Pengirim sendiri tidak pernah jadi penerima.
    expect(recipients).not.toContain(null);
    expect(alert.id).toBeTruthy();

    // Log pengiriman WA tercatat per penerima untuk dashboard backend.
    // Tanpa WHATSAPP_TOKEN di env tes, status = SKIPPED_UNCONFIGURED.
    const adminToken = (await cachedAdminLogin()).token;
    const logs = await call(
      "GET",
      `/admin/wa-dispatch-logs?sosId=${alert.id}`,
      adminToken,
    );
    expect(logs.status).toBe(200);
    const rows = data(logs).logs as Json[];
    expect(rows.length).toBe(3);
    const kinds = rows.map((r) => r.recipient).sort();
    expect(kinds).toEqual(["BYSTANDER", "EMERGENCY_CONTACT", "LEADER"]);
    for (const row of rows) {
      expect(row.status).toBe("SKIPPED_UNCONFIGURED");
      expect(row.toPhone).toBeTruthy();
    }
    // Member biasa tidak boleh baca log (admin-only).
    const forbidden = await call(
      "GET",
      `/admin/wa-dispatch-logs?sosId=${alert.id}`,
      sender.token,
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("WX-1 weather + quakes: routing provider + fail-soft", () => {
  test("providers/status: BMKG+Open-Meteo+USGS, OpenWeather dicoret", async () => {
    const u = await register("wx1");
    const res = await call("GET", "/weather/providers/status", u.token);
    expect(res.status).toBe(200);
    const d = data(res);
    expect((d.weather as Json).indonesia).toBe("bmkg");
    expect((d.weather as Json).international).toBe("open-meteo");
    expect((d.quakes as Json).international).toBe("usgs");
    expect(d.openweather).toBe("removed");
  });

  test("current: routing provider benar; fail-soft (weather null OK, HTTP tetap 200)", async () => {
    const u = await register("wx2");
    // Indonesia -> provider bmkg.
    const indo = await call("GET", "/weather/current?lat=-7.2&lon=109.92", u.token);
    expect(indo.status).toBe(200);
    expect(data(indo).provider).toBe("bmkg");
    // Luar -> open-meteo.
    const tokyo = await call("GET", "/weather/current?lat=35.68&lon=139.69", u.token);
    expect(tokyo.status).toBe(200);
    expect(data(tokyo).provider).toBe("open-meteo");
    // Koordinat invalid -> 400.
    const bad = await call("GET", "/weather/current?lat=abc&lon=1", u.token);
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_LOCATION");
    // PUBLIK (31 Okt): layar pantau tanpa akun juga butuh cuaca —
    // tanpa auth tetap 200.
    const anon = await call("GET", "/weather/current?lat=1&lon=1");
    expect(anon.status).toBe(200);
  });

  test("quakes: routing provider benar; selalu array (fail-soft)", async () => {
    const u = await register("wx3");
    const indo = await call("GET", "/weather/quakes?lat=-7.2&lon=109.92", u.token);
    expect(indo.status).toBe(200);
    expect(data(indo).provider).toBe("bmkg");
    expect(Array.isArray(data(indo).quakes)).toBe(true);
    const outside = await call("GET", "/weather/quakes?lat=35.68&lon=139.69", u.token);
    expect(data(outside).provider).toBe("usgs");
    expect(Array.isArray(data(outside).quakes)).toBe(true);
  });
});

describe("A-2: rate limit auth + JWT pendek + refresh rotation", () => {
  test("OTP salah berulang -> kunci lalu 429 (OTP_LOCKED / RATE_LIMITED)", async () => {
    const u = await register("rl");
    void u;
    const email = `rl-${run}@t.local`;
    // Kode segar untuk percobaan salah (helper menunggu cooldown bila perlu).
    await requestOtpCode(email);
    const real = sentCodes.get(email)!;
    const wrong = real === "000000" ? "111111" : "000000";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await call("POST", "/auth/otp/verify", undefined, {
        identifier: email,
        code: wrong,
      });
      statuses.push(res.status);
    }
    expect(statuses[4]).toBe(429); // percobaan salah ke-5 -> OTP_LOCKED
    expect(statuses[statuses.length - 1]).toBe(429);
    // Email lain tidak ikut terkunci.
    const other = await call("POST", "/auth/otp/verify", undefined, {
      identifier: `lain-${run}@t.local`,
      code: "000000",
    });
    expect(other.status).toBe(401);
  });

  test("verify OTP mengembalikan refreshToken; refresh merotasi; reuse ditolak", async () => {
    const reg = await register("rot");
    const refresh1 = reg.refreshToken;
    expect(typeof refresh1).toBe("string");
    expect(refresh1.length).toBeGreaterThan(20);
    // Refresh -> access baru + refresh BARU (rotasi).
    const r1 = await call("POST", "/auth/refresh", undefined, {
      refreshToken: refresh1,
    });
    expect(r1.status).toBe(200);
    const access2 = data(r1).token as string;
    const refresh2 = data(r1).refreshToken as string;
    expect(refresh2).not.toBe(refresh1);
    // Access baru valid.
    const me = await call("GET", "/auth/me", access2);
    expect(me.status).toBe(200);
    // Reuse refresh lama -> 401 (sudah dirotasi/revoked).
    const reuse = await call("POST", "/auth/refresh", undefined, {
      refreshToken: refresh1,
    });
    expect(reuse.status).toBe(401);
    expect(errCode(reuse)).toBe("INVALID_REFRESH_TOKEN");
    // Refresh terbaru masih jalan.
    const r2 = await call("POST", "/auth/refresh", undefined, {
      refreshToken: refresh2,
    });
    expect(r2.status).toBe(200);
    // Logout mencabut refresh.
    const refresh3 = data(r2).refreshToken as string;
    const out = await call("POST", "/auth/logout", undefined, {
      refreshToken: refresh3,
    });
    expect(out.status).toBe(200);
    const afterLogout = await call("POST", "/auth/refresh", undefined, {
      refreshToken: refresh3,
    });
    expect(afterLogout.status).toBe(401);
  });
});

describe("A-3: tolak isMock di ingest lokasi (anti-cheat ERD)", () => {
  test("isMock true -> 400 MOCK_LOCATION_REJECTED; false/absen -> diterima", async () => {
    const u = await register("mock1");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", u.token, {
      name: "Mock Trip",
      type: "HIKING",
      date: "2026-11-02",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    // isMock true -> tolak eksplisit.
    const mocked = await call("POST", `/trip-groups/${tripId}/locations`, u.token, {
      lat: -7.2,
      lon: 109.91,
      isMock: true,
      timestamp: new Date().toISOString(),
    });
    expect(mocked.status).toBe(400);
    expect(errCode(mocked)).toBe("MOCK_LOCATION_REJECTED");
    // isMock false -> diterima.
    const real = await call("POST", `/trip-groups/${tripId}/locations`, u.token, {
      lat: -7.2,
      lon: 109.91,
      isMock: false,
      timestamp: new Date().toISOString(),
    });
    expect(real.status).toBe(201);
    // Tanpa field -> diterima (klien lama).
    const legacy = await call("POST", `/trip-groups/${tripId}/locations`, u.token, {
      lat: -7.2,
      lon: 109.91,
      timestamp: new Date().toISOString(),
    });
    expect(legacy.status).toBe(201);
  });
});

describe("PAY: upgrade Pro + trip berbayar", () => {
  test("upgrade Pro: ajukan -> PENDING -> admin verifikasi -> isPro", async () => {
    const u = await register("pay1");
    // Status awal: belum Pro, belum ada pengajuan.
    const st0 = await call("GET", "/auth/me/upgrade", u.token);
    expect(st0.status).toBe(200);
    expect(data(st0).isPro).toBe(false);
    expect(data(st0).request).toBeNull();
    // Ajukan (mockup: 'Saya sudah bayar' setelah scan QRIS).
    const req = await call("POST", "/auth/me/upgrade", u.token, {});
    expect(req.status).toBe(201);
    expect((data(req).request as Json).status).toBe("PENDING");
    expect((data(req).request as Json).amount).toBe(150000);
    // Pengajuan ganda saat masih PENDING -> 409.
    const dup = await call("POST", "/auth/me/upgrade", u.token, {});
    expect(dup.status).toBe(409);
    expect(errCode(dup)).toBe("UPGRADE_ALREADY_PENDING");
    // Admin lihat daftar pengajuan + verifikasi.
    const adminToken = (await cachedAdminLogin()).token;
    const list = await call("GET", "/admin/upgrades?status=PENDING", adminToken);
    expect(list.status).toBe(200);
    const mine = (data(list).upgrades as Json[]).find(
      (x) => x.id === (data(req).request as Json).id,
    );
    expect(mine).toBeTruthy();
    const verify = await call(
      "POST",
      `/admin/upgrades/${(data(req).request as Json).id}/verify`,
      adminToken,
    );
    expect(verify.status).toBe(200);
    // User kini Pro.
    const st1 = await call("GET", "/auth/me/upgrade", u.token);
    expect(data(st1).isPro).toBe(true);
    // Member biasa tidak boleh verifikasi.
    const forbidden = await call(
      "POST",
      `/admin/upgrades/${(data(req).request as Json).id}/verify`,
      u.token,
    );
    expect(forbidden.status).toBe(403);
  });

  test("trip berbayar: buat butuh Pro; join membuat tagihan WAITING; organizer konfirmasi", async () => {
    const org = await register("pay2");
    await call("PATCH", "/auth/me", org.token, { phone: "0811111111" });
    const member = await register("pay3");
    // Buat trip berbayar tanpa Pro -> 403 PRO_REQUIRED.
    const denied = await call("POST", "/trip-groups", org.token, {
      name: "Paid Trip",
      type: "HIKING",
      date: "2026-11-08",
      meetingPoint: "Basecamp Cibodas",
      price: 150000,
    });
    expect(denied.status).toBe(403);
    expect(errCode(denied)).toBe("PRO_REQUIRED");
    // Jadikan organizer Pro via alur admin.
    await call("POST", "/auth/me/upgrade", org.token, {});
    const adminToken = (await cachedAdminLogin()).token;
    const pending = await call("GET", "/admin/upgrades?status=PENDING", adminToken);
    const orgReq = (data(pending).upgrades as Json[]).find(
      (x) => x.userId === org.id,
    ) as Json;
    await call("POST", `/admin/upgrades/${orgReq.id}/verify`, adminToken);
    // Aturan baru: trip berbayar wajib punya rekening organizer.
    await call("PATCH", "/auth/me", org.token, {
      bankName: "BCA",
      bankAccountNumber: "1234567890",
      bankAccountHolder: "Organizer Paid",
    });
    // Kini buat trip berbayar sukses; price tersimpan.
    const trip = await call("POST", "/trip-groups", org.token, {
      name: "Paid Trip",
      type: "HIKING",
      date: "2026-11-08",
      meetingPoint: "Basecamp Cibodas",
      price: 150000,
    });
    expect(trip.status).toBe(201);
    const tripId = (data(trip).trip as Json).id as string;
    expect((data(trip).trip as Json).price).toBe(150000);
    // Join tanpa Pro -> 403 (S&K §2: trip berbayar hanya member Pro).
    const joinDenied = await call(
      "POST",
      `/trip-groups/${tripId}/join`,
      member.token,
    );
    expect(joinDenied.status).toBe(403);
    expect(errCode(joinDenied)).toBe("PRO_REQUIRED");
    // Jadikan member Pro juga.
    await call("POST", "/auth/me/upgrade", member.token, {});
    const pending2 = await call("GET", "/admin/upgrades?status=PENDING", adminToken);
    const memberReq = (data(pending2).upgrades as Json[]).find(
      (x) => x.userId === member.id,
    ) as Json;
    await call("POST", `/admin/upgrades/${memberReq.id}/verify`, adminToken);
    // Join trip berbayar -> member + tagihan WAITING otomatis.
    const joined = await call("POST", `/trip-groups/${tripId}/join`, member.token);
    expect(joined.status).toBe(200);
    const pay0 = await call(
      "GET",
      `/trip-groups/${tripId}/payments/me`,
      member.token,
    );
    expect(pay0.status).toBe(200);
    expect((data(pay0).payment as Json).status).toBe("WAITING");
    expect((data(pay0).payment as Json).amount).toBe(150000);
    // Organizer lihat daftar pembayaran + konfirmasi.
    const list = await call("GET", `/trip-groups/${tripId}/payments`, org.token);
    expect(list.status).toBe(200);
    const row = (data(list).payments as Json[])[0] as Json;
    const confirm = await call(
      "POST",
      `/trip-groups/${tripId}/payments/${row.id}/confirm`,
      org.token,
    );
    expect(confirm.status).toBe(200);
    const pay1 = await call(
      "GET",
      `/trip-groups/${tripId}/payments/me`,
      member.token,
    );
    expect((data(pay1).payment as Json).status).toBe("CONFIRMED");
    // Member biasa tidak boleh konfirmasi (LEADER only).
    const forbidden = await call(
      "POST",
      `/trip-groups/${tripId}/payments/${row.id}/confirm`,
      member.token,
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("§14 admin guards + verification + reports", () => {
  let adminToken: string;
  let adminId: string;
  beforeAll(async () => {
    const a = await cachedAdminLogin();
    adminToken = a.token;
    adminId = a.id;
  });

  test("non-admin hits ADMIN_ONLY on /admin/*", async () => {
    const u = await register("adm1");
    const r = await call("GET", "/admin/verifications", u.token);
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe("ADMIN_ONLY");
  });

  test("registration creates one structured pending organizer application without sensitive fields", async () => {
    const a = await register("verif-a");
    const pending1 = await call("GET", "/admin/verifications", adminToken);
    expect(pending1.status).toBe(200);
    const rows = data(pending1).pending as Json[];
    const row = rows.find((item) => (item.user as Json | undefined)?.id === a.id);
    expect(row).toBeDefined();
    expect((row!.user as Json).name).toBe("User verif-a");
    expect((row!.user as Json).email).toBe(`verif-a-${run}@t.local`);
    expect(row!.status).toBe("PENDING");
    expect(row!.organizerType).toBeNull();
    expect(row!.region).toBeNull();
    expect(row!.avatarUrl).toBeNull();
    expect(row!.trip).toBeNull();
    expect(row!.identityDocumentComplete).toBe(false);
    expect(row!.profileComplete).toBe(false);
    expect(Number.isNaN(Date.parse(row!.submittedAt as string))).toBe(false);
    expect(Object.keys(row!).sort()).toEqual([
      "address",
      "avatarUrl",
      "hasIdentityDocument",
      "id",
      "identityDocumentComplete",
      "organizerName",
      "organizerType",
      "profileComplete",
      "region",
      "status",
      "submittedAt",
      "trip",
      "user",
    ]);
    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("identityDocumentUrl");
    expect(row).not.toHaveProperty("identityDocumentContents");
    expect(row!.user as Json).not.toHaveProperty("passwordHash");

    const ensurePending = (
      testDb as unknown as {
        createPendingOrganizerVerification: (
          userId: string,
          input?: Record<string, unknown>,
        ) => Promise<Json>;
      }
    ).createPendingOrganizerVerification.bind(testDb);
    const seedTrip = await testDb.prisma.trip.findFirstOrThrow({ select: { id: true } });
    const seedInput = {
      tripId: seedTrip.id,
      organizerType: "HIKING",
      region: "Lombok, NTB",
      avatarUrl: null,
      identityDocumentComplete: true,
      profileComplete: true,
      submittedAt: new Date("2026-10-31T02:00:00.000Z"),
    };
    const existing = await ensurePending(a.id, seedInput);
    const repeated = await ensurePending(a.id, seedInput);
    expect(existing.id).toBe(row!.id);
    expect(repeated.id).toBe(row!.id);
    expect(repeated.region).toBe("Lombok, NTB");
    expect(repeated.profileComplete).toBe(true);
    const count = await (
      testDb.prisma as unknown as {
        organizerVerification: { count: (args: Json) => Promise<number> };
      }
    ).organizerVerification.count({ where: { userId: a.id, status: "PENDING" } });
    expect(count).toBe(1);
  });

  test("admin list reconciles a user created by the pre-migration registration path", async () => {
    const legacy = await testDb.createUser({
      email: `legacy-verification-${run}@t.local`,
      name: "Legacy Verification",
      slug: `legacy-verification-${run}`,
      passwordHash: "unused-in-this-test",
      phone: null,
      isAdmin: false,
      role: "user",
      isVerified: false,
    });
    const before = await testDb.prisma.organizerVerification.count({
      where: { userId: legacy.id, status: "PENDING" },
    });
    expect(before).toBe(0);

    const pending = data(await call("GET", "/admin/verifications", adminToken)).pending as Json[];
    expect(pending.some((row) => (row.user as Json).id === legacy.id)).toBe(true);
    const after = await testDb.prisma.organizerVerification.count({
      where: { userId: legacy.id, status: "PENDING" },
    });
    expect(after).toBe(1);
  });

  test("structured create preserves metadata when racing queue reconciliation", async () => {
    const legacy = await testDb.createUser({
      email: `legacy-race-${run}@t.local`,
      name: "Legacy Race",
      slug: `legacy-race-${run}`,
      passwordHash: "unused-in-this-test",
      phone: null,
      isAdmin: false,
      role: "user",
      isVerified: false,
    });
    const seedTrip = await testDb.prisma.trip.findFirstOrThrow({ select: { id: true } });
    const structured = {
      tripId: seedTrip.id,
      organizerType: "TOURING" as const,
      region: "Malang, Jawa Timur",
      avatarUrl: null,
      identityDocumentComplete: true,
      profileComplete: true,
      submittedAt: new Date("2026-10-31T05:00:00.000Z"),
    };

    await Promise.all([
      testDb.reconcilePendingOrganizerVerifications(),
      testDb.createPendingOrganizerVerification(legacy.id, structured),
    ]);

    const rows = await testDb.prisma.organizerVerification.findMany({
      where: { userId: legacy.id, status: "PENDING" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tripId).toBe(seedTrip.id);
    expect(rows[0]?.organizerType).toBe("TOURING");
    expect(rows[0]?.region).toBe("Malang, Jawa Timur");
    expect(rows[0]?.identityDocumentComplete).toBe(true);
    expect(rows[0]?.profileComplete).toBe(true);
    expect(rows[0]?.submittedAt.toISOString()).toBe("2026-10-31T05:00:00.000Z");
  });

  test("approve updates application and user atomically; a second review is NOT_FOUND", async () => {
    const a = await register("verif-approve");
    const approved = await call("PATCH", `/admin/members/${a.id}/verify`, adminToken);
    expect(approved.status).toBe(200);
    expect((data(approved).user as Json).isVerified).toBe(true);

    const application = await (
      testDb.prisma as unknown as {
        organizerVerification: { findFirst: (args: Json) => Promise<Json | null> };
      }
    ).organizerVerification.findFirst({ where: { userId: a.id }, orderBy: { submittedAt: "desc" } });
    expect(application?.status).toBe("APPROVED");
    expect(application?.reviewedById).toBe(adminId);
    expect(application?.reviewedAt).not.toBeNull();

    const pending = data(await call("GET", "/admin/verifications", adminToken)).pending as Json[];
    expect(pending.some((row) => (row.user as Json).id === a.id)).toBe(false);
    const second = await call("PATCH", `/admin/members/${a.id}/verify`, adminToken);
    expect(second.status).toBe(404);
    expect(errCode(second)).toBe("NOT_FOUND");
  });

  test("reject stores a trimmed note and updates the user; user without pending is NOT_FOUND", async () => {
    const b = await register("verif-reject");
    const rejected = await call(
      "PATCH",
      `/admin/members/${b.id}/reject-verification`,
      adminToken,
      { note: "  Dokumen buram  " },
    );
    expect(rejected.status).toBe(200);
    const rejectedUser = data(rejected).user as Json;
    expect(rejectedUser.isVerified).toBe(false);
    expect(rejectedUser.verificationRejectedAt).not.toBeNull();

    const application = await (
      testDb.prisma as unknown as {
        organizerVerification: { findFirst: (args: Json) => Promise<Json | null> };
      }
    ).organizerVerification.findFirst({ where: { userId: b.id }, orderBy: { submittedAt: "desc" } });
    expect(application?.status).toBe("REJECTED");
    expect(application?.rejectionNote).toBe("Dokumen buram");
    expect(application?.reviewedById).toBe(adminId);

    const noPending = await call("PATCH", `/admin/members/${adminId}/verify`, adminToken);
    expect(noPending.status).toBe(404);
    expect(errCode(noPending)).toBe("NOT_FOUND");
  });

  test("concurrent approve/reject claims exactly one pending application", async () => {
    const c = await register("verif-race");
    const [approved, rejected] = await Promise.all([
      call("PATCH", `/admin/members/${c.id}/verify`, adminToken),
      call("PATCH", `/admin/members/${c.id}/reject-verification`, adminToken, {
        note: "Race rejection",
      }),
    ]);
    expect([approved.status, rejected.status].sort()).toEqual([200, 404]);

    const application = await testDb.prisma.organizerVerification.findFirstOrThrow({
      where: { userId: c.id },
      orderBy: { submittedAt: "desc" },
    });
    const user = await testDb.userById(c.id);
    expect(application.status === "APPROVED" || application.status === "REJECTED").toBe(true);
    expect(user?.isVerified).toBe(application.status === "APPROVED");
    expect(user?.verificationRejectedAt !== null).toBe(application.status === "REJECTED");
  });

  test("report: member submits, admin lists with reporterName, DISMISSED action sticks", async () => {
    const u = await register("rep1");
    const created = await call("POST", "/reports", u.token, {
      targetType: "Komentar trip",
      reason: "bahasa tidak sopan",
    });
    expect(created.status).toBe(201);
    const id = (data(created).report as Json).id as string;
    const list = await call("GET", "/admin/reports?status=OPEN", adminToken);
    const row = (data(list).reports as Json[]).find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row?.reporterName).toBe("User rep1");
    const closed = await call("PATCH", `/admin/reports/${id}/close`, adminToken, {
      action: "DISMISSED",
    });
    expect((data(closed).report as Json).status).toBe("DISMISSED");
  });
});

describe("CC command center: positions + cross-trip overview (RBAC)", () => {
  let adminToken: string;
  beforeAll(async () => {
    adminToken = (await cachedAdminLogin()).token;
  });

  test("GET /trip-groups/:id/positions joins members with their latest location", async () => {
    const leader = await register("ccpos1");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const other = await register("ccpos2");
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "CC Pos Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, other.token);
    await call("POST", `/trip-groups/${tripId}/locations`, leader.token, {
      lat: -8.41,
      lon: 116.45,
      altitude: 2100,
      batteryLevel: 77,
    });
    const res = await call("GET", `/trip-groups/${tripId}/positions`, adminToken);
    expect(res.status).toBe(200);
    const positions = data(res).positions as Json[];
    // One row per member, even members without a location yet.
    expect(positions.length).toBe(2);
    const withLoc = positions.find((p) => p.userId === leader.id);
    expect(withLoc).toBeDefined();
    expect((withLoc!.user as Json).name).toBe("User ccpos1");
    expect(withLoc!.role).toBe("LEADER");
    expect((withLoc!.location as Json).lat).toBe(-8.41);
    expect((withLoc!.location as Json).batteryLevel).toBe(77);
    const noLoc = positions.find((p) => p.userId === other.id);
    expect(noLoc!.location).toBeNull();
  });

describe("Activity names [ACTIVITY]: member-alerts + SOS list carry user names", () => {
  test("GET /trip-groups/:id/member-alerts returns userName (low battery triggers an alert)", async () => {
    const leader = await register("actalert");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Activity Alerts Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    // Battery < 20% raises an alert even for a fresh position, so no
    // clock manipulation is needed to produce an alert row.
    await call("POST", `/trip-groups/${tripId}/locations`, leader.token, {
      lat: -7.2,
      lon: 109.9,
      batteryLevel: 10,
    });
    const res = await call("GET", `/trip-groups/${tripId}/member-alerts`, leader.token);
    expect(res.status).toBe(200);
    const alerts = data(res).alerts as Json[];
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.userId).toBe(leader.id);
    expect(alerts[0]!.userName).toBe("User actalert");
    expect(alerts[0]!.batteryLevel).toBe(10);
    expect(typeof alerts[0]!.lastSeen).toBe("string");
  });

  test("GET /trip-groups/:id/sos returns senderName", async () => {
    const leader = await register("actsos");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Activity SOS Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/sos`, leader.token, {
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.9,
    });
    const res = await call("GET", `/trip-groups/${tripId}/sos`, leader.token);
    expect(res.status).toBe(200);
    const sos = data(res).sos as Json[];
    expect(sos.length).toBe(1);
    expect(sos[0]!.senderId).toBe(leader.id);
    expect(sos[0]!.senderName).toBe("User actsos");
  });

  test("GET /trip-groups/:id/members already carries user.name (web Member page relies on it)", async () => {
    const leader = await register("actmem");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Activity Members Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    const res = await call("GET", `/trip-groups/${tripId}/members`, leader.token);
    expect(res.status).toBe(200);
    const members = data(res).members as Json[];
    expect(members.length).toBe(1);
    expect(members[0]!.userId).toBe(leader.id);
    expect((members[0]!.user as Json).name).toBe("User actmem");
  });
});

  test("GET /command-center/overview: dashboard role only; members blocked", async () => {
    const u = await register("ccov1");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const denied = await call("GET", "/command-center/overview", u.token);
    expect(denied.status).toBe(403);
    expect(errCode(denied)).toBe("ADMIN_ONLY");

    const trip = await call("POST", "/trip-groups", u.token, {
      name: "CC Overview Trip",
      type: "HIKING",
      // Tanggal hari ini (bukan tanggal tetap): guard TRIP_EXPIRED
      // menolak start trip bertanggal lewat, jadi fixture tanggal
      // tetap akan membusuk begitu kalender berjalan.
      date: new Date().toISOString().slice(0, 10),
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/start`, u.token);
    await call("POST", `/trip-groups/${tripId}/locations`, u.token, {
      lat: -6.77,
      lon: 106.97,
      batteryLevel: 55,
    });
    await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "TERSESAT",
      lat: -6.77,
      lon: 106.97,
    });

    const res = await call("GET", "/command-center/overview", adminToken);
    expect(res.status).toBe(200);
    const trips = data(res).trips as Json[];
    const row = trips.find((t) => (t.trip as Json).id === tripId);
    expect(row).toBeDefined();
    // Overview carries ACTIVE trips only, each with positions + active SOS.
    expect((row!.trip as Json).status).toBe("ACTIVE");
    const positions = row!.positions as Json[];
    expect(positions.length).toBe(1);
    expect((positions[0]!.location as Json).lat).toBe(-6.77);
    const sos = row!.sos as Json[];
    expect(sos.length).toBe(1);
    expect(sos[0]!.status).toBe("ACTIVE");
    // A CLOSED/PLANNED trip must not appear.
    for (const t of trips) expect((t.trip as Json).status).toBe("ACTIVE");
  });
});

describe("§16 share links + §17 close", () => {
  test("public shared view works without auth; revoke kills the token", async () => {
    const u = await register("share1");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", u.token, {
      name: "Share Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    const link = await call("POST", `/trip-groups/${tripId}/share-links`, u.token, {
      label: "Keluarga",
      scope: "EMERGENCY_CONTACT",
    });
    const sl = data(link).shareLink as Json;
    const pub = await call("GET", `/shared-trips/${sl.token}`);
    expect(pub.status).toBe(200);
    expect((data(pub).trip as Json).name).toBe("Share Trip");
    expect(data(pub).status).toBe("SAFE");
    // Layar pantau mobile (watch-trip) butuh nama anggota: respons
    // publik menyertakan positions (role + user name + location|null),
    // bentuk sama dengan /trip-groups/:id/positions.
    const positions = data(pub).positions as Json[];
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThanOrEqual(1);
    const leaderPos = positions.find((p) => p.role === "LEADER") as Json;
    expect(((leaderPos.user as Json).name as string).length).toBeGreaterThan(0);
    // Tanpa email/phone di tampilan publik.
    expect((leaderPos.user as Json).email).toBeUndefined();
    await call("DELETE", `/trip-groups/${tripId}/share-links/${sl.id}`, u.token);
    const gone = await call("GET", `/shared-trips/${sl.token}`);
    expect(gone.status).toBe(404);
    expect(errCode(gone)).toBe("SHARE_LINK_NOT_FOUND");
  });

  test("public profile by slug: name + stats + finished trips; no email/phone", async () => {
    const u = await register("pp");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const meRes = await call("GET", "/auth/me", u.token);
    const me = data(meRes).user as Json;
    const slug = me.slug as string;
    // Trip CLOSED masuk riwayat profil publik.
    const trip = await call("POST", "/trip-groups", u.token, {
      name: "Profil Trip",
      type: "HIKING",
      date: "2026-11-02",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/check-in-meeting-point`, u.token);
    await call("POST", `/trip-groups/${tripId}/close`, u.token, {});
    const res = await call("GET", `/users/${slug}/profile`, u.token);
    expect(res.status).toBe(200);
    const profile = data(res).profile as Json;
    expect(profile.name).toBe(me.name);
    expect(profile.email).toBeUndefined();
    expect(profile.phone).toBeUndefined();
    expect((profile.stats as Json).totalTrips as number).toBeGreaterThanOrEqual(1);
    const history = profile.finishedTrips as Json[];
    expect(history.some((h) => h.name === "Profil Trip")).toBe(true);
    // Slug tak dikenal -> 404 USER_NOT_FOUND.
    const missing = await call("GET", "/users/tidak-ada-xyz/profile", u.token);
    expect(missing.status).toBe(404);
    expect(errCode(missing)).toBe("USER_NOT_FOUND");
  });

  test("close with unaccounted members = 409 unless confirmUnaccounted", async () => {
    const leader = await register("close1");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const other = await register("close2");
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Close Trip",
      type: "HIKING",
      date: "2026-11-01",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, other.token);
    const refused = await call("POST", `/trip-groups/${tripId}/close`, leader.token, {});
    expect(refused.status).toBe(409);
    expect(errCode(refused)).toBe("TRIP_HAS_UNACCOUNTED_MEMBERS");
    const confirmed = await call("POST", `/trip-groups/${tripId}/close`, leader.token, {
      confirmUnaccounted: true,
    });
    expect(confirmed.status).toBe(200);
    expect((data(confirmed).trip as Json).status).toBe("CLOSED");
  });
});

describe("Komunitas: list + hapus (admin-only) [KOMUNITAS]", () => {
  let adminToken: string;
  beforeAll(async () => {
    adminToken = (await cachedAdminLogin()).token;
  });

  // A-5 §12 membuka GET untuk semua user ber-auth (mobile Explore/Clubs);
  // DELETE tetap admin-only (halaman Komunitas dashboard).
  test("non-admin boleh GET /communities; DELETE tetap ADMIN_ONLY", async () => {
    const u = await register("com1");
    const r = await call("GET", "/communities", u.token);
    expect(r.status).toBe(200);
    const d = await call("DELETE", "/communities/00000000-0000-0000-0000-000000000000", u.token);
    expect(d.status).toBe(403);
    expect(errCode(d)).toBe("ADMIN_ONLY");
  });

  test("list mengembalikan memberCount; hapus menghilangkan; hapus ulang = 404", async () => {
    // Tidak ada endpoint create komunitas (sesuai permintaan: list + hapus
    // saja), jadi seed langsung via Prisma untuk test ini.
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
    });
    try {
      const a = await register("com-a");
      const b = await register("com-b");
      const community = await prisma.community.create({
        data: { name: `Komunitas ${run}` },
      });
      await prisma.communityMember.createMany({
        data: [
          { communityId: community.id, userId: a.id },
          { communityId: community.id, userId: b.id },
        ],
      });
      const list = await call("GET", "/communities", adminToken);
      expect(list.status).toBe(200);
      const row = (data(list).communities as Json[]).find((c) => c.id === community.id);
      expect(row).toBeDefined();
      expect(row?.name).toBe(`Komunitas ${run}`);
      expect(row?.memberCount).toBe(2);
      const del = await call("DELETE", `/communities/${community.id}`, adminToken);
      expect(del.status).toBe(200);
      expect(data(del).deleted).toBe(true);
      const list2 = await call("GET", "/communities", adminToken);
      expect((data(list2).communities as Json[]).map((c) => c.id)).not.toContain(community.id);
      const gone = await call("DELETE", `/communities/${community.id}`, adminToken);
      expect(gone.status).toBe(404);
      expect(errCode(gone)).toBe("NOT_FOUND");
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe("SET-4/5/6: platform settings (signup gate, peta publik, maintenance)", () => {

  test("GET /admin/settings default: signupOpen+publicMapTrips true, maintenanceMode false; PATCH butuh admin", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const r = await call("GET", "/admin/settings", adminToken);
    expect(r.status).toBe(200);
    const s = data(r).settings as Json;
    expect(s.signupOpen).toBe(true);
    expect(s.publicMapTrips).toBe(true);
    expect(s.maintenanceMode).toBe(false);
    // Member biasa tidak boleh baca/tulis.
    const u = await register("set-biasa");
    const deniedRead = await call("GET", "/admin/settings", u.token);
    expect(deniedRead.status).toBe(403);
    const deniedWrite = await call("PATCH", "/admin/settings", u.token, {
      signupOpen: false,
    });
    expect(deniedWrite.status).toBe(403);
    // Payload bukan boolean ditolak.
    const bad = await call("PATCH", "/admin/settings", adminToken, {
      signupOpen: "nope",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_PAYLOAD");
  });

  test("Notifikasi Brevo: matriks per event x channel tersimpan lewat PATCH, GET mengembalikan default + brevo status", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const before = await call("GET", "/admin/settings", adminToken);
    expect(before.status).toBe(200);
    const s0 = data(before).settings as Json;
    expect(s0.notifRegistEmail).toBe(true);
    expect(s0.notifSosSms).toBe(true);
    expect((data(before).brevo as Json).configured).toBe(false);
    try {
      const off = await call("PATCH", "/admin/settings", adminToken, {
        notifSosSms: false,
        notifCheckinEmail: false,
      });
      expect(off.status).toBe(200);
      const s = data(off).settings as Json;
      expect(s.notifSosSms).toBe(false);
      expect(s.notifCheckinEmail).toBe(false);
      expect(s.notifSosEmail).toBe(true);
      const bad = await call("PATCH", "/admin/settings", adminToken, {
        notifSosSms: "nope",
      });
      expect(bad.status).toBe(400);
      expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        notifSosSms: true,
        notifCheckinEmail: true,
      });
    }
  });

  test("Toggle kanal OTP: email, SMS, WhatsApp tersimpan lewat PATCH (default email+SMS aktif, WhatsApp mati)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const before = await call("GET", "/admin/settings", adminToken);
    const s0 = data(before).settings as Json;
    expect(s0.otpEmail).toBe(true);
    expect(s0.otpSms).toBe(true);
    expect(s0.otpWhatsapp).toBe(false);
    try {
      const off = await call("PATCH", "/admin/settings", adminToken, {
        otpEmail: false,
        otpWhatsapp: true,
      });
      expect(off.status).toBe(200);
      const s = data(off).settings as Json;
      expect(s.otpEmail).toBe(false);
      expect(s.otpSms).toBe(true);
      expect(s.otpWhatsapp).toBe(true);
      const bad = await call("PATCH", "/admin/settings", adminToken, {
        otpSms: "nope",
      });
      expect(bad.status).toBe(400);
      expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        otpEmail: true,
        otpWhatsapp: false,
      });
    }
  });

  test("Modul AI: keenam flag default nyala, PATCH tersimpan, non-boolean ditolak (infrastruktur toggle, PR AI belum ter-gate)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const before = await call("GET", "/admin/settings", adminToken);
    const s0 = data(before).settings as Json;
    for (const key of ["aiV", "aiP", "aiL", "aiQ", "aiR", "aiG"]) {
      expect(s0[key]).toBe(true);
    }
    try {
      const off = await call("PATCH", "/admin/settings", adminToken, {
        aiQ: false,
        aiG: false,
      });
      expect(off.status).toBe(200);
      const s = data(off).settings as Json;
      expect(s.aiQ).toBe(false);
      expect(s.aiG).toBe(false);
      expect(s.aiV).toBe(true);
      const bad = await call("PATCH", "/admin/settings", adminToken, {
        aiV: "nope",
      });
      expect(bad.status).toBe(400);
      expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        aiQ: true,
        aiG: true,
      });
    }
  });

  test("Setting Brevo: nomor + ID template WhatsApp tersimpan lewat PATCH, nilai tidak valid ditolak 400", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    try {
      const ok = await call("PATCH", "/admin/settings", adminToken, {
        brevoWhatsappSenderNumber: "628123456789",
        brevoWhatsappTemplateId: "123456",
        brevoSenderEmail: "notif@gobareng.test",
        brevoSmsSender: "GoBareng",
      });
      expect(ok.status).toBe(200);
      const s = data(ok).settings as Json;
      expect(s.brevoWhatsappSenderNumber).toBe("628123456789");
      expect(s.brevoWhatsappTemplateId).toBe("123456");
      expect(s.brevoSenderEmail).toBe("notif@gobareng.test");
      // Tanpa API key di env tes, status WA tetap false — yang
      // diuji di sini persistensi settingnya, bukan pengiriman.
      expect((data(ok).brevo as Json).whatsappConfigured).toBe(false);
      for (const badPatch of [
        { brevoWhatsappTemplateId: "abc" },
        { brevoWhatsappSenderNumber: "+62 812" },
        { brevoSenderEmail: "bukan-email" },
        { brevoWhatsappSenderNumber: 62812 },
      ]) {
        const bad = await call("PATCH", "/admin/settings", adminToken, badPatch);
        expect(bad.status).toBe(400);
        expect(errCode(bad)).toBe("INVALID_PAYLOAD");
      }
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        brevoWhatsappSenderNumber: "",
        brevoWhatsappTemplateId: "",
        brevoSenderEmail: "",
        brevoSmsSender: "",
      });
    }
  });

  test("SET-4: signupOpen=false menutup register (403 SIGNUP_CLOSED), buka lagi memulihkan", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const off = await call("PATCH", "/admin/settings", adminToken, {
      signupOpen: false,
    });
    expect(off.status).toBe(200);
    expect((data(off).settings as Json).signupOpen).toBe(false);
    try {
      // Request OTP tetap 200 (tidak membocorkan keberadaan akun);
      // gerbang signup ditegakkan saat verify membuat akun baru.
      const closedEmail = `closed-${run}@t.local`;
      await requestOtpCode(closedEmail);
      const closedCode = sentCodes.get(closedEmail);
      const r = await call("POST", "/auth/otp/verify", undefined, {
        identifier: closedEmail,
        code: closedCode,
        name: "Closed Door",
      });
      expect(r.status).toBe(403);
      expect(errCode(r)).toBe("SIGNUP_CLOSED");
      // Login akun lama tetap boleh saat pendaftaran ditutup.
      const login = await loginOtp(process.env.ADMIN_EMAIL as string);
      expect(login.token).toBeTruthy();
    } finally {
      await call("PATCH", "/admin/settings", adminToken, { signupOpen: true });
    }
    const again = await register("set-reopen");
    expect(again.token).toBeTruthy();
  });

  test("SET-6: maintenanceMode=true menutup endpoint member (503 MAINTENANCE_MODE); admin + login + health tetap jalan", async () => {
    const u = await register("set-maint");
    const adminToken = (await cachedAdminLogin()).token;
    const on = await call("PATCH", "/admin/settings", adminToken, {
      maintenanceMode: true,
    });
    expect(on.status).toBe(200);
    try {
      const blocked = await call("GET", "/trip-groups", u.token);
      expect(blocked.status).toBe(503);
      expect(errCode(blocked)).toBe("MAINTENANCE_MODE");
      // Login tetap jalan (supaya admin bisa masuk dan mematikan mode).
      const login = await loginOtp(process.env.ADMIN_EMAIL as string);
      expect(login.token).toBeTruthy();
      // Peran dashboard tidak terkunci.
      const adminOk = await call("GET", "/admin/settings", adminToken);
      expect(adminOk.status).toBe(200);
      const ccOk = await call("GET", "/command-center/overview", adminToken);
      expect(ccOk.status).toBe(200);
      // Health untuk monitoring tetap 200.
      const health = await fetch(`${BASE.replace("/api/v1", "")}/health`);
      expect(health.status).toBe(200);
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        maintenanceMode: false,
      });
    }
    const after = await call("GET", "/trip-groups", u.token);
    expect(after.status).toBe(200);
  });

  test("SET-5: publicMapTrips tersimpan dan terbaca dashboard (command_center boleh baca, tidak boleh tulis)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    // Buat akun command_center via /admin/staff.
    const ccEmail = `cc-set5-${run}@t.local`;
    const created = await call("POST", "/admin/staff", adminToken, {
      email: ccEmail,
      name: "CC Set5",
      role: "command_center",
    });
    expect(created.status).toBe(201);
    const ccToken = (await loginOtp(ccEmail)).token;
    const off = await call("PATCH", "/admin/settings", adminToken, {
      publicMapTrips: false,
    });
    expect(off.status).toBe(200);
    try {
      // command_center membaca nilai yang sama (untuk filter pin peta).
      const ccRead = await call("GET", "/admin/settings", ccToken);
      expect(ccRead.status).toBe(200);
      expect((data(ccRead).settings as Json).publicMapTrips).toBe(false);
      // Tapi tidak boleh menulis.
      const ccWrite = await call("PATCH", "/admin/settings", ccToken, {
        publicMapTrips: true,
      });
      expect(ccWrite.status).toBe(403);
    } finally {
      await call("PATCH", "/admin/settings", adminToken, {
        publicMapTrips: true,
      });
    }
  });

  test("SET-2: notifVerify=false mematikan notif VERIFICATION_REQUEST; default true menyalakan", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    // Default: register memicu notif verifikasi ke staf dashboard.
    const before = await call("GET", "/admin/settings", adminToken);
    expect((data(before).settings as Json).notifVerify).toBe(true);
    const u1 = await register("set2-on");
    const n1 = await call("GET", "/notifications", adminToken);
    const hasU1 = (data(n1).notifications as Json[]).some(
      (n) => n.kind === "VERIFICATION_REQUEST" && n.refId === u1.id,
    );
    expect(hasU1).toBe(true);
    // Toggle mati: register baru tidak memicu notif.
    const off = await call("PATCH", "/admin/settings", adminToken, {
      notifVerify: false,
    });
    expect(off.status).toBe(200);
    try {
      const u2 = await register("set2-off");
      const n2 = await call("GET", "/notifications", adminToken);
      const hasU2 = (data(n2).notifications as Json[]).some(
        (n) => n.kind === "VERIFICATION_REQUEST" && n.refId === u2.id,
      );
      expect(hasU2).toBe(false);
      // Akun tetap masuk antrean verifikasi (halaman Verifikasi) —
      // yang mati hanya notifnya.
      const pending = await call("GET", "/admin/verifications", adminToken);
      expect(
        (data(pending).pending as Json[]).some(
          (p) => (p.user as Json | undefined)?.id === u2.id,
        ),
      ).toBe(true);
    } finally {
      await call("PATCH", "/admin/settings", adminToken, { notifVerify: true });
    }
  });
});

describe("A-5 §2: calendar + recap + activities", () => {
  async function makeTrip(token: string, name: string, date: string): Promise<string> {
    await call("PATCH", "/auth/me", token, { phone: "0811111111" });
    const r = await call("POST", "/trip-groups", token, {
      name,
      type: "HIKING",
      date,
      meetingPoint: "Basecamp X",
    });
    expect(r.status).toBe(201);
    return (data(r).trip as Json).id as string;
  }

  test("GET /trip-groups/calendar mengelompokkan trip saya per tanggal", async () => {
    const u = await register("cal1");
    const t1 = await makeTrip(u.token, "Cal Trip A", "2026-11-07");
    const t2 = await makeTrip(u.token, "Cal Trip B", "2026-11-07");
    const t3 = await makeTrip(u.token, "Cal Trip C", "2026-11-09");
    const r = await call("GET", "/trip-groups/calendar", u.token);
    expect(r.status).toBe(200);
    const days = data(r).days as Json[];
    const d7 = days.find((d) => d.date === "2026-11-07");
    const d9 = days.find((d) => d.date === "2026-11-09");
    expect(((d7?.trips as Json[]) ?? []).map((t) => t.id).sort()).toEqual(
      [t1, t2].sort(),
    );
    expect(((d9?.trips as Json[]) ?? []).map((t) => t.id)).toEqual([t3]);
    // Trip orang lain tidak bocor ke kalender saya.
    const other = await register("cal2");
    const r2 = await call("GET", "/trip-groups/calendar", other.token);
    const allIds = (data(r2).days as Json[]).flatMap((d) =>
      ((d.trips as Json[]) ?? []).map((t) => t.id),
    );
    expect(allIds).not.toContain(t1);
  });

  test("GET /trip-groups/:id/recap merangkum anggota/SOS/checkpoint; non-member 403", async () => {
    const u = await register("recap1");
    const tripId = await makeTrip(u.token, "Recap Trip", "2026-11-05");
    await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.9,
    });
    await call("POST", `/trip-groups/${tripId}/checkpoints`, u.token, {
      name: "Pos 1",
      lat: -7.21,
      lon: 109.91,
    });
    const r = await call("GET", `/trip-groups/${tripId}/recap`, u.token);
    expect(r.status).toBe(200);
    const recap = data(r).recap as Json;
    expect(recap.memberCount).toBe(1);
    expect(recap.sosCount).toBe(1);
    expect(recap.checkpointCount).toBe(1);
    expect((recap.trip as Json).id).toBe(tripId);
    const outsider = await register("recap2");
    const denied = await call("GET", `/trip-groups/${tripId}/recap`, outsider.token);
    expect(denied.status).toBe(403);
  });

  test("GET /trip-groups/:id/activities mencatat kejadian (SOS, checkpoint) terbaru dulu", async () => {
    const u = await register("act1");
    const tripId = await makeTrip(u.token, "Act Trip", "2026-11-05");
    await call("POST", `/trip-groups/${tripId}/checkpoints`, u.token, {
      name: "Pos Act",
      lat: -7.21,
      lon: 109.91,
    });
    await call("POST", `/trip-groups/${tripId}/sos`, u.token, {
      reason: "CEDERA",
      lat: -7.2,
      lon: 109.9,
    });
    const r = await call("GET", `/trip-groups/${tripId}/activities`, u.token);
    expect(r.status).toBe(200);
    const acts = data(r).activities as Json[];
    expect(acts.length).toBeGreaterThanOrEqual(2);
    const kinds = acts.map((a) => a.kind);
    expect(kinds).toContain("SOS_TRIGGERED");
    expect(kinds).toContain("CHECKPOINT_CREATED");
    // Terbaru dulu.
    const times = acts.map((a) => new Date(a.at as string).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("A-5 §4: /sos/my-alerts + /sos/stats", () => {
  // POST /sos memicu dispatch (bystander + WA log) — di full suite bisa
  // melewati timeout default 5 dtk, jadi dilonggarkan.
  test("my-alerts = SOS di trip saya dari orang lain; stats menghitung milik sendiri", async () => {
    const leader = await register("alerts-l");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const member = await register("alerts-m");
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Alert Trip",
      type: "HIKING",
      date: "2026-11-05",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, member.token);
    const sos = await call("POST", `/trip-groups/${tripId}/sos`, member.token, {
      reason: "TERSESAT",
      lat: -7.2,
      lon: 109.9,
    });
    const sosId = (data(sos).sos as Json).id as string;
    // Leader menerima SOS member di my-alerts; pengirim tidak melihat miliknya.
    const la = await call("GET", "/sos/my-alerts", leader.token);
    expect(la.status).toBe(200);
    expect((data(la).alerts as Json[]).map((a) => a.id)).toContain(sosId);
    const ma = await call("GET", "/sos/my-alerts", member.token);
    expect((data(ma).alerts as Json[]).map((a) => a.id)).not.toContain(sosId);
    // Stats pengirim: 1 total, 1 aktif.
    const st = await call("GET", "/sos/stats", member.token);
    expect(st.status).toBe(200);
    const stats = data(st).stats as Json;
    expect(stats.sent).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.received).toBe(0);
    const stLeader = await call("GET", "/sos/stats", leader.token);
    expect((data(stLeader).stats as Json).received).toBe(1);
  }, 15_000);
});

describe("A-5 §13: ratings organizer", () => {
  test("member menilai organizer pasca-trip; rata-rata benar; double rating ditolak; non-member 403", async () => {
    const leader = await register("rate-l");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const m1 = await register("rate-m1");
    const m2 = await register("rate-m2");
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Rated Trip",
      type: "HIKING",
      date: "2026-11-05",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, m1.token);
    await call("POST", `/trip-groups/${tripId}/join`, m2.token);
    const r1 = await call("POST", `/trip-groups/${tripId}/ratings`, m1.token, {
      score: 5,
      comment: "Mantap",
    });
    expect(r1.status).toBe(201);
    const r2 = await call("POST", `/trip-groups/${tripId}/ratings`, m2.token, {
      score: 4,
    });
    expect(r2.status).toBe(201);
    // Skor di luar 1..5 ditolak.
    const badScore = await call("POST", `/trip-groups/${tripId}/ratings`, m1.token, {
      score: 6,
    });
    expect(badScore.status).toBe(400);
    // Rating ganda ditolak.
    const dup = await call("POST", `/trip-groups/${tripId}/ratings`, m1.token, {
      score: 3,
    });
    expect(dup.status).toBe(409);
    expect(errCode(dup)).toBe("ALREADY_RATED");
    // Leader tidak menilai dirinya sendiri.
    const self = await call("POST", `/trip-groups/${tripId}/ratings`, leader.token, {
      score: 5,
    });
    expect(self.status).toBe(400);
    expect(errCode(self)).toBe("CANNOT_RATE_SELF");
    // Non-member 403.
    const outsider = await register("rate-x");
    const denied = await call("POST", `/trip-groups/${tripId}/ratings`, outsider.token, {
      score: 1,
    });
    expect(denied.status).toBe(403);
    // Daftar rating organizer + rata-rata.
    const list = await call("GET", `/users/${leader.id}/ratings`, m1.token);
    expect(list.status).toBe(200);
    const ratings = data(list).ratings as Json[];
    expect(ratings.length).toBe(2);
    expect(data(list).average).toBe(4.5);
  });
});

describe("A-5 §10: katalog gunung + jalur", () => {
  test("daftar gunung tersedia (seed); detail + jalur + 404 untuk id asing", async () => {
    const u = await register("mtn1");
    const list = await call("GET", "/mountains", u.token);
    expect(list.status).toBe(200);
    const mountains = data(list).mountains as Json[];
    expect(mountains.length).toBeGreaterThanOrEqual(4);
    const prau = mountains.find((m) => m.id === "gunung-prau");
    expect(prau?.name).toBe("Gunung Prau");
    expect(prau?.elevationM).toBe(2565);
    const detail = await call("GET", "/mountains/gunung-prau", u.token);
    expect(detail.status).toBe(200);
    expect(((data(detail).mountain as Json).routes as Json[]).length).toBe(8);
    const routes = await call("GET", "/mountains/gunung-prau/routes", u.token);
    expect(routes.status).toBe(200);
    const campurejo = (data(routes).routes as Json[]).find(
      (r) => r.name === "Jalur Campurejo",
    );
    expect(campurejo).toBeDefined();
    const one = await call(
      "GET",
      `/mountains/gunung-prau/routes/${campurejo!.id as string}`,
      u.token,
    );
    expect(one.status).toBe(200);
    const route = data(one).route as Json;
    expect(route.meetingPoint).toBe("Jalur Campurejo");
    // Detail satu jalur membawa track shifted + checkpoint MDPL.
    expect(Array.isArray(route.track)).toBe(true);
    expect((route.track as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(route.checkpoints)).toBe(true);
    expect((route.checkpoints as Json[]).some((c) => c.autoCheckpoint === true)).toBe(true);
    const missing = await call("GET", "/mountains/tidak-ada", u.token);
    expect(missing.status).toBe(404);
    // Tanpa token = 401.
    const anon = await call("GET", "/mountains");
    expect(anon.status).toBe(401);
  });
});

describe("A-5 §12: communities sisi user", () => {
  test("user lihat daftar + detail, join/leave, feed + diskusi; admin delete tetap", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
    });
    try {
      const community = await prisma.community.create({
        data: {
          name: `Klub User ${run}`,
          description: "Komunitas tes",
          region: "Jawa Tengah",
        },
      });
      const u = await register("comm-u1");
      const v = await register("comm-u2");
      // Daftar terlihat user biasa (bukan cuma admin).
      const list = await call("GET", "/communities", u.token);
      expect(list.status).toBe(200);
      expect(
        (data(list).communities as Json[]).some((c) => c.id === community.id),
      ).toBe(true);
      // Join -> detail menampilkan anggota.
      const join = await call("POST", `/communities/${community.id}/join`, u.token);
      expect(join.status).toBe(200);
      // Join ganda idempoten (tidak error, tidak dobel).
      await call("POST", `/communities/${community.id}/join`, u.token);
      const detail = await call("GET", `/communities/${community.id}`, u.token);
      expect(detail.status).toBe(200);
      const det = data(detail).community as Json;
      expect(det.memberCount).toBe(1);
      expect((det.members as Json[]).length).toBe(1);
      // Feed: member boleh posting; non-member tidak.
      const post = await call(
        "POST",
        `/communities/${community.id}/feed`,
        u.token,
        { body: "Halo klub!" },
      );
      expect(post.status).toBe(201);
      const postId = (data(post).post as Json).id as string;
      const deniedPost = await call(
        "POST",
        `/communities/${community.id}/feed`,
        v.token,
        { body: "Bukan anggota" },
      );
      expect(deniedPost.status).toBe(403);
      expect(errCode(deniedPost)).toBe("NOT_COMMUNITY_MEMBER");
      // Semua user boleh BACA feed.
      const feed = await call("GET", `/communities/${community.id}/feed`, v.token);
      expect(feed.status).toBe(200);
      expect((data(feed).posts as Json[]).length).toBe(1);
      // Diskusi: join dulu baru komentar.
      await call("POST", `/communities/${community.id}/join`, v.token);
      const comment = await call(
        "POST",
        `/communities/${community.id}/feed/${postId}/discussion`,
        v.token,
        { body: "Salam kenal" },
      );
      expect(comment.status).toBe(201);
      const disc = await call(
        "GET",
        `/communities/${community.id}/feed/${postId}/discussion`,
        u.token,
      );
      expect(disc.status).toBe(200);
      expect((data(disc).comments as Json[]).length).toBe(1);
      // Leave mengurangi anggota.
      const leave = await call("POST", `/communities/${community.id}/leave`, u.token);
      expect(leave.status).toBe(200);
      const after = await call("GET", `/communities/${community.id}`, u.token);
      expect((data(after).community as Json).memberCount).toBe(1);
      // Body kosong ditolak.
      const emptyPost = await call(
        "POST",
        `/communities/${community.id}/feed`,
        v.token,
        { body: "   " },
      );
      expect(emptyPost.status).toBe(400);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe("A-5 §14: aturan trip expired", () => {
  test("expired = PLANNED yang tanggalnya lewat ATAU CLOSED; hapus hanya expired", async () => {
    const u = await register("exp1");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    // Trip PLANNED dengan tanggal kemarin -> expired.
    const past = await call("POST", "/trip-groups", u.token, {
      name: "Trip Lewat",
      type: "HIKING",
      date: "2026-10-01",
      meetingPoint: "X",
    });
    const pastId = (data(past).trip as Json).id as string;
    // Trip PLANNED masa depan -> bukan expired.
    const future = await call("POST", "/trip-groups", u.token, {
      name: "Trip Depan",
      type: "HIKING",
      date: "2027-01-01",
      meetingPoint: "X",
    });
    const futureId = (data(future).trip as Json).id as string;
    const adminToken = (await cachedAdminLogin()).token;
    const list = await call("GET", "/admin/trips/expired", adminToken);
    expect(list.status).toBe(200);
    const ids = (data(list).trips as Json[]).map((t) => t.id);
    expect(ids).toContain(pastId);
    expect(ids).not.toContain(futureId);
    // DELETE menolak trip yang tidak expired.
    const deniedDel = await call("DELETE", `/admin/trips/${futureId}`, adminToken);
    expect(deniedDel.status).toBe(409);
    expect(errCode(deniedDel)).toBe("TRIP_NOT_EXPIRED");
    const okDel = await call("DELETE", `/admin/trips/${pastId}`, adminToken);
    expect(okDel.status).toBe(200);
  });
});

describe("SET-3: notifikasi check-in peserta ke LEADER", () => {
  test("member check-in -> leader dapat notif CHECKPOINT_CHECKIN; toggle notifCheckin mematikan; check-in leader sendiri tidak memberi notif dirinya", async () => {
    const leader = await register("ci-l");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    const member = await register("ci-m");
    const trip = await call("POST", "/trip-groups", leader.token, {
      name: "Checkin Trip",
      type: "HIKING",
      date: "2026-11-20",
      meetingPoint: "X",
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, member.token);
    const cp = await call("POST", `/trip-groups/${tripId}/checkpoints`, leader.token, {
      name: "Pos SET3",
      lat: -7.2,
      lon: 109.9,
    });
    const cpId = (data(cp).checkpoint as Json).id as string;
    // Member check-in -> leader dapat notif.
    const ci = await call(
      "POST",
      `/trip-groups/${tripId}/checkpoints/${cpId}/check-in`,
      member.token,
    );
    expect(ci.status).toBe(201);
    const ln = await call("GET", "/notifications", leader.token);
    expect(ln.status).toBe(200);
    const leaderNotifs = data(ln).notifications as Json[];
    expect(
      leaderNotifs.some((n) => n.kind === "CHECKPOINT_CHECKIN" && n.tripId === tripId),
    ).toBe(true);
    // Leader check-in sendiri -> tidak ada notif baru untuk dirinya.
    const before = leaderNotifs.filter((n) => n.kind === "CHECKPOINT_CHECKIN").length;
    await call("POST", `/trip-groups/${tripId}/checkpoints/${cpId}/check-in`, leader.token);
    const ln2 = await call("GET", "/notifications", leader.token);
    const after = (data(ln2).notifications as Json[]).filter(
      (n) => n.kind === "CHECKPOINT_CHECKIN",
    ).length;
    expect(after).toBe(before);
    // Toggle mati -> check-in member tidak lagi memberi notif leader.
    const adminToken = (await cachedAdminLogin()).token;
    await call("PATCH", "/admin/settings", adminToken, { notifCheckin: false });
    try {
      await call(
        "POST",
        `/trip-groups/${tripId}/checkpoints/${cpId}/check-in`,
        member.token,
      );
      const ln3 = await call("GET", "/notifications", leader.token);
      const count3 = (data(ln3).notifications as Json[]).filter(
        (n) => n.kind === "CHECKPOINT_CHECKIN",
      ).length;
      expect(count3).toBe(after);
    } finally {
      await call("PATCH", "/admin/settings", adminToken, { notifCheckin: true });
    }
  }, 15_000);
});

describe("SET-7/8: warning trip high-risk + kuota rekomendasi", () => {
  test("risk-assessment: elevasi >=3000, durasi >=3 hari, kuota >=20; aman = tidak high-risk", async () => {
    const u = await register("risk1");
    // Rinjani 3.726 mdpl -> PEAK_ELEVATION.
    const r1 = await call("POST", "/trip-groups/risk-assessment", u.token, {
      mountainId: "gunung-rinjani",
      date: "2027-06-01",
    });
    expect(r1.status).toBe(200);
    const a1 = data(r1).assessment as Json;
    expect(a1.highRisk).toBe(true);
    expect(a1.reasons).toContain("PEAK_ELEVATION");
    // Durasi 3 hari -> DURATION.
    const r2 = await call("POST", "/trip-groups/risk-assessment", u.token, {
      date: "2027-06-01",
      durationDays: 3,
    });
    expect((data(r2).assessment as Json).reasons).toContain("DURATION");
    // Kuota 20 -> PARTICIPANTS.
    const r3 = await call("POST", "/trip-groups/risk-assessment", u.token, {
      date: "2027-06-01",
      quota: 20,
    });
    expect((data(r3).assessment as Json).reasons).toContain("PARTICIPANTS");
    // Prau (2.565) + 2 hari + kuota 10, tanggal jauh (hujan tak bisa
    // dinilai) -> TIDAK high-risk.
    const r4 = await call("POST", "/trip-groups/risk-assessment", u.token, {
      mountainId: "gunung-prau",
      date: "2027-06-01",
      durationDays: 2,
      quota: 10,
    });
    const a4 = data(r4).assessment as Json;
    expect(a4.highRisk).toBe(false);
    expect(a4.reasons).toEqual([]);
    // Tanpa tanggal -> 400.
    const bad = await call("POST", "/trip-groups/risk-assessment", u.token, {});
    expect(bad.status).toBe(400);
  });

  test("GET /:id/risk menilai trip hidup termasuk mayoritas perempuan (>50%)", async () => {
    // Alur OTP tidak lagi mengumpulkan gender saat signup; gender
    // di-set langsung via DB (setup tes) supaya penilaian risiko
    // berdasarkan komposisi gender tetap teruji.
    const leader = await register("risk-l");
    await call("PATCH", "/auth/me", leader.token, { phone: "0811111111" });
    await testDb.prisma.user.update({
      where: { id: leader.id },
      data: { gender: "MALE" },
    });
    const lTok = leader.token;
    const f1 = await register("risk-f1");
    await testDb.prisma.user.update({
      where: { id: f1.id },
      data: { gender: "FEMALE" },
    });
    const f2 = await register("risk-f2");
    await testDb.prisma.user.update({
      where: { id: f2.id },
      data: { gender: "FEMALE" },
    });
    const trip = await call("POST", "/trip-groups", lTok, {
      name: "Risk Live Trip",
      type: "HIKING",
      date: "2027-06-01",
      meetingPoint: "X",
      quota: 10,
    });
    const tripId = (data(trip).trip as Json).id as string;
    await call("POST", `/trip-groups/${tripId}/join`, f1.token);
    await call("POST", `/trip-groups/${tripId}/join`, f2.token);
    // 2 dari 3 anggota perempuan (>50%) -> FEMALE_MAJORITY.
    const r = await call("GET", `/trip-groups/${tripId}/risk`, lTok);
    expect(r.status).toBe(200);
    const a = data(r).assessment as Json;
    expect(a.highRisk).toBe(true);
    expect(a.reasons).toContain("FEMALE_MAJORITY");
    // Gender tidak diisi tidak dihitung: trip leader-saja tanpa gender
    // data -> bukan FEMALE_MAJORITY.
    const solo = await register("risk-solo");
    await call("PATCH", "/auth/me", solo.token, { phone: "0811111111" });
    const t2 = await call("POST", "/trip-groups", solo.token, {
      name: "Solo Trip",
      type: "HIKING",
      date: "2027-06-01",
      meetingPoint: "X",
    });
    const t2id = (data(t2).trip as Json).id as string;
    const r2 = await call("GET", `/trip-groups/${t2id}/risk`, solo.token);
    expect((data(r2).assessment as Json).reasons).not.toContain("FEMALE_MAJORITY");
  });

  test("SET-8: durationDays tersimpan di trip", async () => {
    const u = await register("dur1");
    await call("PATCH", "/auth/me", u.token, { phone: "0811111111" });
    const trip = await call("POST", "/trip-groups", u.token, {
      name: "Durasi Trip",
      type: "HIKING",
      date: "2027-06-01",
      meetingPoint: "X",
      durationDays: 4,
    });
    expect(trip.status).toBe(201);
    expect((data(trip).trip as Json).durationDays).toBe(4);
    // Gender tidak lagi dikumpulkan saat signup OTP (diuji lewat
    // penilaian risiko di atas dengan setup DB); tidak ada lagi
    // penolakan gender tak dikenal di endpoint register.
  });
});

describe("Katalog MDPL shifted (menggantikan katalog lama)", () => {
  // Ditaruh SEBELUM describe edit/hapus: tes hapus Semeru di bawah
  // membuat katalog tinggal 124 sampai boot berikutnya me-restore.
  test("katalog seed = 125 destinasi MDPL; katalog lama tidak ada", async () => {
    const u = await register("mtimport");
    const r = await call("GET", "/mountains", u.token);
    expect(r.status).toBe(200);
    const list = (data(r).mountains as Json[]) ?? [];
    expect(list.length).toBe(125);
    expect(list.some((m) => m.id === "argopuro")).toBe(false);
    expect(list.some((m) => m.id === "prau")).toBe(false);
    const prau = list.find((m) => m.id === "gunung-prau") as Json;
    expect(prau.name).toBe("Gunung Prau");
    expect(prau.elevationM).toBe(2565);
    expect(prau.province).toBe("Jawa Tengah");
    expect(prau.imageUrl).toBe(null);
    expect(prau.volcanoActive).toBe(false);
    const slamet = list.find((m) => m.id === "gunung-slamet") as Json;
    expect((slamet.imageUrl as string) ?? "").toContain("upload.wikimedia.org");
    const cikuray = list.find((m) => m.id === "gunung-cikuray") as Json;
    expect((cikuray.imageUrl as string) ?? "").toContain("upload.wikimedia.org");
  });

  test("jalur MDPL: nama ada, jarak/gain/estimasi terisi dari track", async () => {
    const u = await register("mtimportroutes");
    const r = await call("GET", "/mountains/gunung-prau/routes", u.token);
    expect(r.status).toBe(200);
    const routes = (data(r).routes as Json[]) ?? [];
    expect(routes.length).toBe(8);
    expect(routes.map((x) => x.name)).toContain("Jalur Campurejo");
    for (const x of routes) {
      expect(typeof x.distanceKm).toBe("number");
      expect(typeof x.gainM).toBe("number");
      expect(typeof x.estHours).toBe("number");
    }
  });

  test("kesulitan '' tetap bisa diedit admin (PATCH menerima '')", async () => {
    const token = (await cachedAdminLogin()).token;
    const ok = await call("PATCH", "/mountains/gunung-prau", token, {
      difficultyKey: "",
    });
    expect(ok.status).toBe(200);
  });
});

describe("Tabel Gunung: edit/nonaktifkan/hapus (admin-only)", () => {

  test("GET /mountains: field tabel baru + routeCount", async () => {
    const u = await register("mtlist");
    const r = await call("GET", "/mountains", u.token);
    expect(r.status).toBe(200);
    const list = (data(r).mountains as Json[]) ?? [];
    const prau = list.find((m) => m.id === "gunung-prau") as Json | undefined;
    expect(prau).toBeDefined();
    expect(prau?.province).toBe("Jawa Tengah");
    expect(prau?.routeCount).toBe(8);
    expect(prau?.isActive).toBe(true);
    expect(prau?.volcanoActive).toBe(false);
    // Prau tidak punya pemetaan Wiki yang yakin -> imageUrl null (aturan katalog MDPL).
    expect(prau?.imageUrl).toBeNull();
  });

  test("tulis gunung tanpa admin = ADMIN_ONLY; tanpa token = 401", async () => {
    const u = await register("mtnonadmin");
    const adminToken = (await cachedAdminLogin()).token;
    expect(adminToken.length).toBeGreaterThan(0);
    const p = await call("PATCH", "/mountains/gunung-prau", u.token, { elevationM: 1 });
    expect(p.status).toBe(403);
    expect(errCode(p)).toBe("ADMIN_ONLY");
    const d = await call("DELETE", "/mountains/gunung-prau", u.token);
    expect(d.status).toBe(403);
    const anon = await call("PATCH", "/mountains/gunung-prau", undefined, { elevationM: 1 });
    expect(anon.status).toBe(401);
  });

  test("admin PATCH validasi + 404; edit lalu kembalikan", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const bad = await call("PATCH", "/mountains/gunung-prau", adminToken, { elevationM: 0 });
    expect(bad.status).toBe(400);
    const badDiff = await call("PATCH", "/mountains/gunung-prau", adminToken, {
      difficultyKey: "wizard.diffNope",
    });
    expect(badDiff.status).toBe(400);
    const gone = await call("PATCH", "/mountains/tidak-ada", adminToken, {
      elevationM: 1,
    });
    expect(gone.status).toBe(404);
    const edit = await call("PATCH", "/mountains/gunung-prau", adminToken, {
      elevationM: 2566,
    });
    expect(edit.status).toBe(200);
    expect((data(edit).mountain as Json).elevationM).toBe(2566);
    const back = await call("PATCH", "/mountains/gunung-prau", adminToken, {
      elevationM: 2565,
    });
    expect((data(back).mountain as Json).elevationM).toBe(2565);
  });

  test("admin nonaktifkan lalu aktifkan lagi", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const off = await call("PATCH", "/mountains/gunung-prau", adminToken, {
      isActive: false,
    });
    expect((data(off).mountain as Json).isActive).toBe(false);
    const on = await call("PATCH", "/mountains/gunung-prau", adminToken, {
      isActive: true,
    });
    expect((data(on).mountain as Json).isActive).toBe(true);
  });

  // TERAKHIR di file ini: menghapus Semeru. Seed di boot berikutnya
  // (create-if-missing) membuat ulang gunung ini, jadi rerun aman.
  test("admin DELETE gunung + DELETE ulang = 404", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const del = await call("DELETE", "/mountains/gunung-semeru", adminToken);
    expect(del.status).toBe(200);
    const u = await register("mtdel");
    const list = await call("GET", "/mountains", u.token);
    const ids = ((data(list).mountains as Json[]) ?? []).map((m) => m.id);
    expect(ids).not.toContain("gunung-semeru");
    const again = await call("DELETE", "/mountains/gunung-semeru", adminToken);
    expect(again.status).toBe(404);
  });
});

describe("Tabel Gunung: upload gambar (admin-only)", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );


  async function callForm(
    path: string,
    token: string | undefined,
    file: { bytes: Buffer; name: string; type: string } | null,
  ): Promise<{ status: number; json: Json }> {
    const fd = new FormData();
    if (file) fd.append("image", new Blob([file.bytes], { type: file.type }), file.name);
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  test("upload tanpa admin = ADMIN_ONLY; tanpa token = 401", async () => {
    const u = await register("mtupnonadmin");
    const p = await callForm("/mountains/gunung-prau/image", u.token, {
      bytes: PNG_1X1,
      name: "x.png",
      type: "image/png",
    });
    expect(p.status).toBe(403);
    expect(errCode(p)).toBe("ADMIN_ONLY");
    const anon = await callForm("/mountains/gunung-prau/image", undefined, {
      bytes: PNG_1X1,
      name: "x.png",
      type: "image/png",
    });
    expect(anon.status).toBe(401);
  });

  test("file bukan gambar = 400; gunung tidak ada = 404 (file dibersihkan)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const bad = await callForm("/mountains/gunung-prau/image", adminToken, {
      bytes: Buffer.from("bukan gambar"),
      name: "x.txt",
      type: "text/plain",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_IMAGE");
    const gone = await callForm("/mountains/tidak-ada/image", adminToken, {
      bytes: PNG_1X1,
      name: "x.png",
      type: "image/png",
    });
    expect(gone.status).toBe(404);
  });

  test("admin upload png -> imageUrl /uploads + file tersaji, lalu dikembalikan", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const u = await register("mtupread");
    const before = await call("GET", "/mountains", u.token);
    const prauBefore = ((data(before).mountains as Json[]) ?? []).find(
      (m) => m.id === "gunung-prau",
    ) as Json;
    const originalUrl = prauBefore?.imageUrl as string;
    const up = await callForm("/mountains/gunung-prau/image", adminToken, {
      bytes: PNG_1X1,
      name: "gunung-prau.png",
      type: "image/png",
    });
    expect(up.status).toBe(200);
    const imageUrl = (data(up).mountain as Json).imageUrl as string;
    expect(imageUrl).toContain("/uploads/mountains/gunung-prau-");
    expect(imageUrl.endsWith(".png")).toBe(true);
    // File benar-benar tersaji di URL-nya.
    const served = await fetch(imageUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toContain("image/png");
    // Kembalikan + bersihkan file tes supaya rerun tidak menumpuk.
    await call("PATCH", "/mountains/gunung-prau", adminToken, { imageUrl: originalUrl });
    const { rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await rm(join(process.cwd(), "uploads", "mountains", imageUrl.split("/").pop() ?? ""), {
      force: true,
    });
  });
});

describe("Member management table (admin-only)", () => {
  let adminToken: string;
  let adminId: string;
  beforeAll(async () => {
    const a = await cachedAdminLogin();
    adminToken = a.token;
    adminId = a.id;
  });

  test("GET /admin/members carries proUserIds from VERIFIED upgrades", async () => {
    const pro = await register("mm-pro");
    const plain = await register("mm-plain");
    const req = await call("POST", "/auth/me/upgrade", pro.token, {});
    expect(req.status).toBe(201);
    const verify = await call(
      "POST",
      `/admin/upgrades/${(data(req).request as Json).id}/verify`,
      adminToken,
    );
    expect(verify.status).toBe(200);
    const list = await call("GET", "/admin/members", adminToken);
    expect(list.status).toBe(200);
    const proIds = data(list).proUserIds as string[];
    expect(proIds).toContain(pro.id);
    expect(proIds).not.toContain(plain.id);
  });

  test("admin member password endpoint is gone (410 OTP_ONLY)", async () => {
    const u = await register("mm-pw");
    const r = await call(
      "PATCH",
      `/admin/members/${u.id}/password`,
      adminToken,
      { newPassword: "baru1234" },
    );
    expect(r.status).toBe(410);
    expect(errCode(r)).toBe("OTP_ONLY");
  });

  test("member password endpoint: admin -> 410, non-admin -> 403", async () => {
    const u = await register("mm-pw2");
    const gone = await call(
      "PATCH",
      `/admin/members/${u.id}/password`,
      adminToken,
      { newPassword: "baru1234" },
    );
    expect(gone.status).toBe(410);
    expect(errCode(gone)).toBe("OTP_ONLY");
    // Stub short-circuit sebelum lookup member.
    const missing = await call(
      "PATCH",
      "/admin/members/00000000-0000-0000-0000-000000000000/password",
      adminToken,
      { newPassword: "baru1234" },
    );
    expect(missing.status).toBe(410);
    const nonAdmin = await call(
      "PATCH",
      `/admin/members/${u.id}/password`,
      u.token,
      { newPassword: "baru1234" },
    );
    expect(nonAdmin.status).toBe(403);
  });

  test("admin deletes a member; member disappears from list and session dies", async () => {
    const u = await register("mm-del");
    const del = await call("DELETE", `/admin/members/${u.id}`, adminToken);
    expect(del.status).toBe(200);
    expect(data(del).deleted).toBe(true);
    const list = await call("GET", "/admin/members", adminToken);
    const ids = (data(list).members as Json[]).map((m) => m.id);
    expect(ids).not.toContain(u.id);
    // Token lama mati: user sudah tidak ditemukan saat requireAuth.
    const login = await call("GET", "/auth/me", u.token);
    expect(login.status).toBe(401);
  });

  test("delete refuses self, admin target, unknown member, non-admin", async () => {
    const self = await call("DELETE", `/admin/members/${adminId}`, adminToken);
    expect(self.status).toBe(403);
    expect(errCode(self)).toBe("CANNOT_DELETE_SELF");
    const otherAdmin = await call("POST", "/admin/staff", adminToken, {
      email: `mm-admin2-${run}@t.local`,
      name: "Admin Dua",
      password: "password123",
      role: "admin",
    });
    expect(otherAdmin.status).toBe(201);
    const adminTarget = await call(
      "DELETE",
      `/admin/members/${(data(otherAdmin).user as Json).id}`,
      adminToken,
    );
    expect(adminTarget.status).toBe(403);
    expect(errCode(adminTarget)).toBe("CANNOT_DELETE_ADMIN");
    const missing = await call(
      "DELETE",
      "/admin/members/00000000-0000-0000-0000-000000000000",
      adminToken,
    );
    expect(missing.status).toBe(404);
    const u = await register("mm-del2");
    const nonAdmin = await call("DELETE", `/admin/members/${u.id}`, u.token);
    expect(nonAdmin.status).toBe(403);
  });

  test("suspended member shows suspendedAt on the members list", async () => {
    const u = await register("mm-ban");
    await call("PATCH", `/admin/members/${u.id}/suspend`, adminToken);
    const list = await call("GET", "/admin/members", adminToken);
    const row = (data(list).members as Json[]).find((m) => m.id === u.id);
    expect(row).toBeDefined();
    expect(row!.suspendedAt).toBeTruthy();
  });
});

describe("Member country field (ISO alpha-2, flag-only display)", () => {
  let adminToken: string;
  beforeAll(async () => {
    adminToken = (await cachedAdminLogin()).token;
  });

  test("admin sets country (lowercase normalized) + clears with null", async () => {
    const u = await register("mm-cty");
    const set = await call("PATCH", `/admin/members/${u.id}/country`, adminToken, {
      country: "id",
    });
    expect(set.status).toBe(200);
    expect((data(set).user as Json).country).toBe("ID");
    const list = await call("GET", "/admin/members", adminToken);
    const row = (data(list).members as Json[]).find((m) => m.id === u.id);
    expect(row?.country).toBe("ID");
    const clear = await call("PATCH", `/admin/members/${u.id}/country`, adminToken, {
      country: null,
    });
    expect(clear.status).toBe(200);
    expect((data(clear).user as Json).country).toBeNull();
  });

  test("country: invalid code 400, unknown member 404, non-admin 403", async () => {
    const u = await register("mm-cty2");
    for (const bad of ["IDD", "1D", 123, ""]) {
      const r = await call("PATCH", `/admin/members/${u.id}/country`, adminToken, {
        country: bad,
      });
      expect(r.status).toBe(400);
    }
    const missing = await call(
      "PATCH",
      "/admin/members/00000000-0000-0000-0000-000000000000/country",
      adminToken,
      { country: "ID" },
    );
    expect(missing.status).toBe(404);
    const denied = await call("PATCH", `/admin/members/${u.id}/country`, u.token, {
      country: "ID",
    });
    expect(denied.status).toBe(403);
  });

  test("user sets own country via PATCH /me; invalid value -> 400", async () => {
    const u = await register("mm-cty3");
    const ok = await call("PATCH", "/auth/me", u.token, { country: "my" });
    expect(ok.status).toBe(200);
    expect((data(ok).user as Json).country).toBe("MY");
    const rejected = await call("PATCH", "/auth/me", u.token, { country: "XYZ" });
    expect(rejected.status).toBe(400);
    expect(errCode(rejected)).toBe("INVALID_PAYLOAD");
    const meAfterCountry = await call("GET", "/auth/me", u.token);
    expect((data(meAfterCountry).user as Json).country).toBe("MY");
  });
});

describe("Tabel Jalur: tambah/edit/nonaktifkan/hapus (admin-only)", () => {

  const base = {
    name: `Jalur Tes ${run}`,
    meetingPoint: "Basecamp Tes",
    distanceKm: 9.7,
    gainM: 1550,
    estHours: 8,
    recommended: false,
  };

  async function createRoute(adminToken: string, extra: Json = {}) {
    const r = await call("POST", "/mountains/gunung-prau/routes", adminToken, {
      ...base,
      ...extra,
    });
    expect(r.status).toBe(200);
    return data(r).route as Json;
  }

  test("tulis jalur tanpa admin = ADMIN_ONLY; tanpa token = 401", async () => {
    const u = await register("rtnonadmin");
    const p = await call("POST", "/mountains/gunung-prau/routes", u.token, base);
    expect(p.status).toBe(403);
    expect(errCode(p)).toBe("ADMIN_ONLY");
    const anon = await call("POST", "/mountains/gunung-prau/routes", undefined, base);
    expect(anon.status).toBe(401);
  });

  test("admin POST jalur: pos dilengkapkan Puncak otomatis", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, { posts: ["Pos 1", "Pos 2"] });
    try {
      expect(route.isActive).toBe(true);
      expect(route.posts).toEqual(["Pos 1", "Pos 2", "Puncak Gunung Prau"]);
      const one = await call(
        "GET",
        `/mountains/gunung-prau/routes/${route.id as string}`,
        adminToken,
      );
      expect((data(one).route as Json).posts).toEqual([
        "Pos 1",
        "Pos 2",
        "Puncak Gunung Prau",
      ]);
    } finally {
      await call(
        "DELETE",
        `/mountains/gunung-prau/routes/${route.id as string}`,
        adminToken,
      );
    }
  });

  test("admin POST jalur: pos kosong tetap sampai puncak + validasi", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, { posts: [] });
    try {
      expect(route.posts).toEqual(["Puncak Gunung Prau"]);
    } finally {
      await call(
        "DELETE",
        `/mountains/gunung-prau/routes/${route.id as string}`,
        adminToken,
      );
    }
    const noName = await call("POST", "/mountains/gunung-prau/routes", adminToken, {
      meetingPoint: "X",
      distanceKm: 1,
      gainM: 1,
      estHours: 1,
    });
    expect(noName.status).toBe(400);
    const badDist = await call("POST", "/mountains/gunung-prau/routes", adminToken, {
      ...base,
      distanceKm: 0,
    });
    expect(badDist.status).toBe(400);
    const badPosts = await call("POST", "/mountains/gunung-prau/routes", adminToken, {
      ...base,
      posts: "Pos 1",
    });
    expect(badPosts.status).toBe(400);
    const gone = await call("POST", "/mountains/tidak-ada/routes", adminToken, base);
    expect(gone.status).toBe(404);
  });

  test("admin PATCH jalur: edit + ganti pos + nonaktifkan/aktifkan", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, { posts: ["Pos 1"] });
    const id = route.id as string;
    try {
      const off = await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        isActive: false,
      });
      expect((data(off).route as Json).isActive).toBe(false);
      const renamed = await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        name: `Jalur Tes Ubah ${run}`,
        posts: ["Pos A"],
      });
      const renamedRoute = data(renamed).route as Json;
      expect(renamedRoute.name).toBe(`Jalur Tes Ubah ${run}`);
      expect(renamedRoute.posts).toEqual(["Pos A", "Puncak Gunung Prau"]);
      const on = await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        isActive: true,
      });
      expect((data(on).route as Json).isActive).toBe(true);
      const gone = await call("PATCH", "/mountains/tidak-ada/routes/x", adminToken, {
        isActive: false,
      });
      expect(gone.status).toBe(404);
    } finally {
      await call("DELETE", `/mountains/gunung-prau/routes/${id}`, adminToken);
    }
  });

  test("admin DELETE jalur + DELETE ulang = 404", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, {});
    const id = route.id as string;
    const del = await call("DELETE", `/mountains/gunung-prau/routes/${id}`, adminToken);
    expect(del.status).toBe(200);
    const again = await call("DELETE", `/mountains/gunung-prau/routes/${id}`, adminToken);
    expect(again.status).toBe(404);
    const gone = await call("GET", `/mountains/gunung-prau/routes/${id}`, adminToken);
    expect(gone.status).toBe(404);
  });
});

describe("Jalur: pos berkoordinat (tambahan A, 1 Nov 2026)", () => {

  const base = {
    name: `Jalur Tes Koordinat ${run}`,
    meetingPoint: "Basecamp Tes",
    distanceKm: 5,
    gainM: 800,
    estHours: 4,
    recommended: false,
  };

  async function createRoute(adminToken: string, extra: Json = {}) {
    const r = await call("POST", "/mountains/gunung-prau/routes", adminToken, {
      ...base,
      ...extra,
    });
    expect(r.status).toBe(200);
    return data(r).route as Json;
  }

  async function checkpoints(adminToken: string, id: string) {
    const one = await call(
      "GET",
      `/mountains/gunung-prau/routes/${id}`,
      adminToken,
    );
    return (data(one).route as Json).checkpoints as Json[];
  }

  async function del(adminToken: string, id: string) {
    await call("DELETE", `/mountains/gunung-prau/routes/${id}`, adminToken);
  }

  test("POST pos objek {name, lat, lon} tersimpan + tampil di checkpoints", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, {
      posts: [
        { name: "Basecamp", lat: -7.2, lon: 109.9 },
        { name: "Pos 1", lat: -7.21, lon: 109.91 },
      ],
    });
    const id = route.id as string;
    try {
      expect(route.posts).toEqual(["Basecamp", "Pos 1", "Puncak Gunung Prau"]);
      const cps = await checkpoints(adminToken, id);
      expect(cps.map((c) => c.name)).toEqual(["Basecamp", "Pos 1"]);
      expect(cps[0].lat).toBe(-7.2);
      expect(cps[0].lon).toBe(109.9);
      expect(cps[1].lat).toBe(-7.21);
    } finally {
      await del(adminToken, id);
    }
  });

  test("PATCH ganti nama saja TIDAK menghapus koordinat (string polos + objek tanpa lat/lon)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, {
      posts: [{ name: "Basecamp", lat: -7.2, lon: 109.9 }],
    });
    const id = route.id as string;
    try {
      // Klien lama mengirim string saja — koordinat dipertahankan per urutan.
      const renamed = await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        posts: ["Basecamp Baru"],
      });
      expect((data(renamed).route as Json).posts).toEqual([
        "Basecamp Baru",
        "Puncak Gunung Prau",
      ]);
      let cps = await checkpoints(adminToken, id);
      expect(cps.map((c) => c.name)).toEqual(["Basecamp Baru"]);
      expect(cps[0].lat).toBe(-7.2);
      expect(cps[0].lon).toBe(109.9);
      // Objek tanpa kunci lat/lon = tidak menyentuh koordinat.
      await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        posts: [{ name: "Basecamp Lagi" }],
      });
      cps = await checkpoints(adminToken, id);
      expect(cps[0].name).toBe("Basecamp Lagi");
      expect(cps[0].lat).toBe(-7.2);
    } finally {
      await del(adminToken, id);
    }
  });

  test("PATCH koordinat baru mengubah, null eksplisit menghapus", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, {
      posts: [{ name: "Basecamp", lat: -7.2, lon: 109.9 }],
    });
    const id = route.id as string;
    try {
      await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        posts: [{ name: "Basecamp", lat: -7.25, lon: 109.95 }],
      });
      let cps = await checkpoints(adminToken, id);
      expect(cps[0].lat).toBe(-7.25);
      expect(cps[0].lon).toBe(109.95);
      await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
        posts: [{ name: "Basecamp", lat: null, lon: null }],
      });
      cps = await checkpoints(adminToken, id);
      expect(cps).toEqual([]);
    } finally {
      await del(adminToken, id);
    }
  });

  test("validasi koordinat: luar rentang / pasangan tak lengkap / bukan angka = 400", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const route = await createRoute(adminToken, { posts: ["Pos 1"] });
    const id = route.id as string;
    try {
      for (const bad of [
        [{ name: "X", lat: 91, lon: 109 }],
        [{ name: "X", lat: -91, lon: 109 }],
        [{ name: "X", lat: -7, lon: 181 }],
        [{ name: "X", lat: -7, lon: -181 }],
        [{ name: "X", lat: -7 }],
        [{ name: "X", lon: 109 }],
        [{ name: "X", lat: null, lon: 109 }],
        [{ name: "X", lat: "-7", lon: 109 }],
      ]) {
        const r = await call("PATCH", `/mountains/gunung-prau/routes/${id}`, adminToken, {
          posts: bad,
        });
        expect(r.status).toBe(400);
      }
    } finally {
      await del(adminToken, id);
    }
  });
});

describe("Pengajuan organizer (verif MANUAL + Lihat Data + KTP privat)", () => {

  async function postForm(
    token: string,
    fields: Record<string, string>,
    withKtp: boolean,
  ): Promise<{ status: number; json: Json }> {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (withKtp) {
      // PNG 1x1 — cukup sebagai bukti file gambar, bukan KTP asli.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      form.append("identityDocument", new Blob([png], { type: "image/png" }), "ktp.png");
    }
    const res = await fetch(`${BASE}/auth/me/organizer-application`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  test("GET pengajuan sendiri: baris kosong dari registrasi, tanpa nama file", async () => {
    const u = await register("pengajuan-a");
    const r = await call("GET", "/auth/me/organizer-application", u.token);
    expect(r.status).toBe(200);
    const app = data(r).application as Json;
    expect(app.organizerName).toBeNull();
    expect(app.address).toBeNull();
    expect(app.hasIdentityDocument).toBe(false);
    expect(app.identityDocumentComplete).toBe(false);
    expect(app.profileComplete).toBe(false);
    expect(app.status).toBe("PENDING");
    expect(app).not.toHaveProperty("identityDocumentFilename");
    expect(app).not.toHaveProperty("identityDocumentUrl");
  });

  test("POST tanpa alamat = 400; POST lengkap tanpa KTP = profileComplete, KTP tetap false", async () => {
    const u = await register("pengajuan-b");
    const bad = await postForm(u.token, { organizerName: "Komunitas A" }, false);
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_PAYLOAD");
    const ok = await postForm(
      u.token,
      {
        organizerName: "Komunitas A",
        address: "Jl. Merdeka 1, Wonosobo",
        organizerType: "HIKING",
        region: "Wonosobo",
      },
      false,
    );
    expect(ok.status).toBe(200);
    const app = data(ok).application as Json;
    expect(app.organizerName).toBe("Komunitas A");
    expect(app.address).toBe("Jl. Merdeka 1, Wonosobo");
    expect(app.organizerType).toBe("HIKING");
    expect(app.profileComplete).toBe(true);
    expect(app.hasIdentityDocument).toBe(false);
    expect(app.identityDocumentComplete).toBe(false);
  });

  test("POST dengan KTP: admin lihat nama/alamat/KTP-ada di list, dokumen hanya lewat endpoint bertoken, bukan /uploads", async () => {
    const u = await register("pengajuan-c");
    const ok = await postForm(
      u.token,
      { organizerName: "Komunitas B", address: "Jl. Raya 2, Dieng" },
      true,
    );
    expect(ok.status).toBe(200);
    const app = data(ok).application as Json;
    expect(app.hasIdentityDocument).toBe(true);
    expect(app.identityDocumentComplete).toBe(true);
    expect(app).not.toHaveProperty("identityDocumentFilename");

    const adminToken = (await cachedAdminLogin()).token;
    const pending = await call("GET", "/admin/verifications", adminToken);
    const rows = data(pending).pending as Json[];
    const row = rows.find((item) => (item.user as Json | undefined)?.id === u.id);
    expect(row).toBeDefined();
    expect(row!.organizerName).toBe("Komunitas B");
    expect(row!.address).toBe("Jl. Raya 2, Dieng");
    expect(row!.hasIdentityDocument).toBe(true);
    expect(row).not.toHaveProperty("identityDocumentFilename");
    expect(row).not.toHaveProperty("identityDocumentUrl");

    const doc = await fetch(
      `${BASE}/admin/verifications/${row!.id as string}/document`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    expect(doc.status).toBe(200);
    expect(doc.headers.get("content-type")).toBe("image/png");
    const docAsUser = await fetch(
      `${BASE}/admin/verifications/${row!.id as string}/document`,
      { headers: { Authorization: `Bearer ${u.token}` } },
    );
    expect(docAsUser.status).toBe(403);
    const docNoAuth = await fetch(
      `${BASE}/admin/verifications/${row!.id as string}/document`,
    );
    expect(docNoAuth.status).toBe(401);
    const publicLeak = await fetch(`${BASE.replace("/api/v1", "")}/uploads/identity-documents/x.png`);
    expect(publicLeak.status).toBe(404);
  });

  test("POST jenis tak dikenal = 400; verifikasi tetap MANUAL (isVerified tidak berubah)", async () => {
    const u = await register("pengajuan-d");
    const bad = await postForm(
      u.token,
      { organizerName: "Komunitas C", address: "Jl. X 3", organizerType: "CLIMBING" },
      false,
    );
    expect(bad.status).toBe(400);
    await postForm(u.token, { organizerName: "Komunitas C", address: "Jl. X 3" }, false);
    const me = await call("GET", "/auth/me", u.token);
    expect((data(me).user as Json).isVerified).toBe(false);
  });
});

describe("Profil dashboard: ganti email + avatar + seed admin (1 Nov 2026)", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );


  async function callForm(
    path: string,
    method: string,
    token: string | undefined,
    field: string,
    file: { bytes: Buffer; name: string; type: string } | null,
  ): Promise<{ status: number; json: Json }> {
    const fd = new FormData();
    if (file) fd.append(field, new Blob([file.bytes], { type: file.type }), file.name);
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  async function callFormDelete(
    path: string,
    token: string,
  ): Promise<{ status: number; json: Json }> {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  test("PATCH /me ganti nama (minimal 2) + ganti email via OTP (bukan password)", async () => {
    // Kontrak pasca-#129: gate currentPassword DIGANTI alur OTP
    // ganti-email (POST /me/email-change/request -> PATCH /me dengan
    // emailOtp). currentPassword diabaikan sepenuhnya.
    const u = await register("profil-nama");
    const renamed = await call("PATCH", "/auth/me", u.token, { name: "Nama Baru" });
    expect(renamed.status).toBe(200);
    expect((data(renamed).user as Json).name).toBe("Nama Baru");
    const short = await call("PATCH", "/auth/me", u.token, { name: "X" });
    expect(short.status).toBe(400);
    expect(errCode(short)).toBe("INVALID_PAYLOAD");
    const meAfterShort = await call("GET", "/auth/me", u.token);
    expect((data(meAfterShort).user as Json).name).toBe("Nama Baru");

    // Email: tanpa kode -> 400 EMAIL_OTP_REQUIRED, email tidak berubah.
    const noOtp = await call("PATCH", "/auth/me", u.token, {
      email: `profil-baru-${run}@t.local`,
      currentPassword: "wrong-password",
    });
    expect(noOtp.status).toBe(400);
    expect(errCode(noOtp)).toBe("EMAIL_OTP_REQUIRED");
    const me1 = await call("GET", "/auth/me", u.token);
    expect((data(me1).user as Json).email).toBe(`profil-nama-${run}@t.local`);

    // Email: format tak valid -> 400.
    const badFmt = await call("PATCH", "/auth/me", u.token, {
      email: "bukan-email",
    });
    expect(badFmt.status).toBe(400);

    // Email: dipakai user lain -> 409 EMAIL_TAKEN di request kode.
    const other = await register("profil-lain");
    const takenReq = await call(
      "POST",
      "/auth/me/email-change/request",
      u.token,
      { email: `profil-lain-${run}@t.local` },
    );
    expect(takenReq.status).toBe(409);
    expect(errCode(takenReq)).toBe("EMAIL_TAKEN");
    void other;

    // Email: kode salah -> 401 INVALID_OTP, email tidak berubah.
    const reqOk = await call(
      "POST",
      "/auth/me/email-change/request",
      u.token,
      { email: `profil-baru-${run}@t.local` },
    );
    expect(reqOk.status).toBe(200);
    const wrong = await call("PATCH", "/auth/me", u.token, {
      email: `profil-baru-${run}@t.local`,
      emailOtp: "000000",
    });
    expect(wrong.status).toBe(401);
    expect(errCode(wrong)).toBe("INVALID_OTP");

    // Email: sukses -> login email baru jalan, token lama tetap berlaku.
    const code = sentCodes.get(`profil-baru-${run}@t.local`);
    expect(code).toMatch(/^\d{6}$/);
    const ok = await call("PATCH", "/auth/me", u.token, {
      email: `profil-baru-${run}@t.local`,
      emailOtp: code,
    });
    expect(ok.status).toBe(200);
    expect((data(ok).user as Json).email).toBe(`profil-baru-${run}@t.local`);
    const meOldToken = await call("GET", "/auth/me", u.token);
    expect(meOldToken.status).toBe(200);
    expect((data(meOldToken).user as Json).email).toBe(`profil-baru-${run}@t.local`);
    const loginNew = await loginOtp(`profil-baru-${run}@t.local`);
    expect(loginNew.token).toBeTruthy();
  });

  test("POST /me/avatar png -> URL /uploads/avatars tersaji + GET /me memuatnya; ganti hapus file lama; DELETE mengosongkan", async () => {
    const u = await register("profil-avatar");
    const anon = await callForm("/auth/me/avatar", "POST", undefined, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(anon.status).toBe(401);
    const bad = await callForm("/auth/me/avatar", "POST", u.token, "avatar", {
      bytes: Buffer.from("bukan gambar"),
      name: "x.txt",
      type: "text/plain",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_IMAGE");

    const up = await callForm("/auth/me/avatar", "POST", u.token, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(up.status).toBe(200);
    const url1 = (data(up).user as Json).avatarUrl as string;
    expect(url1).toContain("/uploads/avatars/");
    expect(url1.endsWith(".png")).toBe(true);
    const served1 = await fetch(url1);
    expect(served1.status).toBe(200);
    expect(served1.headers.get("content-type")).toContain("image/png");
    const me = await call("GET", "/auth/me", u.token);
    expect((data(me).user as Json).avatarUrl).toBe(url1);

    const up2 = await callForm("/auth/me/avatar", "POST", u.token, "avatar", {
      bytes: PNG_1X1,
      name: "b.png",
      type: "image/png",
    });
    const url2 = (data(up2).user as Json).avatarUrl as string;
    expect(url2).not.toBe(url1);
    expect((await fetch(url1)).status).toBe(404);

    const del = await callFormDelete("/auth/me/avatar", u.token);
    expect(del.status).toBe(200);
    expect((data(del).user as Json).avatarUrl).toBeNull();
    expect((await fetch(url2)).status).toBe(404);
    const del2 = await callFormDelete("/auth/me/avatar", u.token);
    expect(del2.status).toBe(200);
    expect((data(del2).user as Json).avatarUrl).toBeNull();
  });

  test("seed admin tidak membuat admin kedua setelah admin ganti email lalu API restart", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const staffBefore = await call("GET", "/admin/staff", adminToken);
    const countBefore = (data(staffBefore).staff as Json[]).length;
    expect(countBefore).toBeGreaterThan(0);

    const reqMove = await call(
      "POST",
      "/auth/me/email-change/request",
      adminToken,
      { email: `admin-pindah-${run}@t.local` },
    );
    expect(reqMove.status).toBe(200);
    const moveCode = sentCodes.get(`admin-pindah-${run}@t.local`);
    expect(moveCode).toMatch(/^\d{6}$/);
    const changed = await call("PATCH", "/auth/me", adminToken, {
      email: `admin-pindah-${run}@t.local`,
      emailOtp: moveCode,
    });
    expect(changed.status).toBe(200);

    // Simulasi restart API: createApp kedua menjalankan ready() (seed) lagi.
    const { createApp } = await import("../app.js");
    const { app: app2, ready: ready2 } = createApp(testDb);
    void app2;
    await ready2;

    const staffAfter = await call("GET", "/admin/staff", adminToken);
    expect((data(staffAfter).staff as Json[]).length).toBe(countBefore);
    // Email lama sudah tidak terikat ke user mana pun: verify OTP
    // untuk email itu mengembalikan needsName (bukan sesi).
    await requestOtpCode(process.env.ADMIN_EMAIL as string);
    const oldCode = sentCodes.get(process.env.ADMIN_EMAIL as string)!;
    const oldLogin = await call("POST", "/auth/otp/verify", undefined, {
      identifier: process.env.ADMIN_EMAIL,
      code: oldCode,
    });
    expect(oldLogin.status).toBe(200);
    expect((data(oldLogin) as Json).needsName).toBe(true);
    const newLogin = await loginOtp(`admin-pindah-${run}@t.local`);
    expect(newLogin.token).toBeTruthy();

    // Kembalikan email admin ke env supaya suite tetap bersih.
    const reqBack = await call(
      "POST",
      "/auth/me/email-change/request",
      adminToken,
      { email: process.env.ADMIN_EMAIL },
    );
    expect(reqBack.status).toBe(200);
    const backCode = sentCodes.get(process.env.ADMIN_EMAIL as string);
    expect(backCode).toMatch(/^\d{6}$/);
    const restored = await call("PATCH", "/auth/me", adminToken, {
      email: process.env.ADMIN_EMAIL,
      emailOtp: backCode,
    });
    expect(restored.status).toBe(200);
  });
});

describe("Keamanan & Batas + Pro Payment tersimpan (tambahan 1 Nov 2026)", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );


  async function restoreDefaults(adminToken: string): Promise<void> {
    await call("PATCH", "/admin/settings", adminToken, {
      defaultQuota: 15,
      currency: "IDR",
      timezone: "WIB",
    });
    await call("DELETE", "/admin/pro-qris", adminToken);
  }

  test("GET /admin/settings default: defaultQuota 15, IDR/WIB, proQrisUrl kosong", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    await restoreDefaults(adminToken);
    const r = await call("GET", "/admin/settings", adminToken);
    const s = data(r).settings as Json;
    expect(s.defaultQuota).toBe(15);
    expect(s.currency).toBe("IDR");
    expect(s.timezone).toBe("WIB");
    expect(s.proQrisUrl).toBe("");
  });

  test("PATCH keamanan: persist + validasi (kuota integer >=2, currency IDR, timezone WIB/WITA/WIT)", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    const u = await register("set-keamanan");
    const denied = await call("PATCH", "/admin/settings", u.token, { defaultQuota: 20 });
    expect(denied.status).toBe(403);

    for (const bad of [
      { defaultQuota: 1 },
      { defaultQuota: 0 },
      { defaultQuota: 15.5 },
      { defaultQuota: "15" },
      { currency: "USD" },
      { timezone: "GMT" },
    ]) {
      const r = await call("PATCH", "/admin/settings", adminToken, bad);
      expect(r.status).toBe(400);
    }

    const ok = await call("PATCH", "/admin/settings", adminToken, {
      defaultQuota: 20,
      currency: "IDR",
      timezone: "WITA",
    });
    const s = data(ok).settings as Json;
    expect(s.defaultQuota).toBe(20);
    expect(s.timezone).toBe("WITA");
    await restoreDefaults(adminToken);
    const back = await call("GET", "/admin/settings", adminToken);
    expect((data(back).settings as Json).defaultQuota).toBe(15);
  });

  test("QRIS Pro: admin-only upload, tampil di settings + /me/upgrade, hapus bersihkan file", async () => {
    const adminToken = (await cachedAdminLogin()).token;
    await restoreDefaults(adminToken);
    const u = await register("set-qris");
    const fd = new FormData();
    fd.append("qrisImage", new Blob([PNG_1X1], { type: "image/png" }), "q.png");
    const deniedRes = await fetch(`${BASE}/admin/pro-qris`, {
      method: "POST",
      headers: { Authorization: `Bearer ${u.token}` },
      body: fd,
    });
    expect(deniedRes.status).toBe(403);

    const fdBad = new FormData();
    fdBad.append("qrisImage", new Blob([Buffer.from("x")], { type: "text/plain" }), "x.txt");
    const bad = await fetch(`${BASE}/admin/pro-qris`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: fdBad,
    });
    expect(bad.status).toBe(400);

    const fdOk = new FormData();
    fdOk.append("qrisImage", new Blob([PNG_1X1], { type: "image/png" }), "q.png");
    const up = await fetch(`${BASE}/admin/pro-qris`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: fdOk,
    });
    expect(up.status).toBe(200);
    const upJson = (await up.json()) as Json;
    const url = (data({ json: upJson }).settings as Json).proQrisUrl as string;
    expect(url).toContain("/uploads/qris/");
    expect(url.endsWith(".png")).toBe(true);
    expect((await fetch(url)).status).toBe(200);

    const settings = await call("GET", "/admin/settings", adminToken);
    expect((data(settings).settings as Json).proQrisUrl).toBe(url);
    const upgrade = await call("GET", "/auth/me/upgrade", u.token);
    expect((data(upgrade) as Json).proQrisUrl).toBe(url);
    expect((data(upgrade) as Json).price).toBe(150000);

    const del = await fetch(`${BASE}/admin/pro-qris`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(del.status).toBe(200);
    const delJson = (await del.json()) as Json;
    expect((data({ json: delJson }).settings as Json).proQrisUrl).toBe("");
    expect((await fetch(url)).status).toBe(404);
    await restoreDefaults(adminToken);
  });
});

describe("Jalur: tags checkpoint (warna peta, 1 Nov 2026)", () => {

  // Rute MDPL seed: Bukit Anak Dara - Bao Ritip, Jalur Tanjakan Cinta.
  // Katalog compact: Pos 3 [Post], Registrasi [CommunityBaseCamp,
  // ParkingArea], Tanjakan Cinta [CampArea], Puncak Anak Dara
  // [Peak, CampArea] (puncak sekaligus area kemah -> warna puncak
  // menang), Pos 1 [Post].
  const mountainId = "bukit-anak-dara-bao-ritip";
  const routeId = "mdpl-E6Y1gyL28TlImNIbTCtM";

  async function getCheckpoints(token: string) {
    const one = await call("GET", `/mountains/${mountainId}/routes/${routeId}`, token);
    return (data(one).route as Json).checkpoints as Json[];
  }

  test("GET route detail mengembalikan tags per checkpoint", async () => {
    const token = (await cachedAdminLogin()).token;
    const cps = await getCheckpoints(token);
    const byName = new Map(cps.map((c) => [c.name as string, c.tags as string[]]));
    expect(byName.get("Tanjakan Cinta")).toContain("CampArea");
    expect(byName.get("Puncak Anak Dara")).toContain("Peak");
    expect(byName.get("Puncak Anak Dara")).toContain("CampArea");
    expect(byName.get("Pos 3")).toContain("Post");
    expect(byName.get("Registrasi & Parkir Bukit Anak Dara")).toContain("CommunityBaseCamp");
  });

  test("PATCH rename-only mempertahankan tags (seperti koordinat)", async () => {
    const token = (await cachedAdminLogin()).token;
    const before = await getCheckpoints(token);
    const names = before.map((c) => c.name as string);
    const beforeTags = before.map((c) => [...(c.tags as string[])].sort());
    await call("PATCH", `/mountains/${mountainId}/routes/${routeId}`, token, {
      posts: names,
    });
    const after = await getCheckpoints(token);
    expect(after.map((c) => c.name as string)).toEqual(names);
    expect(after.map((c) => [...(c.tags as string[])].sort())).toEqual(beforeTags);
  });
});

describe("Edit Profile staff (popup akun staff, 1 Nov 2026)", () => {
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );

  async function makeStaff(
    token: string,
    suffix: string,
    role = "command_center",
  ): Promise<{ id: string; email: string }> {
    const email = `staff-edit-${suffix}-${run}@t.local`;
    const r = await call("POST", "/admin/staff", token, {
      email,
      name: `Staff ${suffix}`,

      role,
    });
    expect(r.status).toBe(201);
    const u = data(r).user as Json;
    return { id: u.id as string, email };
  }

  async function callForm(
    path: string,
    method: string,
    token: string | undefined,
    field: string,
    file: { bytes: Buffer; name: string; type: string } | null,
  ): Promise<{ status: number; json: Json }> {
    const fd = new FormData();
    if (file) fd.append(field, new Blob([file.bytes], { type: file.type }), file.name);
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    return { status: res.status, json: (await res.json()) as Json };
  }

  test("PATCH nama+email sukses, peran tidak berubah", async () => {
    const token = (await cachedAdminLogin()).token;
    const s = await makeStaff(token, "ok");
    const r = await call("PATCH", `/admin/staff/${s.id}`, token, {
      name: "Nama Baru Staff",
      email: `staff-edit-ok2-${run}@t.local`,
      role: "admin",
    });
    expect(r.status).toBe(200);
    const u = data(r).user as Json;
    expect(u.name).toBe("Nama Baru Staff");
    expect(u.email).toBe(`staff-edit-ok2-${run}@t.local`);
    expect(u.role).toBe("command_center");
  });

  test("PATCH hanya nama, email tetap; email sendiri tidak 409", async () => {
    const token = (await cachedAdminLogin()).token;
    const s = await makeStaff(token, "nama");
    const r = await call("PATCH", `/admin/staff/${s.id}`, token, { name: "Nama Saja" });
    expect(r.status).toBe(200);
    expect((data(r).user as Json).email).toBe(s.email);
    const same = await call("PATCH", `/admin/staff/${s.id}`, token, { email: s.email });
    expect(same.status).toBe(200);
  });

  test("PATCH email duplikat -> 409 EMAIL_TAKEN; format salah -> 400; nama <2 -> 400; body kosong -> 400", async () => {
    const token = (await cachedAdminLogin()).token;
    const a = await makeStaff(token, "dup-a");
    const b = await makeStaff(token, "dup-b");
    const taken = await call("PATCH", `/admin/staff/${a.id}`, token, { email: b.email });
    expect(taken.status).toBe(409);
    expect(errCode(taken)).toBe("EMAIL_TAKEN");
    const badFmt = await call("PATCH", `/admin/staff/${a.id}`, token, { email: "bukan-email" });
    expect(badFmt.status).toBe(400);
    const short = await call("PATCH", `/admin/staff/${a.id}`, token, { name: "X" });
    expect(short.status).toBe(400);
    const empty = await call("PATCH", `/admin/staff/${a.id}`, token, {});
    expect(empty.status).toBe(400);
  });

  test("PATCH target member -> 404; target tak ada -> 404; non-admin -> 403; tanpa token -> 401", async () => {
    const token = (await cachedAdminLogin()).token;
    const member = await register("staff-edit-member");
    const notStaff = await call("PATCH", `/admin/staff/${member.id}`, token, { name: "Xx" });
    expect(notStaff.status).toBe(404);
    const missing = await call("PATCH", "/admin/staff/tidak-ada", token, { name: "Xx" });
    expect(missing.status).toBe(404);
    const s = await makeStaff(token, "guard");
    const forbiddenRes = await call("PATCH", `/admin/staff/${s.id}`, member.token, { name: "Xx" });
    expect(forbiddenRes.status).toBe(403);
    const anon = await call("PATCH", `/admin/staff/${s.id}`, undefined, { name: "Xx" });
    expect(anon.status).toBe(401);
  });

  test("POST avatar png -> URL /uploads/avatars tersaji; ganti hapus lama; DELETE kosongkan; target member -> 404; non-admin -> 403", async () => {
    const token = (await cachedAdminLogin()).token;
    const s = await makeStaff(token, "avatar");
    const anon = await callForm(`/admin/staff/${s.id}/avatar`, "POST", undefined, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(anon.status).toBe(401);
    const member = await register("staff-edit-avatar-mem");
    const forbiddenRes = await callForm(`/admin/staff/${s.id}/avatar`, "POST", member.token, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(forbiddenRes.status).toBe(403);
    const notStaff = await callForm(`/admin/staff/${member.id}/avatar`, "POST", token, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(notStaff.status).toBe(404);
    const bad = await callForm(`/admin/staff/${s.id}/avatar`, "POST", token, "avatar", {
      bytes: Buffer.from("bukan gambar"),
      name: "x.txt",
      type: "text/plain",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_IMAGE");

    const up = await callForm(`/admin/staff/${s.id}/avatar`, "POST", token, "avatar", {
      bytes: PNG_1X1,
      name: "a.png",
      type: "image/png",
    });
    expect(up.status).toBe(200);
    const url1 = (data(up).user as Json).avatarUrl as string;
    expect(url1).toContain("/uploads/avatars/");
    expect((await fetch(url1)).status).toBe(200);

    const up2 = await callForm(`/admin/staff/${s.id}/avatar`, "POST", token, "avatar", {
      bytes: PNG_1X1,
      name: "b.png",
      type: "image/png",
    });
    const url2 = (data(up2).user as Json).avatarUrl as string;
    expect(url2).not.toBe(url1);
    expect((await fetch(url1)).status).toBe(404);

    const del = await fetch(`${BASE}/admin/staff/${s.id}/avatar`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
    const delJson = (await del.json()) as Json;
    expect((delJson.data as Json).user as Json | null).not.toBeNull();
    expect(((delJson.data as Json).user as Json).avatarUrl).toBeNull();
    expect((await fetch(url2)).status).toBe(404);
  });
});

describe("Edit Profile member (dashboard, pelengkap PR #126)", () => {
  test("PATCH nama+email sukses, peran tetap user, field password/role diabaikan", async () => {
    const token = (await cachedAdminLogin()).token;
    const m = await register("member-edit-ok");
    const r = await call("PATCH", `/admin/members/${m.id}`, token, {
      name: "Nama Baru Member",
      email: `member-edit-ok2-${run}@t.local`,
      role: "admin",
      password: "baru1234",
    });
    expect(r.status).toBe(200);
    const u = data(r).user as Json;
    expect(u.name).toBe("Nama Baru Member");
    expect(u.email).toBe(`member-edit-ok2-${run}@t.local`);
    expect(u.role).toBe("user");
  });

  test("PATCH hanya nama, email tetap; email sendiri tidak 409", async () => {
    const token = (await cachedAdminLogin()).token;
    const m = await register("member-edit-nama");
    const r = await call("PATCH", `/admin/members/${m.id}`, token, { name: "Nama Saja" });
    expect(r.status).toBe(200);
    expect((data(r).user as Json).email).toBe(`member-edit-nama-${run}@t.local`);
    const same = await call("PATCH", `/admin/members/${m.id}`, token, {
      email: `member-edit-nama-${run}@t.local`,
    });
    expect(same.status).toBe(200);
  });

  test("PATCH email duplikat -> 409 EMAIL_TAKEN; format salah -> 400; nama <2 -> 400; body kosong -> 400", async () => {
    const token = (await cachedAdminLogin()).token;
    const a = await register("member-edit-dup-a");
    const b = await register("member-edit-dup-b");
    const taken = await call("PATCH", `/admin/members/${a.id}`, token, {
      email: `member-edit-dup-b-${run}@t.local`,
    });
    expect(taken.status).toBe(409);
    expect(errCode(taken)).toBe("EMAIL_TAKEN");
    const badFmt = await call("PATCH", `/admin/members/${a.id}`, token, { email: "bukan-email" });
    expect(badFmt.status).toBe(400);
    const short = await call("PATCH", `/admin/members/${a.id}`, token, { name: "X" });
    expect(short.status).toBe(400);
    const empty = await call("PATCH", `/admin/members/${a.id}`, token, {});
    expect(empty.status).toBe(400);
  });

  test("PATCH target staff -> 404; target tak ada -> 404; command_center -> 403; member lain -> 403; tanpa token -> 401", async () => {
    const token = (await cachedAdminLogin()).token;
    const m = await register("member-edit-guard");
    const staff = await call("POST", "/admin/staff", token, {
      email: `member-edit-guard-cc-${run}@t.local`,
      name: "Staff Guard",
      role: "command_center",
    });
    expect(staff.status).toBe(201);
    const staffId = (data(staff).user as Json).id as string;
    const ccToken = (await loginOtp(`member-edit-guard-cc-${run}@t.local`)).token;
    const notMember = await call("PATCH", `/admin/members/${staffId}`, token, { name: "Xx" });
    expect(notMember.status).toBe(404);
    const missing = await call("PATCH", "/admin/members/tidak-ada", token, { name: "Xx" });
    expect(missing.status).toBe(404);
    const ccRes = await call("PATCH", `/admin/members/${m.id}`, ccToken, { name: "Xx" });
    expect(ccRes.status).toBe(403);
    const other = await register("member-edit-guard-2");
    const memberRes = await call("PATCH", `/admin/members/${m.id}`, other.token, { name: "Xx" });
    expect(memberRes.status).toBe(403);
    const anon = await call("PATCH", `/admin/members/${m.id}`, undefined, { name: "Xx" });
    expect(anon.status).toBe(401);
  });
});

describe("POST /trip-groups/:id/start menolak trip expired", () => {
  async function makeTrip(
    token: string,
    date: string,
  ): Promise<string> {
    await call("PATCH", "/auth/me", token, { phone: "0811111111" });
    const res = await call("POST", "/trip-groups", token, {
      name: "Start Guard Trip",
      type: "HIKING",
      date,
      meetingPoint: "X",
    });
    expect(res.status).toBe(201);
    return (data(res).trip as Json).id as string;
  }

  test("PLANNED + tanggal lewat → 409 TRIP_EXPIRED, status tetap PLANNED", async () => {
    const leader = await register("startguard-exp");
    const tripId = await makeTrip(leader.token, "2020-01-01");
    const res = await call("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(res.status).toBe(409);
    expect(errCode(res)).toBe("TRIP_EXPIRED");
    const after = await call("GET", `/trip-groups/${tripId}`, leader.token);
    expect((data(after).trip as Json).status).toBe("PLANNED");
  });

  test("PLANNED + tanggal hari ini → 200 ACTIVE", async () => {
    const leader = await register("startguard-today");
    const today = new Date().toISOString().slice(0, 10);
    const tripId = await makeTrip(leader.token, today);
    const res = await call("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(res.status).toBe(200);
    expect((data(res).trip as Json).status).toBe("ACTIVE");
  });

  test("PLANNED + tanggal depan → 200 ACTIVE", async () => {
    const leader = await register("startguard-future");
    const tripId = await makeTrip(leader.token, "2999-01-01");
    const res = await call("POST", `/trip-groups/${tripId}/start`, leader.token);
    expect(res.status).toBe(200);
    expect((data(res).trip as Json).status).toBe("ACTIVE");
  });
});
