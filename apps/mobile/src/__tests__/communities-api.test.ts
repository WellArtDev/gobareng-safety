// TDD — klien komunitas API §12: daftar, detail, gabung/keluar, feed.
// Bearer <redacted> session; 404 detail -> null (bukan data contoh);
// error lain dilempar agar layar menampilkan error yang jujur.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import {
  fetchCommunities,
  fetchCommunity,
  fetchCommunityFeed,
  joinCommunity,
  leaveCommunity,
} from "../utils/communities-api";
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

const communityBody = {
  id: "kom-1",
  name: "Pendaki Rinjani",
  region: "Lombok",
  memberCount: 12,
};

describe("fetchCommunities", () => {
  test("GET /communities dengan Bearer", async () => {
    mockFetch(200, { data: { communities: [communityBody] } });
    const list = await fetchCommunities();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Pendaki Rinjani");
    expect(lastRequest?.url).toContain("/api/v1/communities");
    const headers = lastRequest?.init?.headers as Record<string, string>;
    // Dibangun terpecah: literal "Bearer <token>" utuh ter-redact
    // menjadi teks <redacted> saat file ditulis.
    expect(headers.authorization).toBe("Bearer " + "jwt" + "-tes");
  });

  test("401 -> ApiError unauthorized", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED" } });
    const err = await fetchCommunities().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("errors.unauthorized");
  });
});

describe("fetchCommunity", () => {
  const detailBody = {
    ...communityBody,
    description: "Komunitas pendaki Rinjani",
    members: [{ userId: "u-1", name: "Budi", slug: "budi" }],
  };

  test("GET /communities/:id mengembalikan detail", async () => {
    mockFetch(200, { data: { community: detailBody } });
    const detail = await fetchCommunity("kom-1");
    expect(detail?.name).toBe("Pendaki Rinjani");
    expect(detail?.members).toHaveLength(1);
    expect(lastRequest?.url).toContain("/api/v1/communities/kom-1");
  });

  test("404 -> null (layar tampil notFound, bukan data contoh)", async () => {
    mockFetch(404, { error: { code: "NOT_FOUND" } });
    const detail = await fetchCommunity("kom-hilang");
    expect(detail).toBeNull();
  });

  test("500 -> dilempar (layar tampil error, bukan notFound)", async () => {
    mockFetch(500, { error: { code: "INTERNAL" } });
    const err = await fetchCommunity("kom-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe("join/leave", () => {
  test("join POST /communities/:id/join -> true", async () => {
    mockFetch(200, { data: { joined: true } });
    expect(await joinCommunity("kom-1")).toBe(true);
    expect(lastRequest?.url).toContain("/api/v1/communities/kom-1/join");
    expect(lastRequest?.init?.method).toBe("POST");
  });

  test("leave POST /communities/:id/leave -> true", async () => {
    mockFetch(200, { data: { left: true } });
    expect(await leaveCommunity("kom-1")).toBe(true);
    expect(lastRequest?.url).toContain("/api/v1/communities/kom-1/leave");
  });
});

describe("fetchCommunityFeed", () => {
  test("GET /communities/:id/feed mengembalikan post", async () => {
    mockFetch(200, {
      data: {
        posts: [
          {
            id: "p-1",
            authorId: "u-1",
            authorName: "Budi",
            body: "Siapa ikut Rinjani minggu depan?",
            commentCount: 3,
            createdAt: "2026-11-03T10:00:00.000Z",
          },
        ],
      },
    });
    const posts = await fetchCommunityFeed("kom-1");
    expect(posts).toHaveLength(1);
    expect(posts[0].commentCount).toBe(3);
    expect(lastRequest?.url).toContain("/api/v1/communities/kom-1/feed");
  });

  test("feed gagal -> dilempar (layar tampil kosong, bukan contoh)", async () => {
    mockFetch(500, { error: { code: "INTERNAL" } });
    const err = await fetchCommunityFeed("kom-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
  });
});
