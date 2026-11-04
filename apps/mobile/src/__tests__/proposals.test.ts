// Validasi + HTML peta usulan gunung & jalur buatan user.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchMyProposals, proposalStatusKey } from "../utils/proposals-api";
import { setSessionCache } from "../utils/session-token";
import {
  validateMountainProposal,
  validateRouteProposal,
} from "../utils/proposal-validation";
import { routeMapHtml } from "../utils/route-map-html";

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

describe("fetchMyProposals", () => {
  test("GET /mountains/proposals/mine mengembalikan gunung + jalur user", async () => {
    const mountains = [
      {
        id: "pm1",
        name: "Prau",
        location: "Wonosobo",
        lat: -7.19,
        lon: 109.92,
        elevationM: 2565,
        status: "PENDING",
        rejectReason: null,
        createdAt: "2026-11-01T10:00:00.000Z",
      },
    ];
    const routes = [
      {
        id: "pr1",
        mountainId: "m1",
        name: "Jalur Dieng",
        status: "REJECTED",
        rejectReason: "Jalur sudah ada",
        createdAt: "2026-11-01T11:00:00.000Z",
        posts: [],
      },
    ];
    mockFetch(200, { data: { mountains, routes } });
    const mine = await fetchMyProposals();
    expect(lastRequest?.url).toContain("/mountains/proposals/mine");
    expect(mine.mountains[0].name).toBe("Prau");
    expect(mine.routes[0].status).toBe("REJECTED");
    expect(mine.routes[0].rejectReason).toBe("Jalur sudah ada");
  });
});

describe("proposalStatusKey", () => {
  test("status server dipetakan ke kunci i18n proposal.*", () => {
    expect(proposalStatusKey("PENDING")).toBe("proposal.statusPending");
    expect(proposalStatusKey("APPROVED")).toBe("proposal.statusApproved");
    expect(proposalStatusKey("REJECTED")).toBe("proposal.statusRejected");
  });
});

describe("validasi usulan gunung", () => {
  test("nama/lokasi/koordinat wajib, rentang dijaga", () => {
    expect(
      validateMountainProposal({ name: "", location: "Garut", lat: -6.9, lon: 107.6, elevationM: null }),
    ).toBe("proposal.errNameRequired");
    expect(
      validateMountainProposal({ name: "Prau", location: "", lat: -6.9, lon: 107.6, elevationM: null }),
    ).toBe("proposal.errLocationRequired");
    expect(
      validateMountainProposal({ name: "Prau", location: "Garut", lat: null, lon: 107.6, elevationM: null }),
    ).toBe("proposal.errCoordRequired");
    expect(
      validateMountainProposal({ name: "Prau", location: "Garut", lat: -91, lon: 107.6, elevationM: null }),
    ).toBe("proposal.errCoordRange");
    expect(
      validateMountainProposal({ name: "Prau", location: "Garut", lat: -6.9, lon: 107.6, elevationM: -5 }),
    ).toBe("proposal.errElevation");
    expect(
      validateMountainProposal({ name: "Prau", location: "Garut", lat: -6.9, lon: 107.6, elevationM: 2565 }),
    ).toBeNull();
  });
});

describe("validasi usulan jalur", () => {
  const ok = [
    { name: "Titik Kumpul Awal", lat: -6.9, lon: 107.6, isGathering: true },
    { name: "Pos 2", lat: -6.91, lon: 107.61, isGathering: false },
  ];
  test("checkpoint pertama wajib titik kumpul awal", () => {
    expect(
      validateRouteProposal("Jalur Baru", [
        { name: "Pos 1", lat: -6.9, lon: 107.6, isGathering: false },
      ]),
    ).toBe("proposal.errGatheringRequired");
    expect(validateRouteProposal("Jalur Baru", ok)).toBeNull();
    expect(validateRouteProposal("Jalur Baru", [])).toBe("proposal.errCheckpointMin");
    expect(
      validateRouteProposal(
        "Jalur Baru",
        Array.from({ length: 31 }, (_, i) => ({
          name: `Pos ${i + 1}`,
          lat: -6.9,
          lon: 107.6,
          isGathering: i === 0,
        })),
      ),
    ).toBe("proposal.errCheckpointMax");
  });
});

describe("routeMapHtml", () => {
  test("mendukung banyak pin bernomor + pesan pick", () => {
    const html = routeMapHtml(-6.2, 106.8);
    expect(html).toContain("setRoutePins");
    expect(html).toContain("pin-first");
    expect(html).toContain("ReactNativeWebView.postMessage");
    expect(html).toContain("tile.openstreetmap.org");
  });

  test("mendukung setMapCenter untuk hasil pencarian lokasi", () => {
    const html = routeMapHtml(-6.2, 106.8);
    expect(html).toContain("window.setMapCenter");
    expect(html).toContain("map.setView");
  });
});
