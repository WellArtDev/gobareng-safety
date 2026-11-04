// Ganti email berbasis OTP + bersih-bersih hash password lama — TDD.
// Alur: sesi terautentikasi + POST /me/email-change/request (kode ke
// alamat BARU) + PATCH /me { email, emailOtp }. Pengiriman nyata
// di-stub di level modul delivery (mock.module) seperti otp.test.ts,
// supaya tes tidak menyentuh Brevo/SMTP asli; kode yang diverifikasi
// adalah kode yang benar-benar "dikirim" lewat stub itu.
import { mock } from "bun:test";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4192;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean; errorCode?: string }> => {
    if (channel === "whatsapp") {
      return { ok: false, errorCode: "WHATSAPP_TEMPLATE_NO_VARIABLE" };
    }
    sentCodes.set(destination, code);
    return { ok: true };
  },
}));

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `otp-admin-${run}`;
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

async function otpLogin(
  identifier: string,
  name?: string,
  channel?: string,
): Promise<{ token: string; user: Json }> {
  const req = await call("POST", "/auth/otp/request", undefined, {
    identifier,
    ...(channel ? { channel } : {}),
  });
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, { identifier, code });
  if (first.status === 200 && (data(first) as Json).needsName) {
    expect(name).toBeTruthy();
    const second = await call("POST", "/auth/otp/verify", undefined, {
      identifier,
      code,
      name,
    });
    expect(second.status).toBe(200);
    return {
      token: (data(second) as Json).token as string,
      user: (data(second) as Json).user as Json,
    };
  }
  expect(first.status).toBe(200);
  return {
    token: (data(first) as Json).token as string,
    user: (data(first) as Json).user as Json,
  };
}

describe("ganti email berbasis OTP", () => {
  test("pengguna OTP-only bisa ganti email; sesi lama tetap berlaku", async () => {
    const oldEmail = `lama-${run}@t.local`;
    const newEmail = `baru-${run}@t.local`;
    const { token } = await otpLogin(oldEmail, "Ganti Email");
    const req = await call("POST", "/auth/me/email-change/request", token, {
      email: newEmail,
    });
    expect(req.status).toBe(200);
    expect((data(req) as Json).expiresInSeconds).toBe(300);
    const code = sentCodes.get(newEmail);
    expect(code).toMatch(/^\d{6}$/);

    const patch = await call("PATCH", "/auth/me", token, {
      email: newEmail,
      emailOtp: code,
    });
    expect(patch.status).toBe(200);
    expect((data(patch).user as Json).email).toBe(newEmail);

    // Sesi lama (token yang sama) tetap berlaku setelah ganti email.
    const me = await call("GET", "/auth/me", token);
    expect(me.status).toBe(200);
    expect((data(me).user as Json).email).toBe(newEmail);

    // Login OTP ke alamat baru jalan; alamat lama sudah bebas lagi
    // (bisa diminta sebagai tujuan ganti-email — namespace kodenya
    // berbeda dari kode login, jadi tidak kena cooldown login).
    const relogin = await otpLogin(newEmail);
    expect((relogin.user as Json).email).toBe(newEmail);
    const backReq = await call("POST", "/auth/me/email-change/request", relogin.token, {
      email: oldEmail,
    });
    expect(backReq.status).toBe(200);
  });

  test("tanpa emailOtp email tidak berubah", async () => {
    const { token, user } = await otpLogin(`nootp-${run}@t.local`, "Tanpa Otp");
    const patch = await call("PATCH", "/auth/me", token, {
      email: `tujuan-${run}@t.local`,
    });
    expect(patch.status).toBe(400);
    expect(errCode(patch)).toBe("EMAIL_OTP_REQUIRED");
    const me = await call("GET", "/auth/me", token);
    expect((data(me).user as Json).email).toBe(user.email);
  });

  test("kode salah ditolak; kode untuk alamat lain tidak bisa dipakai", async () => {
    const { token, user } = await otpLogin(`salah-${run}@t.local`, "Kode Salah");
    const targetA = `a-${run}@t.local`;
    const targetB = `b-${run}@t.local`;
    const req = await call("POST", "/auth/me/email-change/request", token, {
      email: targetA,
    });
    expect(req.status).toBe(200);
    const wrong = await call("PATCH", "/auth/me", token, {
      email: targetA,
      emailOtp: "000000",
    });
    expect(wrong.status).toBe(401);
    expect(errCode(wrong)).toBe("INVALID_OTP");
    // Kode yang dikirim untuk A dipakai untuk mengganti ke B -> tolak.
    const cross = await call("PATCH", "/auth/me", token, {
      email: targetB,
      emailOtp: sentCodes.get(targetA),
    });
    expect(cross.status).toBe(401);
    expect(errCode(cross)).toBe("INVALID_OTP");
    const me = await call("GET", "/auth/me", token);
    expect((data(me).user as Json).email).toBe(user.email);
  });

  test("alamat yang sudah dipakai ditolak saat request; currentPassword diabaikan", async () => {
    const taken = `dipakai-${run}@t.local`;
    await otpLogin(taken, "Pemilik Lama");
    const { token } = await otpLogin(`peminta-${run}@t.local`, "Peminta");
    const req = await call("POST", "/auth/me/email-change/request", token, {
      email: taken,
    });
    expect(req.status).toBe(409);
    expect(errCode(req)).toBe("EMAIL_TAKEN");

    // currentPassword salah sekalipun tidak menggagalkan ganti email:
    // gate lama sudah tidak dibaca sama sekali.
    const fresh = `fresh-${run}@t.local`;
    const req2 = await call("POST", "/auth/me/email-change/request", token, {
      email: fresh,
    });
    expect(req2.status).toBe(200);
    const patch = await call("PATCH", "/auth/me", token, {
      email: fresh,
      emailOtp: sentCodes.get(fresh),
      currentPassword: "salah-total",
    });
    expect(patch.status).toBe(200);
    expect((data(patch).user as Json).email).toBe(fresh);
  });

  test("request ganti-email tanpa sesi ditolak; ke alamat sendiri ditolak", async () => {
    const noAuth = await call("POST", "/auth/me/email-change/request", undefined, {
      email: `x-${run}@t.local`,
    });
    expect(noAuth.status).toBe(401);
    const { token, user } = await otpLogin(`sendiri-${run}@t.local`, "Sendiri");
    const same = await call("POST", "/auth/me/email-change/request", token, {
      email: user.email,
    });
    expect(same.status).toBe(400);
  });
});

describe("bersih-bersih hash password lama", () => {
  test("hanya hash yang di-nol-kan; akun + sesi OTP tetap jalan", async () => {
    const legacyEmail = `legacy-${run}@t.local`;
    const legacyPhone = `628123456${String(run.length).padStart(4, "0")}`.slice(0, 13);
    const legacy = await testDb.createUserWithPendingOrganizerVerification({
      email: legacyEmail,
      name: "Legacy Hash",
      slug: `legacy-${run}`,
      // Hash warisan dari era login password (nilai apa pun — yang
      // penting ia ada sebelum cleanup dan hilang sesudahnya).
      passwordHash: "$2b$10$legacyhashwarisanerpassword0000000000000000000000",
      phone: legacyPhone,
      isAdmin: false,
      role: "user",
      isVerified: true,
    });
    expect(legacy.passwordHash).toContain("legacyhash");
    // Sesi dibuat SEBELUM cleanup lewat kanal SMS (supaya login ulang
    // lewat email sesudah cleanup tidak kena cooldown kirim ulang
    // 60 detik pada identifier+kanal yang sama), lalu dipakai SESUDAH
    // cleanup.
    const { token } = await otpLogin(legacyPhone, undefined, "sms");
    const meBefore = await call("GET", "/auth/me", token);
    expect(meBefore.status).toBe(200);

    const cleaned = await testDb.clearLegacyPasswordHashes();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    const after = await testDb.userById(legacy.id);
    expect(after).not.toBeNull();
    expect(after!.email).toBe(legacyEmail);
    expect(after!.name).toBe("Legacy Hash");
    expect(after!.passwordHash).toBeNull();

    // Akun tidak rusak: sesi lama jalan, login OTP ulang jalan.
    const meAfter = await call("GET", "/auth/me", token);
    expect(meAfter.status).toBe(200);
    const relogin = await otpLogin(legacyEmail);
    expect((relogin.user as Json).id).toBe(legacy.id);

    // Idempotent: tidak ada lagi hash yang tersisa untuk dibersihkan.
    expect(await testDb.clearLegacyPasswordHashes()).toBe(0);
  });
});
