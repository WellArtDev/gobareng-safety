// Audit fix: magic-bytes gambar + rate-limit LRU.
// Unit murni — tanpa DB/server.
import { describe, expect, test } from "bun:test";
import { saveAvatarFile, sniffImageKindForTest } from "../uploads.js";
import { authRateLimit, resetRateLimiter } from "../rate-limit.js";
import type { NextFunction, Request, Response } from "express";

describe("sniffImageKind (magic bytes, bukan mimetype)", () => {
  test("PNG asli terdeteksi png", () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64",
    );
    expect(sniffImageKindForTest(png)).toBe("png");
  });

  test("JPEG/GIF/WebP terdeteksi dari header", () => {
    expect(sniffImageKindForTest(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("jpg");
    expect(sniffImageKindForTest(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("gif");
    expect(
      sniffImageKindForTest(
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe("webp");
  });

  test("teks dengan mimetype palsu png -> ditolak", () => {
    expect(sniffImageKindForTest(Buffer.from("bukan gambar"))).toBeNull();
    expect(sniffImageKindForTest(Buffer.from([]))).toBeNull();
  });

  test("saveAvatarFile: teks bermimetype png -> 400 INVALID_IMAGE; PNG asli tersimpan", async () => {
    const fakeText = {
      mimetype: "image/png",
      buffer: Buffer.from("bukan gambar"),
    } as unknown as Express.Multer.File;
    try {
      saveAvatarFile("u1", fakeText);
      throw new Error("harusnya menolak");
    } catch (e) {
      expect((e as { status?: number }).status).toBe(400);
      expect((e as { code?: string }).code).toBe("INVALID_IMAGE");
    }
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=",
      "base64",
    );
    const saved = saveAvatarFile(
      "u1",
      { mimetype: "image/png", buffer: png } as unknown as Express.Multer.File,
    );
    expect(saved.filename.endsWith(".png")).toBe(true);
    const { rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { avatarsUploadsDir } = await import("../uploads.js");
    await rm(join(avatarsUploadsDir, saved.filename), { force: true });
  });
});

describe("authRateLimit: cap ukuran Map (anti bloat memori)", () => {
  function req(ip: string, userId?: string): Request {
    return { ip, body: {}, user: userId ? { id: userId } : undefined } as unknown as Request;
  }

  test("sesi terautentikasi dikunci per user, bukan per IP bersama", () => {
    resetRateLimiter();
    const res = {} as Response;
    let blocked = 0;
    const next: NextFunction = (err?: unknown) => {
      if (err) blocked += 1;
    };
    // 10 hit user A + 5 hit user B (IP sama) -> lolos semua.
    for (let i = 0; i < 10; i++) {
      authRateLimit(req("10.8.0.1", "user-a"), res, next);
      if (i < 5) authRateLimit(req("10.8.0.1", "user-b"), res, next);
    }
    expect(blocked).toBe(0);
    // Hit ke-11 user A -> 429; user B masih lolos (kuota sendiri).
    authRateLimit(req("10.8.0.1", "user-a"), res, next);
    expect(blocked).toBe(1);
    authRateLimit(req("10.8.0.1", "user-b"), res, next);
    expect(blocked).toBe(1);
    resetRateLimiter();
  });

  test("banyak kunci berbeda tidak meledak + kunci lama di-evict", () => {
    resetRateLimiter();
    const res = {} as Response;
    let blocked = 0;
    const next: NextFunction = (err?: unknown) => {
      if (err) blocked += 1;
    };
    // 10_050 kunci unik — melebihi AUTH_RATE_MAX_KEYS (10_000).
    for (let i = 0; i < 10_050; i++) {
      authRateLimit(req(`10.9.${Math.floor(i / 250)}.${i % 250}`), res, next);
    }
    expect(blocked).toBe(0);
    // Kunci pertama sudah di-evict: hitung ulang dari 0, bukan 429.
    let blockedFirst = 0;
    const nextFirst: NextFunction = (err?: unknown) => {
      if (err) blockedFirst += 1;
    };
    authRateLimit(req("10.9.0.0"), res, nextFirst);
    expect(blockedFirst).toBe(0);
    resetRateLimiter();
  });
});
