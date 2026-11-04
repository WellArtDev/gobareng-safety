// AI-P — klien foto SOS (mobile): upload multipart ke /sos-photos,
// baca daftar foto, analisis ulang, dan pemetaan kode error ke i18n.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ApiError } from "../utils/auth-api";
import { setSessionCache } from "../utils/session-token";
import {
  analyzeSosPhoto,
  fetchSosPhotos,
  uploadSosPhoto,
} from "../utils/sos-api";

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

const PHOTO = {
  id: "p1",
  kind: "GENERAL",
  sosId: "s1",
  senderId: "u1",
  photoUrl: "http://x/uploads/sos/foto.png",
  aiDescription: "Terlihat kondisi darurat.",
  model: "muse-spark-open",
  aiStatus: "AVAILABLE",
  createdAt: "2026-11-02T00:00:00.000Z",
};

describe("uploadSosPhoto", () => {
  test("POST multipart /sos-photos dengan kind + sosId + photo", async () => {
    mockFetch(201, { data: { photo: PHOTO } });
    const photo = await uploadSosPhoto("GENERAL", "s1", {
      uri: "file:///foto.jpg",
      name: "foto.jpg",
      type: "image/jpeg",
    });
    expect(photo.aiStatus).toBe("AVAILABLE");
    expect(photo.model).toBe("muse-spark-open");
    expect(lastRequest?.url).toContain("/sos-photos");
    expect(lastRequest?.init?.method).toBe("POST");
    expect(lastRequest?.init?.body).toBeInstanceOf(FormData);
  });

  test("INVALID_IMAGE -> kunci i18n foto", async () => {
    mockFetch(400, { error: { code: "INVALID_IMAGE" } });
    const err = await uploadSosPhoto("GENERAL", "s1", {
      uri: "file:///catatan.txt",
      name: "catatan.txt",
      type: "text/plain",
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).i18nKey).toBe("sos.photo.errors.invalidImage");
  });

  test("SOS_PHOTO_NOT_ALLOWED -> kunci i18n foto", async () => {
    mockFetch(403, { error: { code: "SOS_PHOTO_NOT_ALLOWED" } });
    const err = await uploadSosPhoto("TRIP", "s1", {
      uri: "file:///foto.jpg",
      name: "foto.jpg",
      type: "image/jpeg",
    }).catch((e: unknown) => e);
    expect((err as ApiError).i18nKey).toBe("sos.photo.errors.notAllowed");
  });
});

describe("fetchSosPhotos + analyzeSosPhoto", () => {
  test("GET /sos-photos/:kind/:sosId mengembalikan daftar foto", async () => {
    mockFetch(200, { data: { photos: [PHOTO] } });
    const photos = await fetchSosPhotos("GENERAL", "s1");
    expect(photos.length).toBe(1);
    expect(lastRequest?.url).toContain("/sos-photos/GENERAL/s1");
  });

  test("POST /sos-photos/:id/analyze mengembalikan foto teranalisis", async () => {
    mockFetch(200, { data: { photo: PHOTO } });
    const photo = await analyzeSosPhoto("p1");
    expect(photo.id).toBe("p1");
    expect(lastRequest?.url).toContain("/sos-photos/p1/analyze");
    expect(lastRequest?.init?.method).toBe("POST");
  });

  test("deskripsi belum tersedia: aiDescription null + UNAVAILABLE", async () => {
    mockFetch(200, {
      data: {
        photos: [{ ...PHOTO, aiDescription: null, model: null, aiStatus: "UNAVAILABLE" }],
      },
    });
    const photos = await fetchSosPhotos("TRIP", "s9");
    expect(photos[0].aiDescription).toBeNull();
    expect(photos[0].model).toBeNull();
    expect(photos[0].aiStatus).toBe("UNAVAILABLE");
  });
});
