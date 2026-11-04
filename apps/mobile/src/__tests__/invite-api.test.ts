// TDD — klien undangan trip (INVITE 2 Nov 2026): endpoint, URL
// landing, logika kuota penuh, validasi ubah kuota, HP kosong.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createTripInvite,
  fetchTripInvites,
  inviteUrlForToken,
  isPhoneMissing,
  isQuotaFull,
  revokeTripInvite,
  updateTripQuota,
  validateQuotaChange,
} from "../utils/invite-api";
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

const inviteBody = {
  id: "i1",
  tripId: "t1",
  label: "Teman Warjok",
  token: "invtoken123",
  createdBy: "u1",
  revokedAt: null,
};

describe("createTripInvite", () => {
  test("POST /trip-groups/:id/invites {label}", async () => {
    mockFetch(201, { data: { invite: inviteBody } });
    const invite = await createTripInvite("t1", "Teman Warjok");
    expect(invite.token).toBe("invtoken123");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.label).toBe("Teman Warjok");
  });
});

describe("fetchTripInvites / revokeTripInvite / updateTripQuota", () => {
  test("GET /trip-groups/:id/invites", async () => {
    mockFetch(200, { data: { invites: [inviteBody] } });
    const invites = await fetchTripInvites("t1");
    expect(invites).toHaveLength(1);
    expect(String(lastRequest?.url)).toContain("/trip-groups/t1/invites");
  });

  test("DELETE /trip-groups/:id/invites/:inviteId", async () => {
    mockFetch(200, { data: { revoked: true } });
    await revokeTripInvite("t1", "i1");
    expect(lastRequest?.init?.method).toBe("DELETE");
  });

  test("PATCH /trip-groups/:id/quota {quota}", async () => {
    mockFetch(200, { data: { trip: { id: "t1", quota: 12 } } });
    await updateTripQuota("t1", 12);
    expect(lastRequest?.init?.method).toBe("PATCH");
    const body = JSON.parse(String(lastRequest?.init?.body));
    expect(body.quota).toBe(12);
  });
});

describe("inviteUrlForToken", () => {
  test("default ke landing web posko (bukan api base)", () => {
    expect(inviteUrlForToken("invtoken123")).toBe(
      "https://posko.gobareng.app/undang/invtoken123",
    );
  });
});

describe("isQuotaFull", () => {
  test("null quota -> tidak pernah penuh", () => {
    expect(isQuotaFull(null, 99)).toBe(false);
    expect(isQuotaFull(undefined, 99)).toBe(false);
  });
  test("10/10 penuh; 9/10 belum; 11/10 penuh", () => {
    expect(isQuotaFull(10, 10)).toBe(true);
    expect(isQuotaFull(10, 9)).toBe(false);
    expect(isQuotaFull(10, 11)).toBe(true);
  });
});

describe("validateQuotaChange", () => {
  test("bukan angka / desimal -> invalid", () => {
    expect(validateQuotaChange("abc", 2)).toBe("invite.quotaInvalid");
    expect(validateQuotaChange("2.5", 2)).toBe("invite.quotaInvalid");
    expect(validateQuotaChange("", 2)).toBe("invite.quotaInvalid");
  });
  test("di bawah 2 -> tooSmall; di bawah anggota -> belowMembers", () => {
    expect(validateQuotaChange("1", 1)).toBe("invite.quotaTooSmall");
    expect(validateQuotaChange("2", 3)).toBe("invite.quotaBelowMembers");
  });
  test("sama dengan anggota / lebih -> valid", () => {
    expect(validateQuotaChange("3", 3)).toBeNull();
    expect(validateQuotaChange("12", 3)).toBeNull();
  });
});

describe("isPhoneMissing", () => {
  test("null / kosong / spasi -> missing; ada isi -> tidak", () => {
    expect(isPhoneMissing(null)).toBe(true);
    expect(isPhoneMissing(undefined)).toBe(true);
    expect(isPhoneMissing("")).toBe(true);
    expect(isPhoneMissing("   ")).toBe(true);
    expect(isPhoneMissing("0811111111")).toBe(false);
  });
});
