// TDD RED — klien profil publik: GET /users/:slug/profile,
// USER_NOT_FOUND -> kunci i18n.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchPublicProfile } from "../utils/public-profile-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("fetchPublicProfile", () => {
  test("mengembalikan profil publik lengkap", async () => {
    mockFetch(200, {
      data: {
        profile: {
          id: "u1",
          name: "Bima Prasetyo",
          slug: "bima",
          isVerified: true,
          stats: { totalTrips: 48, finishedTrips: 40 },
          finishedTrips: [
            { id: "t1", name: "Pendakian Prau", type: "HIKING", date: "2026-10-11" },
          ],
        },
      },
    });
    const profile = await fetchPublicProfile("bima");
    expect(profile.name).toBe("Bima Prasetyo");
    expect(profile.stats.totalTrips).toBe(48);
    expect(profile.finishedTrips[0].name).toBe("Pendakian Prau");
  });

  test("USER_NOT_FOUND -> kunci i18n", async () => {
    mockFetch(404, { error: { code: "USER_NOT_FOUND" } });
    const err = await fetchPublicProfile("ghost").catch((e: unknown) => e);
    expect((err as { i18nKey: string }).i18nKey).toBe(
      "publicProfile.errors.notFound",
    );
  });
});
