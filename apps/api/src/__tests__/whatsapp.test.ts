// Pengirim template Meta (whatsapp.ts) — unit test dengan fetch
// stub: tidak ada jaringan ke graph.facebook.com. Membuktikan
// refactor ke sendWhatsappTemplate tidak mengubah perilaku SOS
// (template tanpa parameter) dan parameter body dikirim berurutan
// untuk template OTP.
import { afterEach, describe, expect, test } from "bun:test";

const fetchCalls: Array<{ url: string; body: unknown }> = [];
let fetchStatus = 200;

function stubFetch(url: string, init?: { body?: unknown }): Promise<{ ok: boolean; status: number }> {
  fetchCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
  return Promise.resolve({ ok: fetchStatus >= 200 && fetchStatus < 300, status: fetchStatus });
}

afterEach(() => {
  fetchCalls.length = 0;
  fetchStatus = 200;
});

describe("sendWhatsappTemplate (fetch stub)", () => {
  test("SOS: template sos_alert tanpa components; OTP: {{1}} sebagai parameter body", async () => {
    process.env.WHATSAPP_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    const { sendSosWhatsapp, sendWhatsappTemplate } = await import("../whatsapp.js");
    const origFetch = globalThis.fetch;
    globalThis.fetch = stubFetch as never;
    try {
      expect(await sendSosWhatsapp("6281200000001")).toBe(true);
      expect(await sendWhatsappTemplate("6281200000002", "otp_code", ["482913"])).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]!.url).toBe(
      "https://graph.facebook.com/v21.0/123456789/messages",
    );
    const sosBody = fetchCalls[0]!.body as Record<string, unknown>;
    expect((sosBody.template as Record<string, unknown>).name).toBe("sos_alert");
    expect((sosBody.template as Record<string, unknown>).components).toBeUndefined();
    const otpBody = fetchCalls[1]!.body as Record<string, unknown>;
    const tpl = otpBody.template as Record<string, unknown>;
    expect(tpl.name).toBe("otp_code");
    expect((tpl.language as Record<string, unknown>).code).toBe("id_ID");
    expect(tpl.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
    ]);
  });

  test("HTTP non-2xx -> false, tidak throw", async () => {
    process.env.WHATSAPP_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    const { sendWhatsappTemplate } = await import("../whatsapp.js");
    fetchStatus = 400;
    const origFetch = globalThis.fetch;
    globalThis.fetch = stubFetch as never;
    try {
      expect(await sendWhatsappTemplate("6281200000003", "otp_code", ["111111"])).toBe(false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
