// TDD RED — klien share-link kontrak §16: buat/daftar/cabut tautan
// (auth member) + tampilan pantau publik tanpa auth; URL pantau.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createShareLink,
  fetchSharedTrip,
  fetchShareLinks,
  revokeShareLink,
  watchUrlForToken,
} from "../utils/share-api";
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

const linkBody = {
  id: "l1",
  tripId: "t1",
  label: "Keluarga",
  scope: "EMERGENCY_CONTACT",
  token: "abc123token",
  createdBy: "u1",
};

describe("createShareLink", () => {
  test("POST /trip-groups/:id/share-links {label, scope}", async () => {
    mockFetch(201, { data: { shareLink: linkBody } });
    const link = await createShareLink("t1", "Keluarga", "EMERGENCY_CONTACT");
    expect(link.token).toBe("abc123token");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.scope).toBe("EMERGENCY_CONTACT");
  });
});

describe("fetchShareLinks", () => {
  test("GET /trip-groups/:id/share-links", async () => {
    mockFetch(200, { data: { shareLinks: [linkBody] } });
    const links = await fetchShareLinks("t1");
    expect(links).toHaveLength(1);
    expect(lastRequest?.url).toContain("/trip-groups/t1/share-links");
  });
});

describe("revokeShareLink", () => {
  test("DELETE /trip-groups/:id/share-links/:linkId", async () => {
    mockFetch(200, { data: { revoked: true } });
    await revokeShareLink("t1", "l1");
    expect(lastRequest?.init?.method).toBe("DELETE");
  });
});

describe("fetchSharedTrip (publik, tanpa auth)", () => {
  test("GET /shared-trips/:token mengembalikan trip + positions + status", async () => {
    mockFetch(200, {
      data: {
        trip: { id: "t1", name: "Pendakian Gede", type: "HIKING", status: "ACTIVE" },
        locations: [],
        positions: [
          {
            userId: "u1",
            role: "LEADER",
            user: { id: "u1", name: "Bima", slug: "bima" },
            location: null,
          },
        ],
        activeSos: [],
        status: "SAFE",
      },
    });
    const view = await fetchSharedTrip("abc123token");
    expect(view.status).toBe("SAFE");
    expect(view.positions[0].user.name).toBe("Bima");
    expect(lastRequest?.url).toContain("/shared-trips/abc123token");
  });

  test("404 SHARE_LINK_NOT_FOUND -> kunci i18n", async () => {
    mockFetch(404, { error: { code: "SHARE_LINK_NOT_FOUND" } });
    const err = await fetchSharedTrip("mati").catch((e: unknown) => e);
    expect((err as { i18nKey: string }).i18nKey).toBe("share.errors.linkGone");
  });
});

describe("watchUrlForToken", () => {
  test("menunjuk landing web posko (bukan api base)", () => {
    expect(watchUrlForToken("x7k2")).toBe(
      "https://posko.gobareng.app/pantau/x7k2",
    );
  });
});
