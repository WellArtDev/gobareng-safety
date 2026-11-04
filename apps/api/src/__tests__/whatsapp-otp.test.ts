// OTP WhatsApp via template Meta Cloud API berparameter — TDD.
// Kode produksi otp-delivery.ts + otp.ts + admin settings diuji
// APA ADANYA (tanpa mock.module): fetch global di-stub HANYA untuk
// URL graph.facebook.com supaya tes TIDAK PERNAH menembak endpoint
// Meta live; panggilan lain (termasuk ke server tes lokal) diteruskan
// ke fetch asli. Alasan: mock.module("../whatsapp.js") BOCOR antar
// file dalam satu proses `bun test` (modul mock ikut ter-cache) dan
// merusak file tes lain yang import whatsapp.js (terbukti: 11 gagal
// saat digabung, 12 lolos saat standalone; mock.restore() tidak
// memulihkan modul yang sudah ter-cache). Stub fetch tidak meracuni
// modul apa pun — cukup dipulihkan di afterAll.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import type { Db } from "../db.js";

const PORT = 4193;
const BASE = `http://localhost:${PORT}/api/v1`;
const run = Date.now().toString(36);
const digits = String(Date.now() % 10000).padStart(4, "0");

// Tangkap kiriman template WA (tujuan, nama template, parameter),
// diparsing dari body request Meta yang dikirim kode produksi.
const waCalls: Array<{ to: string; template: string; params: string[] }> = [];
let waOk = true;
const realFetch = globalThis.fetch;
function metaStubFetch(url: unknown, init?: Record<string, unknown>) {
  const urlStr = String(url);
  if (!urlStr.includes("graph.facebook.com")) {
    return realFetch(url as never, init as never);
  }
  try {
    const body = JSON.parse(String((init as { body?: unknown } | undefined)?.body ?? "{}")) as {
      to?: string;
      template?: {
        name?: string;
        components?: Array<{
          parameters?: Array<{ text?: string }>;
        }>;
      };
    };
    waCalls.push({
      to: body.to ?? "",
      template: body.template?.name ?? "",
      params:
        body.template?.components?.[0]?.parameters?.map(
          (p) => p.text ?? "",
        ) ?? [],
    });
  } catch {
    // Body tak terparsasi: tetap jawab seperti Meta agar tes gagal
    // di asersi, bukan menggantung.
  }
  if (waOk) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.test" }] }),
      text: async () => "{}",
    });
  }
  return Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "meta stub failure" } }),
    text: async () => "meta stub failure",
  });
}

let http: Server;
let testDb: Db;
let adminToken = "";

// Timeout hook 30 dtk (default bun 5 dtk): import dingin + ready()
// terukur ~5,1 dtk di VM ini, sehingga beforeAll selalu timeout
// saat file dijalankan standalone — padahal lolos di suite penuh
// (modul sudah hangat oleh file sebelumnya).
beforeAll(async () => {
  process.env.ADMIN_EMAIL = `admin-${run}@t.local`;
  process.env.ADMIN_PASSWORD = `otp-admin-${run}`;
  // Kode produksi membaca token/nomor Meta dari snapshot config
  // saat import — jadi set SEBELUM import app.js. Nilai dummy:
  // fetch ke Meta sudah di-stub, tidak pernah keluar.
  // Nomor HARUS "123456789": snapshot config bersifat proses-global
  // (first import wins) dan whatsapp.test.ts + whatsapp-provider
  // .test.ts mengasersi URL dengan nomor itu.
  process.env.WHATSAPP_TOKEN = "test-meta-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  globalThis.fetch = metaStubFetch as never;
  const { createApp } = await import("../app.js");
  const { Db } = await import("../db.js");
  const { signToken } = await import("../auth.js");
  testDb = new Db();
  const { app, attachRealtime, ready } = createApp(testDb);
  http = createServer(app);
  attachRealtime(http);
  await ready;
  await new Promise<void>((resolve) => http.listen(PORT, resolve));
  // Token admin dibuat langsung (bypass OTP login — kanal email tidak
  // di-stub di file ini, dan yang diuji adalah setting + OTP WA).
  // Branch ini belum membawa skema nullable PR ganti-email, jadi
  // passwordHash masih wajib diisi (nilai dummy, tidak pernah dipakai).
  const admin = await testDb.createUser({
    email: `wa-admin-${run}@t.local`,
    name: "WA Admin",
    slug: `wa-admin-${run}`,
    passwordHash: "otp-only:test-dummy",
    phone: null,
    isAdmin: true,
    role: "admin",
    isVerified: true,
  });
  adminToken = signToken(admin);
}, 30000);

afterAll(() => {
  http?.close();
  globalThis.fetch = realFetch;
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

describe("setting template OTP WhatsApp (admin)", () => {
  test("nama template valid tersimpan; nama tak valid ditolak", async () => {
    const ok = await call("PATCH", "/admin/settings", adminToken, {
      otpWhatsapp: true,
      otpWhatsappTemplate: "otp_code",
    });
    expect(ok.status).toBe(200);
    expect((data(ok).settings as Json).otpWhatsappTemplate).toBe("otp_code");
    const bad = await call("PATCH", "/admin/settings", adminToken, {
      otpWhatsappTemplate: "Bad Name!",
    });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe("INVALID_PAYLOAD");
  });
});

describe("OTP WhatsApp lewat template Meta", () => {
  test("template belum diatur -> error eksplisit, TIDAK ada kiriman & TIDAK ada fallback", async () => {
    await call("PATCH", "/admin/settings", adminToken, {
      otpWhatsapp: true,
      otpWhatsappTemplate: "",
    });
    const before = waCalls.length;
    const phone = `628120000${digits}`;
    const req = await call("POST", "/auth/otp/request", undefined, {
      identifier: phone,
      channel: "whatsapp",
    });
    expect(req.status).toBe(400);
    expect(errCode(req)).toBe("WHATSAPP_TEMPLATE_NO_VARIABLE");
    // Tidak ada upaya kirim sama sekali — dan bukan 200 lewat kanal lain.
    expect(waCalls.length).toBe(before);
  });

  test("template diatur -> kode terkirim sebagai {{1}} dan bisa diverifikasi", async () => {
    await call("PATCH", "/admin/settings", adminToken, {
      otpWhatsapp: true,
      otpWhatsappTemplate: "otp_code",
    });
    const phone = `628129991${digits}`;
    const req = await call("POST", "/auth/otp/request", undefined, {
      identifier: phone,
      channel: "whatsapp",
    });
    expect(req.status).toBe(200);
    expect(waCalls.length).toBeGreaterThan(0);
    const last = waCalls[waCalls.length - 1]!;
    expect(last.to).toBe(phone);
    expect(last.template).toBe("otp_code");
    expect(last.params).toHaveLength(1);
    expect(last.params[0]).toMatch(/^\d{6}$/);
    // Kode dari stub template = kode yang diverifikasi (loop penuh).
    const first = await call("POST", "/auth/otp/verify", undefined, {
      identifier: phone,
      code: last.params[0],
    });
    expect(first.status).toBe(200);
    expect((data(first) as Json).needsName).toBe(true);
    expect((data(first) as Json).needsEmail).toBe(true);
    const second = await call("POST", "/auth/otp/verify", undefined, {
      identifier: phone,
      code: last.params[0],
      name: "WA User",
      email: `wa-user-${run}@t.local`,
    });
    expect(second.status).toBe(200);
    expect(((data(second) as Json).user as Json).phone).toBe(phone);
  });

  test("pengiriman Meta gagal -> 503 OTP_SEND_FAILED, bukan fallback", async () => {
    waOk = false;
    try {
      const phone = `628128882${digits}`;
      const req = await call("POST", "/auth/otp/request", undefined, {
        identifier: phone,
        channel: "whatsapp",
      });
      expect(req.status).toBe(503);
      expect(errCode(req)).toBe("OTP_SEND_FAILED");
    } finally {
      waOk = true;
    }
  });
});

describe("cabang whatsapp otp-delivery (service level)", () => {
  test("template kosong -> WHATSAPP_TEMPLATE_NO_VARIABLE; terisi -> ok", async () => {
    const { sendOtpCode } = await import("../otp-delivery.js");
    const before = waCalls.length;
    const noTemplate = await sendOtpCode("whatsapp", "6281000000001", "123456", {
      otpWhatsappTemplate: "",
    } as never);
    expect(noTemplate).toEqual({ ok: false, errorCode: "WHATSAPP_TEMPLATE_NO_VARIABLE" });
    expect(waCalls.length).toBe(before);
    const withTemplate = await sendOtpCode("whatsapp", "6281000000002", "654321", {
      otpWhatsappTemplate: "otp_code",
    } as never);
    expect(withTemplate).toEqual({ ok: true });
    const last = waCalls[waCalls.length - 1]!;
    expect(last.template).toBe("otp_code");
    expect(last.params).toEqual(["654321"]);
  });
});
