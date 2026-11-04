// TDD — guard audit Nov 2026: fail-fast API URL, mapping error SOS,
// BottomNav nested.
import { afterEach, describe, expect, test } from "bun:test";

import { apiBaseUrl } from "../utils/config";
import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import { triggerSos } from "../utils/sos-api";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("audit-fix: fail-fast API URL", () => {
  test("EXPO_PUBLIC_API_URL diset -> dipakai, trailing slash dibuang", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://api.gobareng.app/";
    expect(apiBaseUrl()).toBe("https://api.gobareng.app");
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  test("__DEV__ tanpa env -> throw dengan instruksi jelas", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    (globalThis as Record<string, unknown>).__DEV__ = true;
    expect(() => apiBaseUrl()).toThrow("EXPO_PUBLIC_API_URL");
    delete (globalThis as Record<string, unknown>).__DEV__;
  });
});

describe("audit-fix: SOS_REASON_INVALID_FOR_TRIP_TYPE", () => {
  test("400 SOS_REASON_INVALID_FOR_TRIP_TYPE -> kunci invalidReason", async () => {
    setSessionCache("jwt-tes", "Budi");
    mockFetch(400, { error: { code: "SOS_REASON_INVALID_FOR_TRIP_TYPE" } });
    const err = await triggerSos("t1", {
      reason: "CEDERA",
      lat: 0,
      lon: 0,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.errors.invalidReason");
  });
});
