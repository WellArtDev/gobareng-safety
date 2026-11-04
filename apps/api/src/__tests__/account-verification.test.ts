// Verifikasi akun dua kanal — TDD. Jalur BARU yang terpisah dari
// verifikasi organizer (isVerified + OrganizerVerification tidak pernah
// dibaca/ditulis flow ini):
// - daftar via HP -> HP terbukti lewat OTP login, email wajib diverifikasi
//   lewat link klik sekali pakai + kedaluwarsa -> otomatis account-verified.
// - daftar via email -> email terbukti lewat OTP login, WhatsApp wajib
//   diverifikasi lewat kode OTP -> otomatis account-verified.
// - gate SOS umum (+ voice SOS) menerima account-verified ATAU
//   organizer-verified yang sudah ada.
// Pengiriman nyata di-stub: otp-delivery (semua kanal, kode ditangkap per
// tujuan) dan modul email verifikasi (link ditangkap di batas modul).
import { mock } from "bun:test";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4199;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

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

// Tangkap link di BATAS modul email (account-verification-mail.js),
 // bukan di smtp/brevo: modul ini HANYA dipakai flow ini, jadi tidak
 // ada file tes lain yang me-mock-nya — kebal terhadap perebutan
 // mock smtp/brevo antar file saat suite penuh jalan paralel (yang
 // bikin tes link gagal "mail undefined" padahal request 200: kiriman
 // lewat jalur Brevo tanpa capture). Jalur SMTP-first/Brevo di dalam
 // modul nyata tetap pola yang sama dengan notifyOldEmailAddress
 // (sudah teruji di email-change) dan diuji unit terpisah.
const sentLinks: Array<{ to: string; link: string }> = [];
mock.module("../account-verification-mail.js", () => ({
  sendVerificationLinkEmail: async (
    to: string,
    link: string,
  ): Promise<boolean> => {
    sentLinks.push({ to, link });
    return true;
  },
}));

let http: Server;
let testDb: Db;

beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = "otp-only-test";
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  // Kanal WA untuk OTP: default mati, tes ini mengaktifkannya.
  await testDb.updatePlatformSettings({
    otpWhatsapp: true,
    otpWhatsappTemplate: "otp",
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
): Promise<{ status: number; json: Json; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = {};
  }
  return { status: res.status, json, text };
}

function data(r: { json: Json }): Json {
  return r.json.data as Json;
}
function errCode(r: { json: Json }): string {
  return (r.json.error as Json)?.code as string;
}

let seq = 0;
const email = (n: string) => `${n}-${run}-${seq++}@t.local`;
// Digit dari string run supaya nomor HP unik per eksekusi: cap/jam +
// cooldown OTP per identifier berlaku lintas eksekusi di DB tes yang
// sama, jadi nomor yang diulang antar run kena 429. PENTING: pakai 4
// digit TERAKHIR — 4 digit awal stabil berjam-jam (karakter depan
// timestamp base36 hampir tidak berubah), dan itu yang bikin run
// berurutan kena 429 padahal "run" sudah beda.
const runDigits = run
  .split("")
  .map((c) => String(parseInt(c, 36) % 10))
  .join("");
const phone = () =>
  `62812${runDigits.slice(-4)}${String(1000 + seq++).padStart(4, "0")}`;

async function otpLogin(
  identifier: string,
  opts?: { channel?: string; name?: string; email?: string },
): Promise<{ token: string; user: Json }> {
  // Pengaturan platform itu SATU baris global yang ikut dimutasi file
  // tes lain saat suite penuh jalan paralel (pola polusi yang sama
  // dengan anti-lockout/whatsapp-otp): tegaskan lagi kanal WA sebelum
  // tiap login HP, bukan cuma sekali di beforeAll.
  if (/^\+?\d{9,15}$/.test(identifier)) {
    await testDb.updatePlatformSettings({
      otpWhatsapp: true,
      otpWhatsappTemplate: "otp",
    });
  }
  const req = await call("POST", "/auth/otp/request", undefined, {
    identifier,
    ...(opts?.channel ? { channel: opts.channel } : {}),
  });
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const first = await call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
  });
  if (first.status === 200 && (data(first) as Json).needsName) {
    expect(opts?.name).toBeTruthy();
    const second = await call("POST", "/auth/otp/verify", undefined, {
      identifier,
      code: code!,
      name: opts!.name,
      ...(opts?.email ? { email: opts.email } : {}),
    });
    expect(second.status).toBe(200);
    const d = data(second);
    return { token: d.token as string, user: d.user as Json };
  }
  expect(first.status).toBe(200);
  const d = data(first);
  return { token: d.token as string, user: d.user as Json };
}

async function me(token: string): Promise<Json> {
  const r = await call("GET", "/auth/me", token);
  expect(r.status).toBe(200);
  return data(r).user as Json;
}

function extractToken(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text);
  expect(m).not.toBeNull();
  return m![1];
}

// Request link + assert 200 di satu tempat: kalau request gagal
// (mis. toggle kanal dibalik file lain), tes gagal di langkah ini
// dengan statusnya — bukan di mail-undefined yang menyesatkan.
async function requestEmailLink(token: string): Promise<void> {
  const r = await call("POST", "/account-verification/email/request", token);
  expect(r.status).toBe(200);
}

describe("verifikasi akun dua kanal", () => {
  test("daftar via HP: HP terverifikasi, email belum, akun belum", async () => {
    const hp = phone();
    const em = email("hp");
    const { token } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User HP",
      email: em,
    });
    const u = await me(token);
    expect(u.phoneVerifiedAt).toBeString();
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.accountVerifiedAt).toBeNull();
    expect(u.isVerified).toBe(false);
  });

  test("daftar via email: email terverifikasi, HP belum, akun belum", async () => {
    const em = email("em");
    const { token } = await otpLogin(em, { name: "User Email" });
    const u = await me(token);
    expect(u.emailVerifiedAt).toBeString();
    expect(u.phoneVerifiedAt).toBeNull();
    expect(u.accountVerifiedAt).toBeNull();
    expect(u.isVerified).toBe(false);
  });

  test("link email: kirim -> klik -> email + akun terverifikasi, organizer tak tersentuh", async () => {
    const hp = phone();
    const em = email("hp2");
    const { token, user } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User Link",
      email: em,
    });
    const req = await call(
      "POST",
      "/account-verification/email/request",
      token,
    );
    expect(req.status).toBe(200);
    expect(data(req).sent).toBe(true);
    const mail = sentLinks.find((m) => m.to === em);
    expect(mail).toBeTruthy();
    const linkToken = extractToken(mail!.link);
    const verify = await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    expect(verify.status).toBe(200);
    expect(verify.text).toMatch(/terverifikasi/i);
    const u = await me(token);
    expect(u.emailVerifiedAt).toBeString();
    expect(u.phoneVerifiedAt).toBeString();
    expect(u.accountVerifiedAt).toBeString();
    // Jalur organizer tidak tersentuh flow ini.
    expect(u.isVerified).toBe(false);
    const orgRow = await testDb.prisma.organizerVerification.findFirst({
      where: { userId: user.id as string },
    });
    expect(orgRow?.status).toBe("PENDING");
    // Status endpoint mencerminkan kedua kanal.
    const st = await call("GET", "/account-verification/status", token);
    expect(st.status).toBe(200);
    const s = data(st);
    expect(s.emailVerified).toBe(true);
    expect(s.phoneVerified).toBe(true);
    expect(s.accountVerified).toBe(true);
    expect(s.organizerVerified).toBe(false);
  });

  test("link email kedaluwarsa ditolak", async () => {
    const hp = phone();
    const em = email("exp");
    const { token, user } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User Exp",
      email: em,
    });
    await requestEmailLink(token);
    const mail = sentLinks.find((m) => m.to === em);
    const linkToken = extractToken(mail!.link);
    await testDb.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id as string, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const verify = await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    expect(verify.status).toBe(200);
    expect(verify.text).toMatch(/kedaluwarsa|tidak valid|gagal/i);
    const u = await me(token);
    expect(u.emailVerifiedAt).toBeNull();
    expect(u.accountVerifiedAt).toBeNull();
  });

  test("link email sekali pakai: klik kedua ditolak", async () => {
    const hp = phone();
    const em = email("sekali");
    const { token } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User Sekali",
      email: em,
    });
    await requestEmailLink(token);
    const mail = sentLinks.find((m) => m.to === em);
    const linkToken = extractToken(mail!.link);
    const first = await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    expect(first.text).toMatch(/terverifikasi/i);
    const second = await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    expect(second.text).toMatch(/sudah dipakai|tidak valid|gagal/i);
  });

  test("link email untuk alamat lama ditolak setelah email berubah", async () => {
    const hp = phone();
    const em = email("lama");
    const { token, user } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User Lama",
      email: em,
    });
    await requestEmailLink(token);
    const mail = sentLinks.find((m) => m.to === em);
    const linkToken = extractToken(mail!.link);
    await testDb.prisma.user.update({
      where: { id: user.id as string },
      data: { email: email("baru") },
    });
    const verify = await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    expect(verify.text).toMatch(/tidak valid|gagal|berubah/i);
  });

  test("kirim ulang link dalam 60 detik ditolak", async () => {
    const hp = phone();
    const em = email("cool");
    const { token } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User Cool",
      email: em,
    });
    const first = await call(
      "POST",
      "/account-verification/email/request",
      token,
    );
    expect(first.status).toBe(200);
    const second = await call(
      "POST",
      "/account-verification/email/request",
      token,
    );
    expect(second.status).toBe(429);
    expect(errCode(second)).toBe("EMAIL_LINK_COOLDOWN");
  });

  test("verifikasi WA tanpa HP ditolak PHONE_NOT_SET", async () => {
    const em = email("nohp");
    const { token } = await otpLogin(em, { name: "User NoHP" });
    const r = await call(
      "POST",
      "/account-verification/whatsapp/request",
      token,
    );
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("PHONE_NOT_SET");
  });

  test("verifikasi WA: kode salah ditolak, kode benar menandai HP + akun", async () => {
    const em = email("wa");
    const hp = phone();
    const { token } = await otpLogin(em, { name: "User WA" });
    const patched = await call("PATCH", "/auth/me", token, { phone: hp });
    expect(patched.status).toBe(200);
    const req = await call(
      "POST",
      "/account-verification/whatsapp/request",
      token,
    );
    expect(req.status).toBe(200);
    const code = sentCodes.get(hp);
    expect(code).toMatch(/^\d{6}$/);
    const wrong = await call(
      "POST",
      "/account-verification/whatsapp/verify",
      token,
      { code: "000000" },
    );
    expect(wrong.status).toBe(401);
    expect(errCode(wrong)).toBe("INVALID_OTP");
    const ok = await call(
      "POST",
      "/account-verification/whatsapp/verify",
      token,
      { code },
    );
    expect(ok.status).toBe(200);
    expect(data(ok).phoneVerified).toBe(true);
    expect(data(ok).accountVerified).toBe(true);
    const u = await me(token);
    expect(u.phoneVerifiedAt).toBeString();
    expect(u.accountVerifiedAt).toBeString();
  });

  test("ganti HP lewat PATCH /me mereset verifikasi HP + akun", async () => {
    const em = email("ganti");
    const hp = phone();
    const { token } = await otpLogin(em, { name: "User Ganti" });
    await call("PATCH", "/auth/me", token, { phone: hp });
    await call("POST", "/account-verification/whatsapp/request", token);
    const code = sentCodes.get(hp);
    await call("POST", "/account-verification/whatsapp/verify", token, {
      code,
    });
    const before = await me(token);
    expect(before.accountVerifiedAt).toBeString();
    await call("PATCH", "/auth/me", token, { phone: phone() });
    const after = await me(token);
    expect(after.phoneVerifiedAt).toBeNull();
    expect(after.accountVerifiedAt).toBeNull();
    expect(after.emailVerifiedAt).toBeString();
  });

  test("gate SOS umum: akun terverifikasi bisa kirim, belum verifikasi ditolak", async () => {
    const hp = phone();
    const em = email("sos");
    const { token } = await otpLogin(hp, {
      channel: "whatsapp",
      name: "User SOS",
      email: em,
    });
    const denied = await call("POST", "/sos-general", token, {
      reason: "KECELAKAAN_LALU_LINTAS",
      lat: -6.2,
      lon: 106.8,
    });
    expect(denied.status).toBe(403);
    expect(errCode(denied)).toBe("GENERAL_SOS_UNVERIFIED_SENDER");
    await requestEmailLink(token);
    const mail = sentLinks.find((m) => m.to === em);
    const linkToken = extractToken(mail!.link);
    await call(
      "GET",
      `/account-verification/email/verify?token=${linkToken}`,
    );
    const allowed = await call("POST", "/sos-general", token, {
      reason: "KECELAKAAN_LALU_LINTAS",
      lat: -6.2,
      lon: 106.8,
    });
    expect(allowed.status).toBe(201);
  });
});
