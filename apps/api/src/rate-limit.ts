// A-2: rate limiter in-memory untuk endpoint auth (anti brute force).
// Jendela geser sederhana per kunci (IP+identifier). BATASAN (bukan
// Redis): state hilang saat restart dan tidak terbagi antar instance —
// cukup untuk single-instance F2; pindah ke Redis bersama kartu A-6 bila
// perlu lintas instance. Map dibatasi (LRU sederhana, MAX_KEYS) supaya
// penyerang tidak bisa membengkakkan memori dengan IP/identifier acak.
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors.js";

export const AUTH_RATE_LIMIT = 10;
export const AUTH_RATE_WINDOW_MS = 15 * 60_000;
const AUTH_RATE_MAX_KEYS = 10_000;

const attempts = new Map<string, number[]>();

export function resetRateLimiter(): void {
  attempts.clear();
}

function keyFor(req: Request): string {
  // Sesi terautentikasi (PATCH /me, avatar, organizer, email-change):
  // kunci per user, bukan per IP — satu IP bersama (NAT/kantor) tidak
  // boleh mengunci user lain, dan satu user yang wajar tidak boleh
  // menghabiskan kuota IP global. Endpoint publik (OTP/refresh) belum
  // punya req.user saat limiter jalan (urutan middleware) → jatuh ke
  // IP + identifier seperti dulu.
  const userId = (req as { user?: { id?: string } }).user?.id;
  if (typeof userId === "string" && userId) return `user|${userId}`;
  // Kunci: IP + identifier. Endpoint OTP memakai field `identifier`,
  // endpoint lama memakai `email` — keduanya dibaca supaya limiter
  // yang sama mengunci percobaan OTP maupun password lama.
  const raw =
    typeof req.body?.email === "string"
      ? req.body.email
      : typeof req.body?.identifier === "string"
        ? req.body.identifier
        : "";
  return `${req.ip ?? "?"}|${raw.toLowerCase()}`;
}

// Login sukses menghapus jejak percobaan kunci itu — limiter menghitung
// brute force (kegagalan beruntun), bukan pemakaian normal; tanpa ini
// user sah yang sering login akan mengunci dirinya sendiri.
export function clearAuthAttempts(req: Request): void {
  attempts.delete(keyFor(req));
}

export function authRateLimit(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const key = keyFor(req);
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter(
    (t) => now - t < AUTH_RATE_WINDOW_MS,
  );
  if (list.length >= AUTH_RATE_LIMIT) {
    attempts.set(key, list);
    return next(new ApiError(429, "RATE_LIMITED"));
  }
  list.push(now);
  // Cap ukuran Map: hapus kunci terlama dulu (insertion order).
  attempts.delete(key);
  while (attempts.size >= AUTH_RATE_MAX_KEYS) {
    const oldest = attempts.keys().next();
    if (oldest.done) break;
    attempts.delete(oldest.value);
  }
  attempts.set(key, list);
  return next();
}
