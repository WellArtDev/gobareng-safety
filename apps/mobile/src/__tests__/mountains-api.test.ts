// TDD — klien katalog gunung (kontrak §10): daftar gunung, detail
// gunung + jalur. Bearer dari session; error { error: { code } } ->
// kunci i18n; fail-soft.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import {
  fetchMountain,
  fetchMountainRoute,
  fetchMountains,
} from "../utils/mountains-api";
import { setSessionCache } from "../utils/session-token";

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

const mountainBody = {
  id: "prau",
  name: "Prau",
  elevationM: 2565,
  location: "Dieng, Jawa Tengah",
  difficultyKey: "wizard.diffBeginner",
};

describe("fetchMountains", () => {
  test("GET /mountains dengan Bearer", async () => {
    mockFetch(200, { data: { mountains: [mountainBody] } });
    const mountains = await fetchMountains();
    expect(mountains).toHaveLength(1);
    expect(mountains[0].name).toBe("Prau");
    expect(lastRequest?.url).toContain("/api/v1/mountains");
    const headers = lastRequest?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer jwt-tes");
  });

  test("401 -> ApiError unauthorized", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED" } });
    const err = await fetchMountains().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("errors.unauthorized");
  });
});

describe("fetchMountain", () => {
  test("GET /mountains/:id mengembalikan detail + jalur", async () => {
    mockFetch(200, {
      data: {
        mountain: {
          ...mountainBody,
          imageUrl: "https://example.com/prau.jpg",
          province: "Jawa Tengah",
          description: "Gunung di Dieng.",
          volcanoActive: false,
          routeCount: 1,
          lat: -7.19,
          lon: 109.92,
          routes: [
            {
              id: "patak-banteng",
              mountainId: "prau",
              name: "Patak Banteng",
              meetingPoint: "Basecamp Patak Banteng",
              distanceKm: 3.2,
              gainM: 480,
              estHours: 3,
              recommended: true,
            },
          ],
        },
      },
    });
    const mountain = await fetchMountain("prau");
    expect(mountain.name).toBe("Prau");
    expect(mountain.imageUrl).toBe("https://example.com/prau.jpg");
    expect(mountain.province).toBe("Jawa Tengah");
    expect(mountain.description).toBe("Gunung di Dieng.");
    expect(mountain.volcanoActive).toBe(false);
    expect(mountain.routeCount).toBe(1);
    expect(mountain.routes).toHaveLength(1);
    expect(mountain.routes[0].name).toBe("Patak Banteng");
    expect(lastRequest?.url).toContain("/api/v1/mountains/prau");
  });
});

describe("fetchMountainRoute", () => {
  test("GET /mountains/:id/routes/:routeId mengembalikan route + track + posts + checkpoints", async () => {
    mockFetch(200, {
      data: {
        route: {
          id: "patak-banteng",
          mountainId: "prau",
          name: "Patak Banteng",
          meetingPoint: "Basecamp Patak Banteng",
          distanceKm: 3.2,
          gainM: 480,
          estHours: 3,
          recommended: true,
          track: [
            [
              [109.9, -7.19],
              [109.92, -7.18],
            ],
          ],
          // Server mengirim posts sebagai NAMA (bukan objek koordinat);
          // objek koordinat hidup di checkpoints.
          posts: ["Basecamp", "Puncak Prau"],
          checkpoints: [
            {
              name: "Basecamp",
              order: 0,
              lat: -7.19,
              lon: 109.9,
              elevationM: null,
              autoCheckpoint: false,
              isTarget: false,
              tags: [],
              isGathering: false,
            },
            {
              name: "Puncak Prau",
              order: 1,
              lat: -7.18,
              lon: 109.92,
              elevationM: 2565,
              autoCheckpoint: true,
              isTarget: true,
              tags: ["Peak"],
              isGathering: false,
            },
          ],
        },
      },
    });
    const route = await fetchMountainRoute("prau", "patak-banteng");
    expect(route.name).toBe("Patak Banteng");
    expect(route.track).toHaveLength(1);
    expect(route.posts).toEqual(["Basecamp", "Puncak Prau"]);
    expect(route.checkpoints).toHaveLength(2);
    expect(route.checkpoints[1].elevationM).toBe(2565);
    expect(route.checkpoints[1].isTarget).toBe(true);
    expect(lastRequest?.url).toContain(
      "/api/v1/mountains/prau/routes/patak-banteng",
    );
  });

  test("track null tetap dikembalikan (bukan hilang)", async () => {
    mockFetch(200, {
      data: {
        route: {
          id: "r1",
          mountainId: "prau",
          name: "R1",
          meetingPoint: "BC",
          distanceKm: null,
          gainM: null,
          estHours: null,
          recommended: false,
          track: null,
          posts: ["Basecamp"],
          checkpoints: [],
        },
      },
    });
    const route = await fetchMountainRoute("prau", "r1");
    expect(route.track).toBeNull();
    expect(route.posts).toEqual(["Basecamp"]);
  });

  test("404 -> ApiError", async () => {
    mockFetch(404, { error: { code: "NOT_FOUND" } });
    const err = await fetchMountainRoute("prau", "tidak-ada").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
  });
});
