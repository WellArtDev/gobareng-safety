// Refresh token yang dirotasi server WAJIB ikut tersimpan (bukan cuma
// di memori): token lama di-revoke server saat rotasi, jadi sesi yang
// hanya di memori hilang saat force-close dan login diminta lagi.
import { afterEach, describe, expect, test } from "bun:test";

import { apiRequest, setSessionPersister } from "../utils/api-client";
import { ApiError } from "../utils/auth-api";
import {
  getRefreshToken,
  getSessionToken,
  setSessionCache,
} from "../utils/session-token";

const realFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(async () => {
  globalThis.fetch = realFetch;
  setSessionPersister(null);
  setSessionCache(undefined, undefined, undefined);
  // Gate `refreshing` di api-client di-reset lewat setTimeout(0) —
  // beri giliran supaya tidak bocor ke tes berikutnya.
  await new Promise((resolve) => setTimeout(resolve, 0));
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

describe("apiRequest + refresh rotation", () => {
  test("token hasil refresh diteruskan ke persister", async () => {
    setSessionCache("akses-lama", "Budi", "refresh-lama");
    let originalCalls = 0;
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(200, {
          data: {
            token: "akses-baru",
            refreshToken: "refresh-baru",
            user: { name: "Budi" },
          },
        });
      }
      originalCalls += 1;
      if (originalCalls === 1) {
        return jsonResponse(401, { error: { code: "UNAUTHORIZED" } });
      }
      return jsonResponse(200, { data: { ok: true } });
    }) as typeof fetch;

    const persisted: Array<{
      token: string;
      name: string | undefined;
      refreshToken: string;
    }> = [];
    setSessionPersister((token, name, refreshToken) => {
      persisted.push({ token, name, refreshToken });
    });

    await expect(apiRequest<{ ok: boolean }>("/trip-groups")).resolves.toEqual({
      ok: true,
    });
    expect(getSessionToken()).toBe("akses-baru");
    expect(getRefreshToken()).toBe("refresh-baru");
    expect(persisted).toEqual([
      { token: "akses-baru", name: "Budi", refreshToken: "refresh-baru" },
    ]);
  });

  test("tanpa persister, refresh tetap jalan (regresi)", async () => {
    setSessionCache("akses-lama", "Budi", "refresh-lama");
    let originalCalls = 0;
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(200, {
          data: {
            token: "akses-baru",
            refreshToken: "refresh-baru",
            user: { name: "Budi" },
          },
        });
      }
      originalCalls += 1;
      if (originalCalls === 1) {
        return jsonResponse(401, { error: { code: "UNAUTHORIZED" } });
      }
      return jsonResponse(200, { data: { ok: true } });
    }) as typeof fetch;

    await expect(apiRequest<{ ok: boolean }>("/trip-groups")).resolves.toEqual({
      ok: true,
    });
    expect(getSessionToken()).toBe("akses-baru");
  });

  test("refresh gagal -> unauthorized, persister tidak dipanggil", async () => {
    setSessionCache("akses-lama", "Budi", "refresh-lama");
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) {
        return jsonResponse(401, { error: { code: "UNAUTHORIZED" } });
      }
      return jsonResponse(401, { error: { code: "UNAUTHORIZED" } });
    }) as typeof fetch;

    let persistCalls = 0;
    setSessionPersister(() => {
      persistCalls += 1;
    });

    const err = await expectApiError(apiRequest("/trip-groups"));
    expect(err.i18nKey).toBe("errors.unauthorized");
    expect(persistCalls).toBe(0);
    expect(getSessionToken()).toBe("akses-lama");
  });
});
