// Unit: Brevo sender fail-soft + matriks channelEnabled.
// Tidak menyentuh DB / jaringan asli: fetch di-stub, dan kunci Brevo
// kosong di env tes sehingga semua kirim dilewati (false) kecuali
// jalur yang di-stub lewat argumen fetch.
import { describe, expect, test } from "bun:test";
import {
  brevoConfigured,
  effectiveBrevoWhatsappSenderNumber,
  effectiveBrevoWhatsappTemplateId,
  sendBrevoEmail,
  sendBrevoSms,
  sendBrevoWhatsapp,
} from "../brevo.js";
import { channelEnabled } from "../notify-channels.js";
import { PLATFORM_SETTING_DEFAULTS, type PlatformSettings } from "../db.js";

describe("brevo fail-soft", () => {
  test("tanpa BREVO_API_KEY: configured false, semua kirim false tanpa throw", async () => {
    expect(brevoConfigured()).toBe(false);
    expect(await sendBrevoEmail("a@b.test", "x", "y")).toBe(false);
    expect(await sendBrevoSms("62812", "hi")).toBe(false);
    expect(await sendBrevoWhatsapp("62812")).toBe(false);
  });

  test("stub fetch tidak pernah dipanggil saat kunci kosong", async () => {
    let calls = 0;
    const stub = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await sendBrevoEmail("a@b.test", "x", "y", stub);
    expect(calls).toBe(0);
  });
});

describe("setting Brevo dashboard diutamakan atas env", () => {
  test("setting terisi dipakai, setting kosong fallback ke env (kosong di tes)", () => {
    const filled = {
      ...PLATFORM_SETTING_DEFAULTS,
      brevoWhatsappSenderNumber: "628123456789",
      brevoWhatsappTemplateId: "123456",
    };
    expect(effectiveBrevoWhatsappSenderNumber(filled)).toBe("628123456789");
    expect(effectiveBrevoWhatsappTemplateId(filled)).toBe(123456);
    expect(effectiveBrevoWhatsappSenderNumber(PLATFORM_SETTING_DEFAULTS)).toBe("");
    expect(effectiveBrevoWhatsappTemplateId(PLATFORM_SETTING_DEFAULTS)).toBe(0);
  });
});

describe("channelEnabled", () => {
  const s: PlatformSettings = { ...PLATFORM_SETTING_DEFAULTS };
  test("verify/checkin butuh master aktif", () => {
    expect(channelEnabled(s, "verify", "email")).toBe(true);
    expect(channelEnabled({ ...s, notifVerify: false }, "verify", "email")).toBe(false);
    expect(channelEnabled({ ...s, notifCheckin: false }, "checkin", "sms")).toBe(false);
  });
  test("regist/sos hanya kunci kanal", () => {
    expect(channelEnabled(s, "sos", "whatsapp")).toBe(true);
    expect(channelEnabled({ ...s, notifSosWhatsapp: false }, "sos", "whatsapp")).toBe(false);
    expect(channelEnabled({ ...s, notifRegistSms: false }, "regist", "sms")).toBe(false);
  });
});
