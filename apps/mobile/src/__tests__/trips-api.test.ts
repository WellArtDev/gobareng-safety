// TDD RED — klien trip-groups (kontrak §2): daftar trip saya, anggota,
// start trip. Bearer token dari auth-store; error { error: { code } }
// -> kunci i18n; fail-soft.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import {
  closeTrip,
  fetchMyTrips,
  fetchTripMembers,
  fetchTripReport,
  startTrip,
} from "../utils/trips-api";

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

const tripBody = {
  id: "t1",
  name: "Pendakian Prau",
  type: "HIKING",
  date: "2026-10-25",
  meetingPoint: "Basecamp Patak Banteng",
  meetingLat: null,
  meetingLon: null,
  quota: null,
  isOpenTrip: false,
  status: "PLANNED",
  leaderId: "u1",
  createdAt: "2026-10-20T00:00:00.000Z",
};

describe("fetchMyTrips", () => {
  test("GET /trip-groups dengan Bearer token", async () => {
    mockFetch(200, { data: { trips: [tripBody] } });
    const trips = await fetchMyTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].name).toBe("Pendakian Prau");
    expect(lastRequest?.url).toContain("/api/v1/trip-groups");
    const headers = lastRequest?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer jwt-tes");
  });

  test("401 -> ApiError unauthorized", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED" } });
    const err = await fetchMyTrips().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("errors.unauthorized");
  });

  test("jaringan mati -> fail-soft ApiError unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await fetchMyTrips().catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("errors.unavailable");
  });
});

describe("fetchTripMembers", () => {
  test("GET /trip-groups/:id/members", async () => {
    mockFetch(200, {
      data: {
        members: [
          {
            tripId: "t1",
            userId: "u1",
            role: "LEADER",
            attendance: "NOT_DEPARTED",
            user: { id: "u1", name: "Bima", slug: "bima" },
          },
        ],
      },
    });
    const members = await fetchTripMembers("t1");
    expect(members[0].role).toBe("LEADER");
    expect(lastRequest?.url).toContain("/trip-groups/t1/members");
  });
});

describe("fetchTripReport (AI-R)", () => {
  const reportBody = {
    id: "r1",
    tripId: "t1",
    generatedById: "u1",
    summary: "Laporan stub.",
    model: "muse-spark-open",
    facts: {
      tripName: "Pendakian Prau",
      tripType: "HIKING",
      tripDate: "2026-10-25",
      meetingPoint: "Basecamp Patak Banteng",
      memberCount: 2,
      departedCount: 2,
      notDepartedCount: 0,
      attendance: [],
      checkpointCount: 1,
      checkInCount: 1,
      checkpoints: [],
      sosTotal: 0,
      sosByReason: [],
    },
    version: 1,
    isRegenerated: false,
    createdAt: "2026-10-26T00:00:00.000Z",
    updatedAt: "2026-10-26T00:00:00.000Z",
  };

  test("GET /trip-groups/:id/trip-report mengembalikan laporan", async () => {
    mockFetch(200, { data: { report: reportBody } });
    const report = await fetchTripReport("t1");
    expect(report.summary).toBe("Laporan stub.");
    expect(report.model).toBe("muse-spark-open");
    expect(report.facts.memberCount).toBe(2);
    expect(lastRequest?.url).toContain("/trip-groups/t1/trip-report");
  });

  test("404 diteruskan sebagai ApiError (layar = belum ada laporan)", async () => {
    mockFetch(404, { error: { code: "REPORT_NOT_FOUND" } });
    const err = await fetchTripReport("t1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe("closeTrip", () => {
  test("tanpa konfirmasi: POST body kosong", async () => {
    mockFetch(200, { data: { trip: { ...tripBody, status: "CLOSED" } } });
    const trip = await closeTrip("t1");
    expect(trip.status).toBe("CLOSED");
    expect(lastRequest?.url).toContain("/trip-groups/t1/close");
    expect(lastRequest?.init?.method).toBe("POST");
    expect(lastRequest?.init?.body).toBe("{}");
  });

  test("dengan confirmUnaccounted: body { confirmUnaccounted: true }", async () => {
    mockFetch(200, {
      data: { trip: { ...tripBody, status: "CLOSED" }, unaccountedCount: 1 },
    });
    await closeTrip("t1", true);
    expect(lastRequest?.init?.body).toBe(
      JSON.stringify({ confirmUnaccounted: true }),
    );
  });

  test("409 TRIP_HAS_UNACCOUNTED_MEMBERS -> kode dipertahankan untuk dialog konfirmasi", async () => {
    mockFetch(409, { error: { code: "TRIP_HAS_UNACCOUNTED_MEMBERS" } });
    const err = await closeTrip("t1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("TRIP_HAS_UNACCOUNTED_MEMBERS");
    expect((err as ApiError).i18nKey).toBe("errors.unaccountedMembers");
  });
});

describe("startTrip", () => {
  test("POST /trip-groups/:id/start mengembalikan trip", async () => {
    mockFetch(200, { data: { trip: { ...tripBody, status: "ACTIVE" } } });
    const trip = await startTrip("t1");
    expect(trip.status).toBe("ACTIVE");
    expect(lastRequest?.url).toContain("/trip-groups/t1/start");
    expect(lastRequest?.init?.method).toBe("POST");
  });

  test("403 FORBIDDEN -> kunci i18n forbidden", async () => {
    mockFetch(403, { error: { code: "FORBIDDEN" } });
    const err = await startTrip("t1").catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("errors.forbidden");
  });
});
