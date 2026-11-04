// AI-L — klien leader-assistant: GET endpoint leader-only, envelope
// { data } dibuka apiRequest; fakta DB diteruskan apa adanya.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { setSessionCache } from "../utils/session-token";
import { fetchLeaderAssistant } from "../utils/leader-assistant-api";

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
  setSessionCache("jwt-tes", "Lia");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
  lastRequest = null;
});

describe("fetchLeaderAssistant", () => {
  test("GET /trip-groups/:id/leader-assistant + fakta diteruskan", async () => {
    mockFetch(200, {
      data: {
        summary: null,
        model: null,
        aiStatus: "AI_NOT_CONFIGURED",
        facts: {
          headcount: {
            total: 2,
            departed: 1,
            notDeparted: 1,
            notDepartedUserIds: ["u2"],
            signalStaleCount: 0,
          },
          members: [],
          overdueCheckins: [
            { userId: "u2", name: "Budi", kind: "MEETING_POINT" },
          ],
          checkpoints: [],
          activeSos: [],
          risk: { highRisk: false, reasons: [] },
        },
      },
    });
    const out = await fetchLeaderAssistant("trip-1");
    expect(lastRequest?.url).toContain(
      "/api/v1/trip-groups/trip-1/leader-assistant",
    );
    expect(out.aiStatus).toBe("AI_NOT_CONFIGURED");
    expect(out.summary).toBeNull();
    expect(out.facts.headcount.total).toBe(2);
    expect(out.facts.overdueCheckins[0].name).toBe("Budi");
  });
});
