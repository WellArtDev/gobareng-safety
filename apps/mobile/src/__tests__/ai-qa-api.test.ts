// Klien AI-Q: GET riwayat + POST pertanyaan; notFound dirender
// klien dari flag (bukan teks karangan); model non-null = atribusi.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import {
  askTripQuestion,
  fetchTripQa,
  type TripQa,
} from "../utils/ai-qa-api";

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

const qaBody: TripQa = {
  id: "q1",
  tripId: "t1",
  userId: "u1",
  question: "Di mana titik kumpul?",
  answer: "Titik kumpul: Basecamp Patak Banteng.",
  notFound: false,
  sources: ["trip.meetingPoint"],
  model: "muse-spark-open",
  createdAt: "2026-11-02T00:00:00.000Z",
};

describe("fetchTripQa", () => {
  test("GET /trip-groups/:id/qa dengan Bearer token", async () => {
    mockFetch(200, { data: { qa: [qaBody] } });
    const rows = await fetchTripQa("t1");
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toContain("trip.meetingPoint");
    expect(rows[0].model).toBe("muse-spark-open");
    expect(lastRequest?.url).toContain("/api/v1/trip-groups/t1/qa");
  });

  test("403 non-member -> ApiError forbidden", async () => {
    mockFetch(403, { error: { code: "NOT_TRIP_MEMBER" } });
    let caught: unknown;
    try {
      await fetchTripQa("t1");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).i18nKey).toBe("errors.forbidden");
  });
});

describe("askTripQuestion", () => {
  test("POST pertanyaan -> jawaban + sumber + model", async () => {
    mockFetch(201, { data: { qa: qaBody } });
    const qa = await askTripQuestion("t1", "Di mana titik kumpul?");
    expect(qa.answer).toContain("Basecamp Patak Banteng");
    expect(qa.notFound).toBe(false);
    expect(lastRequest?.init?.method).toBe("POST");
  });

  test("POST di luar data -> notFound, answer null (bukan karangan)", async () => {
    mockFetch(201, {
      data: {
        qa: {
          ...qaBody,
          id: "q2",
          question: "Berapa harga tiket masuk?",
          answer: null,
          notFound: true,
          sources: [],
          model: null,
        },
      },
    });
    const qa = await askTripQuestion("t1", "Berapa harga tiket masuk?");
    expect(qa.notFound).toBe(true);
    expect(qa.answer).toBeNull();
    expect(qa.model).toBeNull();
  });
});
