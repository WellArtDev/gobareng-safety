// Klien Ringkasan AI (S4) + generate Laporan (AI-R) untuk detail trip
// selesai: GET ai-summary read-only, POST trip-report generate/
// regenerate (leader/admin, CLOSED, gate aiR — semua ditegakkan server).
// Tidak ada teks karangan: gagal = ApiError dengan kunci i18n jujur.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import {
  fetchAiSummary,
  generateTripReport,
  type TripReport,
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

const reportBody: TripReport = {
  id: "r1",
  tripId: "t1",
  generatedById: "u1",
  summary: "Trip selesai dengan selamat, semua anggota kembali.",
  model: "muse-spark-open",
  facts: {
    tripName: "ke warjok",
    tripType: "TOURING",
    tripDate: "2026-11-03",
    meetingPoint: "Sawangan",
    memberCount: 1,
    departedCount: 0,
    notDepartedCount: 1,
    attendance: [],
    checkpointCount: 0,
    checkInCount: 0,
    checkpoints: [],
    sosTotal: 0,
    sosByReason: [],
  },
  version: 1,
  isRegenerated: false,
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T00:00:00.000Z",
};

describe("fetchAiSummary", () => {
  test("GET /trip-groups/:id/ai-summary, kembalikan summary + model", async () => {
    mockFetch(200, {
      data: {
        summary: "Semua anggota terpantau, tidak ada SOS aktif.",
        model: "muse-spark-open",
        generatedAt: "2026-11-03T00:00:00.000Z",
      },
    });
    const result = await fetchAiSummary("t1");
    expect(lastRequest?.url).toContain("/api/v1/trip-groups/t1/ai-summary");
    expect(result.summary).toContain("tidak ada SOS aktif");
    expect(result.model).toBe("muse-spark-open");
  });

  test("503 AI_NOT_CONFIGURED -> kunci aiUnavailable (bukan karangan)", async () => {
    mockFetch(503, { error: { code: "AI_NOT_CONFIGURED" } });
    let caught: unknown;
    try {
      await fetchAiSummary("t1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).i18nKey).toBe("errors.aiUnavailable");
  });
});

describe("generateTripReport", () => {
  test("POST /trip-groups/:id/trip-report, kembalikan laporan", async () => {
    mockFetch(201, { data: { report: reportBody } });
    const report = await generateTripReport("t1");
    expect(lastRequest?.url).toContain("/api/v1/trip-groups/t1/trip-report");
    expect(lastRequest?.init?.method).toBe("POST");
    expect(report.summary).toContain("selesai dengan selamat");
    expect(report.facts.memberCount).toBe(1);
  });

  test("403 AI_MODULE_DISABLED -> kunci aiModuleDisabled", async () => {
    mockFetch(403, { error: { code: "AI_MODULE_DISABLED" } });
    let caught: unknown;
    try {
      await generateTripReport("t1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).i18nKey).toBe("errors.aiModuleDisabled");
  });

  test("409 TRIP_NOT_CLOSED diteruskan sebagai ApiError", async () => {
    mockFetch(409, { error: { code: "TRIP_NOT_CLOSED" } });
    let caught: unknown;
    try {
      await generateTripReport("t1");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
  });
});
