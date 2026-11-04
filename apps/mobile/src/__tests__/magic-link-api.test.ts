// Klien magic link juri (Wella 3 Nov 2026): tukar token tautan jadi sesi
// penuh; kode error server dipetakan ke kunci i18n seperti klien OTP.
import { afterEach, describe, expect, test } from "bun:test";

import { ApiError, redeemMagicLink } from "../utils/auth-api";

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

describe("redeemMagicLink", () => {
  test("sukses -> sesi penuh", async () => {
    mockFetch(200, {
      data: {
        user: { id: "u1", name: "Juri", slug: "juri" },
        token: "access",
        refreshToken: "refresh",
      },
    });
    await expect(redeemMagicLink("tok")).resolves.toEqual({
      token: "access",
      user: { id: "u1", name: "Juri", slug: "juri" },
      refreshToken: "refresh",
    });
  });

  test("401 INVALID_MAGIC_LINK -> kunci invalid", async () => {
    mockFetch(401, { error: { code: "INVALID_MAGIC_LINK" } });
    const err = await expectApiError(redeemMagicLink("salah"));
    expect(err.i18nKey).toBe("auth.errors.magicLinkInvalid");
  });

  test("410 MAGIC_LINK_EXPIRED -> kunci expired", async () => {
    mockFetch(410, { error: { code: "MAGIC_LINK_EXPIRED" } });
    const err = await expectApiError(redeemMagicLink("kedaluwarsa"));
    expect(err.i18nKey).toBe("auth.errors.magicLinkExpired");
  });

  test("bentuk data salah -> unavailable", async () => {
    mockFetch(200, { data: { user: null } });
    const err = await expectApiError(redeemMagicLink("tok"));
    expect(err.i18nKey).toBe("auth.errors.unavailable");
  });
});
