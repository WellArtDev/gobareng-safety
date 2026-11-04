// OTP passwordless — TDD. Alur: identifier (email/nomor HP) -> kode 6
// digit -> sesi. Pengiriman nyata di-stub di level modul delivery
// (mock.module) supaya tes tidak menyentuh Brevo/SMTP asli, tapi kode
// yang diverifikasi adalah kode yang benar-benar "dikirim" lewat stub
// itu (ditangkap per tujuan), bukan kode yang ditebak tes dari DB.
// Perilaku yang butuh kendali waktu (kedaluwarsa, cap/jam, akhir kunci)
// diuji di level service dengan jam palsu; sisanya lewat HTTP.
import { mock } from "bun:test";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4191;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);

// Tangkap kode yang "dikirim" per tujuan (email/nomor HP).
const sentCodes = new Map<string, string>();
mock.module("../otp-delivery.js", () => ({
  sendOtpCode: async (
    channel: string,
    destination: string,
    code: string,
  ): Promise<{ ok: boolean; errorCode?: string }> => {
    // Mereplikasi kontrak otp-delivery produksi: WhatsApp tidak bisa
    // membawa kode (template tanpa variabel) — mock yang mengembalikan
    // ok untuk WhatsApp akan menyembunyikan perilaku ini.
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

async function requestOtp(
  identifier: string,
  channel?: string,
): Promise<{ status: number; json: Json }> {
  return call("POST", "/auth/otp/request", undefined, {
    identifier,
    ...(channel ? { channel } : {}),
  });
}

async function verifyOtp(
  identifier: string,
  code: string,
  extra?: Record<string, unknown>,
): Promise<{ status: number; json: Json }> {
  return call("POST", "/auth/otp/verify", undefined, {
    identifier,
    code,
    ...(extra ?? {}),
  });
}

// Alur lengkap lewat HTTP: minta kode -> ambil kode dari stub delivery
// -> verifikasi. Untuk identifier baru, langkah nama dilewati bila
// `name` diisi (plus `email` bila identifier-nya nomor HP).
async function otpLogin(
  identifier: string,
  opts?: { channel?: string; name?: string; email?: string },
): Promise<{ token: string; user: Json }> {
  const req = await requestOtp(identifier, opts?.channel);
  expect(req.status).toBe(200);
  const code = sentCodes.get(identifier);
  expect(code).toMatch(/^\d{6}$/);
  const first = await verifyOtp(identifier, code!);
  if (first.status === 200 && (data(first) as Json).needsName) {
    expect(opts?.name).toBeTruthy();
    const second = await verifyOtp(identifier, code!, {
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

const email = (n: string) => `${n}-${run}@t.local`;
// Digit dari string run (base36 -> digit per karakter) supaya nomor HP
// valid (hanya digit) dan unik per file/eksekusi.
const runDigits = run
  .split("")
  .map((c) => String(c.charCodeAt(0) % 10))
  .join("")
  .slice(0, 6);
const phone = (n: string) => `62812${runDigits}${n}`.slice(0, 15);

// Tidur: dipakai hanya untuk melewati cooldown kirim ulang 60 detik
// di tes yang memang harus minta kode kedua untuk identifier sama.
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Token admin di-cache per file: login OTP admin berulang dalam
// 60 detik akan kena OTP_COOLDOWN (perilaku produksi yang benar),
// jadi tes settings memakai satu sesi admin yang sama. JWT 15 menit
// masih jauh lebih panjang dari durasi file ini.
let cachedAdmin: { token: string; user: Json } | undefined;
async function adminOtp(): Promise<{ token: string; user: Json }> {
  cachedAdmin ??= await otpLogin(`admin-${run}@t.local`);
  return cachedAdmin;
}

describe("GET /auth/otp/channels (publik)", () => {
  test("mengembalikan flag kanal dari settings, tanpa secret", async () => {
    const r = await call("GET", "/auth/otp/channels");
    expect(r.status).toBe(200);
    const d = data(r);
    expect(d.email).toBe(true);
    expect(d.sms).toBe(true);
    expect(d.whatsapp).toBe(false);
    expect(JSON.stringify(r.json)).not.toMatch(/BREVO|API_KEY|api-key/i);
  });
});

describe("POST /auth/otp/request + verify (HTTP)", () => {
  test("identifier baru email -> NEEDS_NAME, lalu nama -> sesi valid", async () => {
    const id = email("baru1");
    const req = await requestOtp(id);
    expect(req.status).toBe(200);
    expect(data(req).channel).toBe("email");
    const code = sentCodes.get(id);
    expect(code).toMatch(/^\d{6}$/);
    const first = await verifyOtp(id, code!);
    expect(first.status).toBe(200);
    expect(data(first).needsName).toBe(true);
    expect(data(first).needsEmail).toBe(false);
    const second = await verifyOtp(id, code!, { name: "Pengguna Baru" });
    expect(second.status).toBe(200);
    const d = data(second);
    expect(typeof d.token).toBe("string");
    const me = await call("GET", "/auth/me", d.token as string);
    expect(me.status).toBe(200);
    expect((data(me).user as Json).email).toBe(id);
  });

  test("identifier baru nomor HP -> butuh nama DAN email", async () => {
    const id = phone("0001");
    const req = await requestOtp(id, "sms");
    expect(req.status).toBe(200);
    expect(data(req).channel).toBe("sms");
    const code = sentCodes.get(id);
    const first = await verifyOtp(id, code!);
    expect(first.status).toBe(200);
    expect(data(first).needsName).toBe(true);
    expect(data(first).needsEmail).toBe(true);
    const noEmail = await verifyOtp(id, code!, { name: "Pemotor Baru" });
    expect(noEmail.status).toBe(400);
    const ok = await verifyOtp(id, code!, {
      name: "Pemotor Baru",
      email: email("hpbaru1"),
    });
    expect(ok.status).toBe(200);
    const me = await call(
      "GET",
      "/auth/me",
      (data(ok).token as string) ?? "",
    );
    expect(me.status).toBe(200);
    expect((data(me).user as Json).phone).toBe(id);
  });

  test("user yang sudah ada -> verifikasi langsung sesi (tanpa nama)", async () => {
    const id = email("lama1");
    await otpLogin(id, { name: "User Lama" });
    // Kode kedua untuk identifier sama: tunggu cooldown 60 detik lewat.
    await sleep(61_000);
    const req = await requestOtp(id);
    expect(req.status).toBe(200);
    const second = await verifyOtp(id, sentCodes.get(id)!);
    expect(second.status).toBe(200);
    expect(data(second).token).toBeTruthy();
    expect(data(second).needsName).toBeUndefined();
  });

  test("kode sekali pakai: verifikasi kedua dengan kode sama gagal", async () => {
    const id = email("sekali1");
    await requestOtp(id);
    const code = sentCodes.get(id)!;
    const ok = await verifyOtp(id, code, { name: "Sekali Pakai" });
    expect(ok.status).toBe(200);
    const again = await verifyOtp(id, code);
    expect(again.status).toBe(401);
    expect(errCode(again)).toBe("INVALID_OTP");
  });

  test("replay: kode sama untuk user lama tidak bisa dipakai dua kali", async () => {
    const id = email("replay1");
    await otpLogin(id, { name: "Replay Guard" });
    // Kode kedua untuk identifier sama: tunggu cooldown 60 detik lewat.
    await sleep(61_000);
    await requestOtp(id);
    const code = sentCodes.get(id)!;
    const first = await verifyOtp(id, code);
    expect(first.status).toBe(200);
    expect(data(first).token).toBeTruthy();
    const again = await verifyOtp(id, code);
    expect(again.status).toBe(401);
    expect(errCode(again)).toBe("INVALID_OTP");
  });

  test("5x salah -> kunci; kode benar saat terkunci tetap ditolak", async () => {
    const id = email("kunci1");
    await requestOtp(id);
    const real = sentCodes.get(id)!;
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      const r = await verifyOtp(id, wrong);
      expect(r.status).toBe(401);
      expect(errCode(r)).toBe("INVALID_OTP");
    }
    const fifth = await verifyOtp(id, wrong);
    expect(fifth.status).toBe(429);
    expect(errCode(fifth)).toBe("OTP_LOCKED");
    const locked = await verifyOtp(id, real);
    expect(locked.status).toBe(429);
    expect(errCode(locked)).toBe("OTP_LOCKED");
    const reqLocked = await requestOtp(id);
    expect(reqLocked.status).toBe(429);
    expect(errCode(reqLocked)).toBe("OTP_LOCKED");
  });

  test("kirim ulang dalam 60 detik -> OTP_COOLDOWN", async () => {
    const id = email("cooldown1");
    const first = await requestOtp(id);
    expect(first.status).toBe(200);
    const second = await requestOtp(id);
    expect(second.status).toBe(429);
    expect(errCode(second)).toBe("OTP_COOLDOWN");
  });

  test("kanal nonaktif ditolak CHANNEL_DISABLED, tanpa fallback diam-diam", async () => {
    // Identifier HP (bukan email): email + whatsapp adalah mismatch
    // INVALID_PAYLOAD, bukan kasus toggle nonaktif yang diuji di sini.
    const id = phone("0009");
    const r = await requestOtp(id, "whatsapp");
    // WhatsApp default nonaktif -> CHANNEL_DISABLED (bukan fallback SMS).
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("CHANNEL_DISABLED");
    expect(sentCodes.has(id)).toBe(false);
  });

  test("identifier tak valid ditolak", async () => {
    const r = await requestOtp("bukan-identifier");
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("INVALID_PAYLOAD");
  });

  test("akun ditangguhkan tidak bisa verifikasi", async () => {
    const id = email("tangguh1");
    const s = await otpLogin(id, { name: "Ditangguhkan" });
    await testDb.updateUser(s.user.id as string, {
      suspendedAt: new Date(),
    });
    // Kode kedua untuk identifier sama: tunggu cooldown 60 detik lewat.
    await sleep(61_000);
    await requestOtp(id);
    const r = await verifyOtp(id, sentCodes.get(id)!);
    expect(r.status).toBe(401);
    expect(errCode(r)).toBe("ACCOUNT_SUSPENDED");
  });
});

describe("endpoint password lama -> 410 OTP_ONLY", () => {
  test("POST /auth/register, POST /auth/login, PATCH /me/password", async () => {
    const reg = await call("POST", "/auth/register", undefined, {
      email: email("x410"),
      name: "X",
      password: "rahasia123",
    });
    expect(reg.status).toBe(410);
    expect(errCode(reg)).toBe("OTP_ONLY");
    const log = await call("POST", "/auth/login", undefined, {
      email: email("x410"),
      password: "rahasia123",
    });
    expect(log.status).toBe(410);
    expect(errCode(log)).toBe("OTP_ONLY");
    const s = await otpLogin(email("x410b"), { name: "Pemilik 410" });
    const pw = await call(
      "PATCH",
      "/auth/me/password",
      s.token,
      { currentPassword: "a", newPassword: "rahasia123" },
    );
    expect(pw.status).toBe(410);
    expect(errCode(pw)).toBe("OTP_ONLY");
  });
});

describe("PATCH /admin/settings: kunci anti-kunci-diri", () => {
  test("menonaktifkan SEMUA kanal OTP ditolak; settings tidak berubah", async () => {
    const admin = await adminOtp();
    const allOff = await call(
      "PATCH",
      "/admin/settings",
      admin.token,
      { otpEmail: false, otpSms: false, otpWhatsapp: false },
    );
    expect(allOff.status).toBe(400);
    expect(errCode(allOff)).toBe("OTP_ALL_CHANNELS_DISABLED");
    const ch = await call("GET", "/auth/otp/channels");
    expect(data(ch).email).toBe(true);
  });

  test("kanal WhatsApp aktif tapi template tak bawa variabel -> error eksplisit", async () => {
    const admin = await adminOtp();
    const on = await call("PATCH", "/admin/settings", admin.token, {
      otpWhatsapp: true,
    });
    expect(on.status).toBe(200);
    const id = phone("0002");
    const r = await requestOtp(id, "whatsapp");
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("WHATSAPP_TEMPLATE_NO_VARIABLE");
    // Kembalikan toggle supaya tes lain tidak terpengaruh.
    await call("PATCH", "/admin/settings", admin.token, {
      otpWhatsapp: false,
    });
  });

  test("kanal yang baru dimatikan -> request CHANNEL_DISABLED", async () => {
    const admin = await adminOtp();
    const off = await call("PATCH", "/admin/settings", admin.token, {
      otpSms: false,
    });
    expect(off.status).toBe(200);
    const r = await requestOtp(phone("0003"), "sms");
    expect(r.status).toBe(400);
    expect(errCode(r)).toBe("CHANNEL_DISABLED");
    await call("PATCH", "/admin/settings", admin.token, { otpSms: true });
  });
});

describe("service OTP dengan jam palsu", () => {
  async function svc() {
    const mod = await import("../otp.js");
    const settings = await testDb.platformSettings();
    // Jam palsu dimulai 10 menit di depan jam nyata: tes kunci memakai
    // otpLogin HTTP dulu (kiriman jam nyata), dan request service
    // berikutnya tidak boleh kena OTP_COOLDOWN 60 detik gara-gara itu.
    let now = Date.now() + 10 * 60 * 1000;
    const deps = {
      now: () => now,
      generateCode: () => "123456",
      send: async () => ({ ok: true as const }),
    };
    return {
      mod,
      settings,
      deps,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  async function expectServiceCode(
    p: Promise<unknown>,
    code: string,
  ): Promise<void> {
    try {
      await p;
    } catch (e) {
      expect((e as { code?: string }).code).toBe(code);
      return;
    }
    throw new Error(`harusnya menolak dengan ${code}`);
  }

  test("kode kedaluwarsa setelah 5 menit", async () => {
    const { mod, settings, deps, advance } = await svc();
    const id = email("exp1");
    await mod.requestOtp(testDb, settings, { identifier: id }, deps);
    advance(5 * 60 * 1000 + 1000);
    await expectServiceCode(
      mod.verifyOtp(testDb, settings, { identifier: id, code: "123456" }, deps),
      "OTP_EXPIRED",
    );
  });

  test("cap 10 kiriman/jam per identifier", async () => {
    const { mod, settings, deps, advance } = await svc();
    const id = email("cap1");
    for (let i = 0; i < 10; i++) {
      await mod.requestOtp(testDb, settings, { identifier: id }, deps);
      advance(61 * 1000);
    }
    await expectServiceCode(
      mod.requestOtp(testDb, settings, { identifier: id }, deps),
      "OTP_HOURLY_CAP",
    );
  });

  test("kunci berakhir: setelah 15 menit bisa minta kode baru dan login", async () => {
    const { mod, settings, deps, advance } = await svc();
    const id = email("lockexp1");
    // Buat user dulu lewat alur HTTP supaya verify mengembalikan user.
    await otpLogin(id, { name: "Lock Expiry" });
    await mod.requestOtp(testDb, settings, { identifier: id }, deps);
    for (let i = 0; i < 5; i++) {
      try {
        await mod.verifyOtp(
          testDb,
          settings,
          { identifier: id, code: "000000" },
          deps,
        );
      } catch {
        // 4x INVALID_OTP, ke-5 OTP_LOCKED — keduanya diharapkan.
      }
    }
    await expectServiceCode(
      mod.verifyOtp(testDb, settings, { identifier: id, code: "123456" }, deps),
      "OTP_LOCKED",
    );
    advance(16 * 60 * 1000);
    await mod.requestOtp(testDb, settings, { identifier: id }, deps);
    const ok = await mod.verifyOtp(
      testDb,
      settings,
      { identifier: id, code: "123456" },
      deps,
    );
    expect(ok.user.email).toBe(id);
  });
});

describe("fallback SMS -> WhatsApp (OTP nomor HP)", () => {
  type SendResult = { ok: boolean; errorCode?: string };
  type Call = { channel: string; destination: string; code: string };

  async function svc(overrides: {
    email?: SendResult;
    sms?: SendResult;
    wa?: SendResult;
    whatsappOn?: boolean;
    // Offset jam palsu: default +10 menit seperti tes service lain.
    // Tes cooldown memakai 0 karena createdAt baris DB memakai jam
    // riil — dengan offset +10 menit, selisihnya selalu > 60 detik
    // sehingga cooldown tidak pernah terpicu.
    nowOffsetMs?: number;
  } = {}) {
    const mod = await import("../otp.js");
    const base = await testDb.platformSettings();
    const settings = {
      ...base,
      otpSms: true,
      otpWhatsapp: overrides.whatsappOn ?? true,
    };
    let now = Date.now() + (overrides.nowOffsetMs ?? 10 * 60 * 1000);
    const calls: Call[] = [];
    const send = async (
      channel: string,
      destination: string,
      code: string,
    ): Promise<SendResult> => {
      calls.push({ channel, destination, code });
      if (channel === "email") return overrides.email ?? { ok: true };
      if (channel === "sms") return overrides.sms ?? { ok: true };
      if (channel === "whatsapp") return overrides.wa ?? { ok: true };
      return { ok: true };
    };
    return {
      mod,
      settings,
      calls,
      deps: { now: () => now, generateCode: () => "123456", send },
      advance: (ms: number) => {
        now += ms;
      },
    };
  }

  async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
    try {
      await p;
    } catch (e) {
      expect((e as { code?: string }).code).toBe(code);
      return;
    }
    throw new Error(`harusnya menolak dengan ${code}`);
  }

  test("SMS gagal -> WhatsApp terkirim sekali dengan kode sama", async () => {
    const { mod, settings, calls, deps } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: true },
    });
    const id = phone("9101");
    const res = await mod.requestOtp(
      testDb,
      settings,
      { identifier: id, channel: "sms" },
      deps,
    );
    expect(res.channel).toBe("sms");
    expect(
      (res as unknown as { channelSent?: string }).channelSent,
    ).toBe("whatsapp");
    expect(calls.map((c) => c.channel)).toEqual(["sms", "whatsapp"]);
    expect(calls[1]!.code).toBe(calls[0]!.code);
    expect(calls[1]!.destination).toBe(id);
    const rows = await testDb.otpCodesFor(id);
    expect(rows.length).toBe(1);
    expect(rows[0]!.channel).toBe("sms");
    const verified = await mod.verifyOtp(
      testDb,
      settings,
      { identifier: id, code: "123456" },
      deps,
    );
    expect("needsName" in verified).toBe(true);
  });

  test("SMS berhasil -> WhatsApp tidak pernah dipanggil", async () => {
    const { mod, settings, calls, deps } = await svc({
      sms: { ok: true },
    });
    const id = phone("9102");
    const res = await mod.requestOtp(
      testDb,
      settings,
      { identifier: id, channel: "sms" },
      deps,
    );
    expect(
      (res as unknown as { channelSent?: string }).channelSent,
    ).toBe("sms");
    expect(calls.map((c) => c.channel)).toEqual(["sms"]);
  });

  test("SMS gagal + WhatsApp gagal -> error penyedia WA, tanpa baris kode", async () => {
    const { mod, settings, deps } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: false, errorCode: "DIKONTAK_SEND_FAILED" },
    });
    const id = phone("9103");
    await expectCode(
      mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps),
      "DIKONTAK_SEND_FAILED",
    );
    await expectCode(
      mod.verifyOtp(testDb, settings, { identifier: id, code: "123456" }, deps),
      "INVALID_OTP",
    );
  });

  test("SMS gagal + template WA belum diatur -> error template eksplisit", async () => {
    const { mod, settings, deps } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: false, errorCode: "WHATSAPP_TEMPLATE_NO_VARIABLE" },
    });
    const id = phone("9104");
    await expectCode(
      mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps),
      "WHATSAPP_TEMPLATE_NO_VARIABLE",
    );
  });

  test("SMS gagal + kanal WhatsApp nonaktif -> OTP_SEND_FAILED, WA tak dipanggil", async () => {
    const { mod, settings, calls, deps } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: true },
      whatsappOn: false,
    });
    const id = phone("9105");
    await expectCode(
      mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps),
      "OTP_SEND_FAILED",
    );
    expect(calls.map((c) => c.channel)).toEqual(["sms"]);
  });

  test("Email gagal -> tanpa fallback ke kanal lain", async () => {
    const { mod, settings, calls, deps } = await svc({
      email: { ok: false, errorCode: "OTP_SEND_FAILED" },
    });
    const id = email("fb1");
    await expectCode(
      mod.requestOtp(
        testDb,
        settings,
        { identifier: id, channel: "email" },
        deps,
      ),
      "OTP_SEND_FAILED",
    );
    expect(calls.map((c) => c.channel)).toEqual(["email"]);
  });

  test("WhatsApp langsung gagal -> tanpa fallback ke SMS", async () => {
    const { mod, settings, calls, deps } = await svc({
      wa: { ok: false, errorCode: "DIKONTAK_SEND_FAILED" },
    });
    const id = phone("9106");
    await expectCode(
      mod.requestOtp(
        testDb,
        settings,
        { identifier: id, channel: "whatsapp" },
        deps,
      ),
      "DIKONTAK_SEND_FAILED",
    );
    expect(calls.map((c) => c.channel)).toEqual(["whatsapp"]);
  });

  test("kirim ulang setelah fallback sukses kena cooldown 60 detik", async () => {
    const { mod, settings, deps } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: true },
      nowOffsetMs: 0,
    });
    const id = phone("9107");
    await mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps);
    await expectCode(
      mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps),
      "OTP_COOLDOWN",
    );
  });

  test("cap 10/jam dihitung satu per permintaan fallback", async () => {
    const { mod, settings, deps, advance } = await svc({
      sms: { ok: false, errorCode: "OTP_SEND_FAILED" },
      wa: { ok: true },
    });
    const id = phone("9108");
    for (let i = 0; i < 10; i++) {
      await mod.requestOtp(
        testDb,
        settings,
        { identifier: id, channel: "sms" },
        deps,
      );
      advance(61 * 1000);
    }
    await expectCode(
      mod.requestOtp(testDb, settings, { identifier: id, channel: "sms" }, deps),
      "OTP_HOURLY_CAP",
    );
  });
});
