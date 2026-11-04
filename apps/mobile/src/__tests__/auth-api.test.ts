// Klien auth OTP (Wella 1 Nov 2026): channels, request, verify (sesi
// dan needsName) memetakan kode error server ({ error: { code } }) ke
// kunci i18n; server tidak pernah mengirim teks UI.
import { afterEach, describe, expect, jest, test } from "bun:test";

import {
  ApiError,
  getOtpChannels,
  requestOtp,
  verifyOtp,
} from "../utils/auth-api";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("harusnya melempar ApiError");
}

const user = { id: "u1", name: "Budi", slug: "budi" };

describe("getOtpChannels", () => {
  test("mengembalikan flag per kanal", async () => {
    mockFetch(200, { data: { email: true, sms: true, whatsapp: false } });
    await expect(getOtpChannels()).resolves.toEqual({
      email: true,
      sms: true,
      whatsapp: false,
    });
  });

  test("bentuk data salah -> unavailable", async () => {
    mockFetch(200, { data: { email: true } });
    const err = await expectApiError(getOtpChannels());
    expect(err.i18nKey).toBe("auth.errors.unavailable");
  });

  test("server mati -> unavailable (fail-soft, bukan crash)", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await expectApiError(getOtpChannels());
    expect(err.i18nKey).toBe("auth.errors.unavailable");
  });
});

describe("requestOtp", () => {
  test("sukses mengembalikan kanal + masa berlaku", async () => {
    mockFetch(200, { data: { channel: "sms", expiresInSeconds: 300 } });
    await expect(requestOtp("081234567890", "sms")).resolves.toEqual({
      channel: "sms",
      expiresInSeconds: 300,
    });
  });

  test("channelSent dari fallback diteruskan apa adanya", async () => {
    mockFetch(200, {
      data: { channel: "sms", expiresInSeconds: 300, channelSent: "whatsapp" },
    });
    await expect(requestOtp("081234567890", "sms")).resolves.toEqual({
      channel: "sms",
      expiresInSeconds: 300,
      channelSent: "whatsapp",
    });
  });

  test("CHANNEL_DISABLED dipetakan", async () => {
    mockFetch(400, { error: { code: "CHANNEL_DISABLED" } });
    const err = await expectApiError(requestOtp("081234567890", "whatsapp"));
    expect(err.i18nKey).toBe("auth.errors.channelDisabled");
  });

  test("OTP_COOLDOWN dipetakan", async () => {
    mockFetch(429, { error: { code: "OTP_COOLDOWN" } });
    const err = await expectApiError(requestOtp("a@b.co", "email"));
    expect(err.i18nKey).toBe("auth.errors.otpCooldown");
  });

  test("WHATSAPP_TEMPLATE_NO_VARIABLE dipetakan", async () => {
    mockFetch(400, { error: { code: "WHATSAPP_TEMPLATE_NO_VARIABLE" } });
    const err = await expectApiError(requestOtp("081234567890", "whatsapp"));
    expect(err.i18nKey).toBe("auth.errors.whatsappTemplateNoVariable");
  });
});

describe("verifyOtp", () => {
  test("sukses mengembalikan sesi", async () => {
    mockFetch(200, { data: { user, token: "jwt-abc" } });
    const result = await verifyOtp("a@b.co", "123456");
    expect(result).toEqual({
      session: { token: "jwt-abc", user, refreshToken: undefined },
    });
  });

  test("needsName dikembalikan apa adanya (bukan sesi palsu)", async () => {
    mockFetch(200, { data: { needsName: true, needsEmail: false } });
    await expect(verifyOtp("baru@b.co", "123456")).resolves.toEqual({
      needsName: true,
      needsEmail: false,
    });
  });

  test("needsEmail true untuk identifier HP baru", async () => {
    mockFetch(200, { data: { needsName: true, needsEmail: true } });
    await expect(verifyOtp("081234567890", "123456")).resolves.toEqual({
      needsName: true,
      needsEmail: true,
    });
  });

  test("INVALID_OTP / OTP_EXPIRED / OTP_LOCKED dipetakan", async () => {
    mockFetch(401, { error: { code: "INVALID_OTP" } });
    expect((await expectApiError(verifyOtp("a@b.co", "000000"))).i18nKey).toBe(
      "auth.errors.invalidOtpServer",
    );
    mockFetch(401, { error: { code: "OTP_EXPIRED" } });
    expect((await expectApiError(verifyOtp("a@b.co", "123456"))).i18nKey).toBe(
      "auth.errors.otpExpired",
    );
    mockFetch(429, { error: { code: "OTP_LOCKED" } });
    expect((await expectApiError(verifyOtp("a@b.co", "123456"))).i18nKey).toBe(
      "auth.errors.otpLocked",
    );
  });

  test("ACCOUNT_SUSPENDED dipetakan", async () => {
    mockFetch(401, { error: { code: "ACCOUNT_SUSPENDED" } });
    const err = await expectApiError(verifyOtp("a@b.co", "123456"));
    expect(err.i18nKey).toBe("auth.errors.suspended");
  });

  test("OTP_ONLY dipetakan (endpoint password lama)", async () => {
    mockFetch(410, { error: { code: "OTP_ONLY" } });
    const err = await expectApiError(verifyOtp("a@b.co", "123456"));
    expect(err.i18nKey).toBe("auth.errors.otpOnly");
  });
});

describe("timeout auth (spinner tidak boleh muter selamanya)", () => {
  // Fetch yang menggantung tapi patuh pada sinyal abort — seperti
  // koneksi yang stall di jalan (laporan user 3 Nov 16:30/16:44).
  function mockHangingFetch(): void {
    globalThis.fetch = ((_: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      })) as typeof fetch;
  }

  test("requestOtp yang menggantung -> auth.errors.timeout", async () => {
    mockHangingFetch();
    jest.useFakeTimers();
    try {
      const errPromise = expectApiError(requestOtp("a@b.co", "email"));
      jest.advanceTimersByTime(30000);
      const err = await errPromise;
      expect(err.i18nKey).toBe("auth.errors.timeout");
    } finally {
      jest.useRealTimers();
    }
  });

  test("verifyOtp yang menggantung -> auth.errors.timeout", async () => {
    mockHangingFetch();
    jest.useFakeTimers();
    try {
      const errPromise = expectApiError(verifyOtp("a@b.co", "123456"));
      jest.advanceTimersByTime(30000);
      const err = await errPromise;
      expect(err.i18nKey).toBe("auth.errors.timeout");
    } finally {
      jest.useRealTimers();
    }
  });

  test("gagal fetch biasa tetap unavailable (bukan timeout)", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await expectApiError(requestOtp("a@b.co", "email"));
    expect(err.i18nKey).toBe("auth.errors.unavailable");
  });
});
