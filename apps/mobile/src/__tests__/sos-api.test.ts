// TDD RED — klien SOS kontrak §4: POST sos {reason, lat, lon};
// SOS_ALREADY_ACTIVE 409 -> kunci i18n; INVALID_SOS_REASON -> kunci.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import { triggerSos } from "../utils/sos-api";

const realFetch = globalThis.fetch;
let lastRequest: { url: string; init?: RequestInit } | null = null;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    lastRequest = { url: String(url), init };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
  lastRequest = null;
});

describe("triggerSos", () => {
  test("POST /trip-groups/:id/sos payload kontrak §4", async () => {
    mockFetch(201, {
      data: {
        sos: {
          id: "s1",
          status: "ACTIVE",
          userId: "u1",
          reason: "CEDERA",
          level: "EMERGENCY",
        },
      },
    });
    const sos = await triggerSos("t1", {
      reason: "CEDERA",
      lat: -7.2,
      lon: 109.91,
    });
    expect(sos.level).toBe("EMERGENCY");
    expect(lastRequest?.url).toContain("/trip-groups/t1/sos");
    expect(lastRequest?.init?.method).toBe("POST");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.reason).toBe("CEDERA");
    expect(body.lat).toBe(-7.2);
  });

  test("409 SOS_ALREADY_ACTIVE -> kunci i18n", async () => {
    mockFetch(409, { error: { code: "SOS_ALREADY_ACTIVE" } });
    const err = await triggerSos("t1", {
      reason: "CEDERA",
      lat: 0,
      lon: 0,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.errors.alreadyActive");
  });

  test("INVALID_SOS_REASON -> kunci i18n", async () => {
    mockFetch(400, { error: { code: "INVALID_SOS_REASON" } });
    const err = await triggerSos("t1", {
      reason: "LAINNYA",
      lat: 0,
      lon: 0,
    }).catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("sos.errors.invalidReason");
  });
});
