// Klien profil: GET /auth/me, PATCH /auth/me, POST /auth/me/avatar.
// Ganti kata sandi DIHAPUS bersama login password (OTP passwordless,
// Wella 1 Nov 2026): endpoint PATCH /auth/me/password sudah 410 OTP_ONLY.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import {
  fetchMe,
  updateMe,
  uploadAvatar,
  validateProfileName,
} from "../utils/profile-api";
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

const me = {
  id: "u1",
  email: "budi@example.com",
  name: "Budi",
  slug: "budi",
  phone: "081234567890",
  isAdmin: false,
  role: "user",
  isVerified: false,
  avatarUrl: null,
};

describe("fetchMe", () => {
  test("GET /auth/me mengembalikan profil lengkap", async () => {
    mockFetch(200, { data: { user: me } });
    const user = await fetchMe();
    expect(user.email).toBe("budi@example.com");
    expect(user.isVerified).toBe(false);
    expect(user.avatarUrl).toBeNull();
    expect(lastRequest?.url).toContain("/auth/me");
  });
});

describe("validateProfileName", () => {
  test("nama < 2 karakter ditolak (server diam-diam mengabaikan nama pendek)", () => {
    expect(validateProfileName("")).toBe("profile.editErrors.nameRequired");
    expect(validateProfileName("A")).toBe("profile.editErrors.nameRequired");
    expect(validateProfileName("Budi")).toBeNull();
  });
});

describe("uploadAvatar", () => {
  test("POST multipart /auth/me/avatar field avatar mengembalikan avatarUrl", async () => {
    mockFetch(200, {
      data: { user: { ...me, avatarUrl: "https://api.example/uploads/avatars/u1-1.jpg" } },
    });
    const user = await uploadAvatar({
      uri: "file:///foto.jpg",
      name: "foto.jpg",
      type: "image/jpeg",
    });
    expect(lastRequest?.url).toContain("/auth/me/avatar");
    expect(lastRequest?.init?.method).toBe("POST");
    const body = lastRequest?.init?.body as FormData;
    expect(body.get("avatar")).not.toBeNull();
    expect(user.avatarUrl).toContain("/uploads/avatars/");
  });

  test("gambar bukan image dipetakan ke kunci i18n avatar", async () => {
    mockFetch(400, { error: { code: "INVALID_IMAGE" } });
    try {
      await uploadAvatar({ uri: "file:///x.bin", name: "x.bin", type: "application/octet-stream" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).i18nKey).toBe("profile.avatarErrors.invalidImage");
    }
  });
});

describe("updateMe", () => {
  test("PATCH /auth/me dengan nama + telepon", async () => {
    mockFetch(200, { data: { user: { ...me, name: "Budi Baru" } } });
    const user = await updateMe({ name: "Budi Baru", phone: "0812222333" });
    expect(user.name).toBe("Budi Baru");
    expect(lastRequest?.init?.method).toBe("PATCH");
  });
});
