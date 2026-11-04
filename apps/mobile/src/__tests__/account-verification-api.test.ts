// TDD — klien verifikasi akun dua kanal: kontrak respons endpoint
// status/request/verify + pemetaan kode error server ke kunci i18n.
// Layarnya sendiri tidak dirender di tes (pola repo: logika + API saja).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  fetchVerificationStatus,
  requestEmailLink,
  requestWhatsappCode,
  verificationErrorKey,
  verifyWhatsappCode,
} from "../utils/account-verification-api";
import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

function stubFetch(
  ok: boolean,
  json: unknown,
  status = 200,
): Array<{ url: string; method: string; body: unknown }> {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = (async (url: unknown, init?: Record<string, unknown>) => {
    calls.push({
      url: String(url),
      method: (init?.method as string) ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok,
      status,
      json: async () => json,
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

describe("fetchVerificationStatus", () => {
  test("GET status mengembalikan kedua kanal + organizer", async () => {
    stubFetch(true, {
      data: {
        email: "budi@t.local",
        emailVerified: true,
        phone: "62812",
        phoneVerified: false,
        accountVerified: false,
        organizerVerified: false,
      },
    });
    const s = await fetchVerificationStatus();
    expect(s.emailVerified).toBe(true);
    expect(s.phoneVerified).toBe(false);
    expect(s.accountVerified).toBe(false);
    expect(s.organizerVerified).toBe(false);
  });
});

describe("requestEmailLink / requestWhatsappCode / verifyWhatsappCode", () => {
  test("request link mengembalikan sent + expiry", async () => {
    const calls = stubFetch(true, {
      data: { sent: true, expiresInSeconds: 86400 },
    });
    const r = await requestEmailLink();
    expect(r.sent).toBe(true);
    expect(calls[0].url).toContain("/account-verification/email/request");
    expect(calls[0].method).toBe("POST");
  });

  test("request kode WA mengembalikan channel + expiry", async () => {
    stubFetch(true, {
      data: { channel: "whatsapp", expiresInSeconds: 300 },
    });
    const r = await requestWhatsappCode();
    expect(r.channel).toBe("whatsapp");
  });

  test("verify kode WA mengembalikan phoneVerified + accountVerified", async () => {
    const calls = stubFetch(true, {
      data: { phoneVerified: true, accountVerified: true },
    });
    const r = await verifyWhatsappCode("123456");
    expect(r.phoneVerified).toBe(true);
    expect(r.accountVerified).toBe(true);
    expect(calls[0].body).toEqual({ code: "123456" });
  });

  test("kode WA 6 digit divalidasi sisi klien", async () => {
    stubFetch(true, { data: {} });
    await expect(verifyWhatsappCode("123")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("verificationErrorKey", () => {
  test("kode server dipetakan ke kunci i18n verifikasi", () => {
    expect(verificationErrorKey("PHONE_NOT_SET")).toBe(
      "profile.accountVerification.errors.phoneMissing",
    );
    expect(verificationErrorKey("EMAIL_LINK_COOLDOWN")).toBe(
      "profile.accountVerification.errors.linkCooldown",
    );
    expect(verificationErrorKey("EMAIL_SEND_FAILED")).toBe(
      "profile.accountVerification.errors.linkSendFailed",
    );
    expect(verificationErrorKey("CHANNEL_DISABLED")).toBe(
      "profile.accountVerification.errors.channelDisabled",
    );
    expect(verificationErrorKey("INVALID_OTP")).toBe(
      "profile.accountVerification.errors.codeInvalid",
    );
    expect(verificationErrorKey("OTP_EXPIRED")).toBe(
      "profile.accountVerification.errors.codeExpired",
    );
    expect(verificationErrorKey("OTP_LOCKED")).toBe(
      "profile.accountVerification.errors.codeLocked",
    );
  });

  test("kode tak dikenal jatuh ke generic", () => {
    expect(verificationErrorKey("SESUATU")).toBe("errors.invalidPayload");
    expect(verificationErrorKey(null)).toBe("errors.invalidPayload");
  });
});
