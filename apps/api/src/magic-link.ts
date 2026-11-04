// Magic link juri tanpa OTP (3 Nov 2026).
// Satu tautan per akun juri, dapat dipakai BERULANG (HP + desktop)
// sampai tenggat pengumuman, lalu mati total — termasuk semua sesi
// yang diterbitkannya. Mekanisme tenggat berlapis:
//  1. Baris MagicLinkToken.expiresAt (= tenggat) — redeem lewat tenggat
//     ditolak 410.
//  2. Access JWT diterbitkan dengan exp = min(15 menit, tenggat) —
//     token tidak hidup melewati tenggat walau diterbitkan di menit
//     terakhir.
//  3. Refresh token diterbitkan dengan expiresAt = tenggat, dan rotasi
//     di /refresh ikut dibatasi tenggat untuk akun pemegang magic link
//     (lihat routes/auth.ts) — jadi tidak ada rantai refresh yang
//     lolos melewati tenggat.
// Token mentah TIDAK PERNAH disimpan/dilog — hanya hash sha256-nya.
// Pesan gagal sengaja generik (INVALID_MAGIC_LINK) supaya percobaan
// token salah tidak membocorkan akun mana yang dituju; hanya
// kedaluwarsa yang dibedakan (410 MAGIC_LINK_EXPIRED) karena itu
// memang kondisi akhir yang perlu diketahui pemakai sah.
import { createHash, randomBytes } from "node:crypto";
import { signTokenWithExpiry } from "./auth.js";
import { publicUser } from "./db.js";
import type { Db } from "./db.js";
import { gone, unauthorized } from "./errors.js";

// 10 Nov 2026 23:59 WIB (pengumuman pemenang) = 16:59:59 UTC.
// Satu-satunya sumber tenggat di kode — migrasi data memakai literal
// yang sama (2026-11-10 16:59:59 UTC).
export const MAGIC_LINK_DEADLINE = new Date("2026-11-10T16:59:59.000Z");

export function hashMagicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Generator tautan (dipakai di luar request — mis. skrip admin).
// Nilai mentah hanya boleh tampil di laporan serah terima ke pemilik,
// tidak pernah di file, log, atau respons API.
export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function redeemMagicLink(
  db: Db,
  rawToken: unknown,
  now: Date = new Date(),
): Promise<{
  user: ReturnType<typeof publicUser>;
  token: string;
  refreshToken: string;
}> {
  if (typeof rawToken !== "string" || !rawToken) {
    throw unauthorized("INVALID_MAGIC_LINK");
  }
  const row = await db.magicLinkTokenByHash(hashMagicToken(rawToken));
  if (!row) throw unauthorized("INVALID_MAGIC_LINK");
  if (
    row.expiresAt.getTime() <= now.getTime() ||
    MAGIC_LINK_DEADLINE.getTime() <= now.getTime()
  ) {
    throw gone("MAGIC_LINK_EXPIRED");
  }
  const user = await db.userById(row.userId);
  if (!user || user.suspendedAt) throw unauthorized("INVALID_MAGIC_LINK");
  const secondsLeft = Math.floor(
    (MAGIC_LINK_DEADLINE.getTime() - now.getTime()) / 1000,
  );
  const access = signTokenWithExpiry(user, Math.min(900, secondsLeft));
  const refreshToken = randomBytes(32).toString("hex");
  await db.createRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: MAGIC_LINK_DEADLINE,
  });
  return { user: publicUser(user), token: access, refreshToken };
}
