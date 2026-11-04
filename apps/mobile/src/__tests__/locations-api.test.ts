// TDD RED — klien lokasi kontrak §3: GET positions (anggota + posisi
// terakhir, location bisa null) + POST ingest posisi + GET sos aktif §4.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchActiveSos, fetchPositions, postLocation } from "../utils/locations-api";
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

describe("fetchPositions", () => {
  test("GET /trip-groups/:id/positions; location null dipertahankan", async () => {
    mockFetch(200, {
      data: {
        positions: [
          {
            userId: "u1",
            role: "LEADER",
            user: { id: "u1", name: "Bima", slug: "bima" },
            location: {
              id: "l1",
              tripId: "t1",
              userId: "u1",
              lat: -7.2,
              lon: 109.91,
              altitude: 2140,
              batteryLevel: 80,
              ts: "2026-10-28T01:00:00.000Z",
            },
          },
          {
            userId: "u2",
            role: "MEMBER",
            user: { id: "u2", name: "Sinta", slug: "sinta" },
            location: null,
          },
        ],
      },
    });
    const positions = await fetchPositions("t1");
    expect(positions).toHaveLength(2);
    expect(positions[0].location?.lat).toBe(-7.2);
    expect(positions[1].location).toBeNull();
    expect(lastRequest?.url).toContain("/trip-groups/t1/positions");
  });
});

describe("postLocation", () => {
  test("POST /trip-groups/:id/locations dengan payload kontrak §3", async () => {
    mockFetch(201, { data: { location: { id: "l9" } } });
    await postLocation("t1", {
      lat: -7.19,
      lon: 109.92,
      accuracy: 8,
      altitude: 2200,
      batteryLevel: 65,
      timestamp: "2026-10-28T01:05:00.000Z",
    });
    expect(lastRequest?.url).toContain("/trip-groups/t1/locations");
    expect(lastRequest?.init?.method).toBe("POST");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.lat).toBe(-7.19);
    expect(body.timestamp).toBe("2026-10-28T01:05:00.000Z");
  });
});

describe("fetchActiveSos", () => {
  test("GET /trip-groups/:id/sos -> hanya yang belum resolve/cancel", async () => {
    mockFetch(200, {
      data: {
        sos: [
          { id: "s1", status: "ACTIVE", userId: "u1", reason: "CEDERA" },
          { id: "s2", status: "RESOLVED", userId: "u2", reason: "CEDERA" },
          { id: "s3", status: "ACKNOWLEDGED", userId: "u3", reason: "SESAT" },
        ],
      },
    });
    const active = await fetchActiveSos("t1");
    expect(active.map((s) => s.id)).toEqual(["s1", "s3"]);
  });
});
