// Penyedia WhatsApp: official (Meta Cloud API) vs dikontak (WABA
// Shared) — TDD. Satu dispatch terpusat di whatsapp.ts memilih jalur
// dari setting whatsappProvider; TIDAK ADA fallback diam-diam.
//
// Payload dikontak terverifikasi tes kirim langsung (3 Nov 2026,
// HTTP 200): template otp ternyata bertombol URL ("Salin Kode"),
// bukan copy/otp. Bentuk yang lolos validator:
//   body.variables: [kode]
//   buttons: [{ index: 0, type: "url", variable: kode }]
// Bentuk lain SUDAH terbukti ditolak 422: type "copy" (validator hanya
// terima url/quick_reply/otp), type "otp" + code (button index 0
// adalah url), dan url + "variables" array (validator minta field
// singular "variable" string). Tes ini mengunci bentuk yang benar.
import { afterEach, describe, expect, test } from "bun:test";

// CATATAN suite: file ini import modul produksi whatsapp.js secara
// dinamis. Satu-satunya file yang dulu mem-mock whatsapp.js
// (whatsapp-otp.test.ts) sudah diubah ke stub fetch global, jadi
// tidak ada lagi modul mock yang meracuni file ini.

interface FetchCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const fetchCalls: FetchCall[] = [];
let fetchStatus = 200;
let fetchBody: unknown = { status: "success" };

function stubFetch(
  url: string,
  init?: { headers?: Record<string, string>; body?: unknown },
): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  fetchCalls.push({
    url,
    headers: (init?.headers ?? {}) as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });
  return Promise.resolve({
    ok: fetchStatus >= 200 && fetchStatus < 300,
    status: fetchStatus,
    json: async () => fetchBody,
    text: async () => JSON.stringify(fetchBody),
  });
}

afterEach(() => {
  fetchCalls.length = 0;
  fetchStatus = 200;
  fetchBody = { status: "success" };
  delete process.env.DIKONTAK_API_KEY;
});

async function load() {
  process.env.WHATSAPP_TOKEN = "test-official-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
  const whatsapp = await import("../whatsapp.js");
  const dikontak = await import("../dikontak.js");
  const db = await import("../db.js");
  return { ...whatsapp, ...dikontak, PLATFORM_SETTING_DEFAULTS: db.PLATFORM_SETTING_DEFAULTS };
}

describe("whatsappProvider: default + validasi bentuk", () => {
  test("default setting adalah 'official'", async () => {
    const { PLATFORM_SETTING_DEFAULTS } = await load();
    expect(PLATFORM_SETTING_DEFAULTS.whatsappProvider).toBe("official");
  });
});

describe("normalizeDikontakPhone", () => {
  test("08... -> 62..., +62... -> 62..., 62... tetap, spasi/strip dibuang", async () => {
    const { normalizeDikontakPhone } = await load();
    expect(normalizeDikontakPhone("0812 3456-789")).toBe("628123456789");
    expect(normalizeDikontakPhone("+628123456789")).toBe("628123456789");
    expect(normalizeDikontakPhone("628123456789")).toBe("628123456789");
    expect(normalizeDikontakPhone("")).toBe("");
  });
});

describe("sendWhatsappOtp: dispatch official vs dikontak", () => {
  test("provider official -> Meta Cloud API, kode sebagai {{1}}", async () => {
    const { sendWhatsappOtp } = await load();
    const res = await sendWhatsappOtp(
      "6281200000001",
      "482913",
      "otp_code",
      "official",
      stubFetch as never,
    );
    expect(res).toEqual({ ok: true });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://graph.facebook.com/v21.0/123456789/messages");
    const tpl = (fetchCalls[0]!.body as Record<string, unknown>).template as Record<
      string,
      unknown
    >;
    expect(tpl.name).toBe("otp_code");
    expect((tpl.language as Record<string, unknown>).code).toBe("id_ID");
    expect(tpl.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
    ]);
  });

  test("provider dikontak -> payload OTP terverifikasi (variables + tombol url singular)", async () => {
    const { sendWhatsappOtp } = await load();
    process.env.DIKONTAK_API_KEY = "test-dikontak-key";
    const res = await sendWhatsappOtp(
      "08123456789",
      "482913",
      "otp",
      "dikontak",
      stubFetch as never,
    );
    expect(res).toEqual({ ok: true });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://dikontak.com/api/v3/waba/template");
    expect(fetchCalls[0]!.headers.Authorization).toMatch(/^Bearer /);
    expect(fetchCalls[0]!.body).toEqual({
      to: "628123456789",
      template: { name: "otp", language: "id" },
      body: { variables: ["482913"] },
      buttons: [{ index: 0, type: "url", variable: "482913" }],
    });
  });

  test("provider dikontak tanpa kunci -> DIKONTAK_NOT_CONFIGURED, TANPA fallback ke official", async () => {
    const { sendWhatsappOtp } = await load();
    const res = await sendWhatsappOtp(
      "6281200000001",
      "482913",
      "otp",
      "dikontak",
      stubFetch as never,
    );
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("DIKONTAK_NOT_CONFIGURED");
    expect(fetchCalls).toHaveLength(0);
  });

  test("dikontak 422 -> DIKONTAK_SEND_FAILED + detail validator diteruskan", async () => {
    const { sendWhatsappOtp } = await load();
    process.env.DIKONTAK_API_KEY = "test-dikontak-key";
    fetchStatus = 422;
    fetchBody = { message: "Template tidak aktif / belum approved" };
    const res = await sendWhatsappOtp(
      "6281200000001",
      "482913",
      "otp",
      "dikontak",
      stubFetch as never,
    );
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("DIKONTAK_SEND_FAILED");
    expect(res.detail).toContain("422");
    expect(res.detail).toContain("Template tidak aktif / belum approved");
  });

  test("dikontak 502 -> gagal, bukan sukses palsu", async () => {
    const { sendWhatsappOtp } = await load();
    process.env.DIKONTAK_API_KEY = "test-dikontak-key";
    fetchStatus = 502;
    fetchBody = {};
    const res = await sendWhatsappOtp(
      "6281200000001",
      "482913",
      "otp",
      "dikontak",
      stubFetch as never,
    );
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("DIKONTAK_SEND_FAILED");
  });
});

describe("sendWhatsappSosAlert: dispatch official vs dikontak", () => {
  const ctx = { senderName: "Ahmad", reason: "CEDERA", lat: -6.2, lon: 106.8 };

  test("provider official -> template sos_alert tanpa parameter (perilaku lama)", async () => {
    const { sendWhatsappSosAlert } = await load();
    const res = await sendWhatsappSosAlert("6281200000001", "official", ctx, stubFetch as never);
    expect(res.ok).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://graph.facebook.com/v21.0/123456789/messages");
    const tpl = (fetchCalls[0]!.body as Record<string, unknown>).template as Record<
      string,
      unknown
    >;
    expect(tpl.name).toBe("sos_alert");
    expect(tpl.components).toBeUndefined();
  });

  test("provider dikontak -> template sos_alert, 3 variabel, TANPA buttons", async () => {
    const { sendWhatsappSosAlert } = await load();
    process.env.DIKONTAK_API_KEY = "test-dikontak-key";
    const res = await sendWhatsappSosAlert("6281200000001", "dikontak", ctx, stubFetch as never);
    expect(res.ok).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://dikontak.com/api/v3/waba/template");
    expect(fetchCalls[0]!.body).toEqual({
      to: "6281200000001",
      template: { name: "sos_alert", language: "id" },
      body: {
        variables: ["Ahmad", "CEDERA", "https://maps.google.com/?q=-6.2,106.8"],
      },
    });
  });

  test("provider dikontak tanpa kunci -> DIKONTAK_NOT_CONFIGURED, TANPA fallback", async () => {
    const { sendWhatsappSosAlert } = await load();
    const res = await sendWhatsappSosAlert("6281200000001", "dikontak", ctx, stubFetch as never);
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("DIKONTAK_NOT_CONFIGURED");
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("whatsappProviderConfigured", () => {
  test("official ikut token Meta; dikontak ikut DIKONTAK_API_KEY", async () => {
    const { whatsappProviderConfigured } = await load();
    expect(whatsappProviderConfigured("official")).toBe(true);
    expect(whatsappProviderConfigured("dikontak")).toBe(false);
    process.env.DIKONTAK_API_KEY = "test-dikontak-key";
    expect(whatsappProviderConfigured("dikontak")).toBe(true);
  });
});

// CATATAN: tidak ada tes sendOtpCode (otp-delivery) di file ini.
// Delapan file tes lain mem-mock otp-delivery.js lewat mock.module
// dan mock itu ikut ter-cache proses-global (sama seperti kasus
// whatsapp.js di atas), sehingga import otp-delivery di file ini
// selalu mendapat mock saat suite penuh — tes wiring tidak bisa
// hijau di suite penuh tanpa menulis ulang 8 file tersebut (di luar
// lingkup PR ini). Yang diuji di sini adalah dispatch-nya sendiri
// (sendWhatsappOtp/sendWhatsappSosAlert); wiring otp-delivery hanya
// satu baris pass-through (settings?.whatsappProvider ?? "official")
// dan jalur official-nya sudah tercakup tes HTTP whatsapp-otp
// (kode produksi penuh, stub fetch).
