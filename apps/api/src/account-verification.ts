// Verifikasi akun dua kanal (Wella 3 Nov 2026) — TERPISAH dari verifikasi
// organizer (isVerified + OrganizerVerification, jalur manual admin untuk
// PRO). Flow ini TIDAK PERNAH membaca/menulis field organizer.
// - Daftar via HP -> HP terbukti lewat OTP login (phoneVerifiedAt diisi
//   saat akun dibuat); email wajib dibuktikan lewat link klik sekali
//   pakai + kedaluwarsa 24 jam -> emailVerifiedAt.
// - Daftar via email -> email terbukti lewat OTP login; HP wajib
//   dibuktikan lewat kode OTP WhatsApp (aturan OTP login: expiry 5
//   menit, maks 5 salah lalu kunci 15 menit, cooldown 60 detik, cap
//   10/jam — dipakai ulang lewat requestOtp, bukan duplikasi).
// - accountVerifiedAt terisi OTOMATIS saat kedua kanal terbukti, dan
//   terhapus saat salah satu kanal berubah jadi belum terbukti.
// - Tidak ada fallback diam-diam antar kanal: email gagal kirim ->
//   EMAIL_SEND_FAILED (tidak ditandai terverifikasi); kanal WA nonaktif
//   -> CHANNEL_DISABLED dari requestOtp; kode/token tidak pernah di-log
//   (hanya hash yang disimpan).
import { createHash, randomBytes } from "node:crypto";
import { sendVerificationLinkEmail } from "./account-verification-mail.js";
import type { Db, PlatformSettings } from "./db.js";
import { ApiError, badRequest, unauthorized } from "./errors.js";
import {
  OTP_LOCK_MS,
  OTP_MAX_ATTEMPTS,
  requestOtp,
} from "./otp.js";
import type { User } from "./store.js";

export const EMAIL_LINK_TTL_MS = 24 * 60 * 60_000;
export const EMAIL_LINK_RESEND_COOLDOWN_MS = 60_000;

const CODE_RE = /^\d{6}$/;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AccountVerificationDeps {
  now?: () => number;
  generateToken?: () => string;
  sendEmail?: typeof sendVerificationLinkEmail;
  requestOtpFn?: typeof requestOtp;
}

export interface VerificationStatus {
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  accountVerified: boolean;
  organizerVerified: boolean;
}

export function verificationStatus(user: User): VerificationStatus {
  return {
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    phone: user.phone,
    phoneVerified: user.phoneVerifiedAt !== null,
    accountVerified: user.accountVerifiedAt !== null,
    organizerVerified: user.isVerified,
  };
}

// Hitung ulang accountVerifiedAt dari kondisi kanal terbaru: keduanya
// terbukti -> isi (bila kosong); salah satu belum -> hapus (bila terisi).
async function refreshAccountVerified(
  db: Db,
  userId: string,
  nowMs: number,
): Promise<User> {
  const fresh = await db.userById(userId);
  if (!fresh) throw unauthorized();
  const both =
    fresh.emailVerifiedAt !== null && fresh.phoneVerifiedAt !== null;
  if (both && !fresh.accountVerifiedAt) {
    return (
      (await db.updateUser(userId, {
        accountVerifiedAt: new Date(nowMs),
      })) ?? fresh
    );
  }
  if (!both && fresh.accountVerifiedAt) {
    return (
      (await db.updateUser(userId, { accountVerifiedAt: null })) ?? fresh
    );
  }
  return fresh;
}

export async function requestEmailLink(
  db: Db,
  user: User,
  baseUrl: string,
  deps: AccountVerificationDeps = {},
): Promise<{ sent: boolean; expiresInSeconds: number }> {
  const now = deps.now ?? Date.now;
  const generateToken =
    deps.generateToken ?? (() => randomBytes(32).toString("hex"));
  const sendEmail = deps.sendEmail ?? sendVerificationLinkEmail;
  if (!user.email) throw badRequest("EMAIL_NOT_SET");
  const nowMs = now();
  const latest = await db.latestEmailVerificationToken(user.id);
  if (
    latest &&
    !latest.consumedAt &&
    nowMs - latest.createdAt.getTime() < EMAIL_LINK_RESEND_COOLDOWN_MS
  ) {
    throw new ApiError(429, "EMAIL_LINK_COOLDOWN");
  }
  const token = generateToken();
  const row = await db.createEmailVerificationToken({
    userId: user.id,
    email: user.email,
    tokenHash: hashToken(token),
    expiresAt: new Date(nowMs + EMAIL_LINK_TTL_MS),
  });
  const link = `${baseUrl}/api/v1/account-verification/email/verify?token=${token}`;
  const settings = await db.platformSettings();
  const ok = await sendEmail(user.email, link, settings);
  if (!ok) {
    // Gagal kirim = link tidak berguna; hanguskan supaya tidak ada
    // token menggantung, dan JANGAN tandai terverifikasi.
    await db.consumeEmailVerificationToken(row.id);
    throw new ApiError(502, "EMAIL_SEND_FAILED");
  }
  return { sent: true, expiresInSeconds: EMAIL_LINK_TTL_MS / 1000 };
}

export type EmailLinkResult =
  | { ok: true; user: User }
  | { ok: false; reason: "INVALID" | "USED" | "EXPIRED" | "MISMATCH" };

export async function verifyEmailLink(
  db: Db,
  token: string,
  deps: AccountVerificationDeps = {},
): Promise<EmailLinkResult> {
  const now = deps.now ?? Date.now;
  const nowMs = now();
  const row = await db.emailVerificationTokenByHash(hashToken(token));
  if (!row) return { ok: false, reason: "INVALID" };
  if (row.consumedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt.getTime() <= nowMs) return { ok: false, reason: "EXPIRED" };
  const user = await db.userById(row.userId);
  if (!user || user.email !== row.email) {
    return { ok: false, reason: "MISMATCH" };
  }
  await db.consumeEmailVerificationToken(row.id);
  await db.updateUser(user.id, { emailVerifiedAt: new Date(nowMs) });
  const refreshed = await refreshAccountVerified(db, user.id, nowMs);
  return { ok: true, user: refreshed };
}

export async function requestWhatsappCode(
  db: Db,
  user: User,
  settings: PlatformSettings,
  deps: AccountVerificationDeps = {},
): Promise<{ channel: string; expiresInSeconds: number }> {
  const requestOtpFn = deps.requestOtpFn ?? requestOtp;
  if (!user.phone) throw badRequest("PHONE_NOT_SET");
  // Aturan OTP login dipakai ulang penuh (toggle kanal, cooldown, cap,
  // kunci): tidak ada jalur kirim kedua, tidak ada fallback diam-diam.
  return requestOtpFn(db, settings, {
    identifier: user.phone,
    channel: "whatsapp",
  });
}

export async function verifyWhatsappCode(
  db: Db,
  user: User,
  code: string,
  deps: AccountVerificationDeps = {},
): Promise<{ phoneVerified: boolean; accountVerified: boolean; user: User }> {
  const now = deps.now ?? Date.now;
  const nowMs = now();
  if (!user.phone) throw badRequest("PHONE_NOT_SET");
  if (!CODE_RE.test(code)) throw badRequest("INVALID_PAYLOAD");
  const rows = (await db.otpCodesFor(user.phone)).filter(
    (r) => r.channel === "whatsapp",
  );
  if (rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > nowMs)) {
    throw new ApiError(429, "OTP_LOCKED");
  }
  const match = rows.find((r) => r.codeHash === hashToken(code));
  if (!match) {
    const latest = rows.find((r) => r.expiresAt.getTime() > nowMs);
    if (latest) {
      const attempts = await db.bumpOtpAttempt(
        latest.id,
        latest.attempts + 1 >= OTP_MAX_ATTEMPTS
          ? new Date(nowMs + OTP_LOCK_MS)
          : null,
      );
      if (attempts >= OTP_MAX_ATTEMPTS) {
        throw new ApiError(429, "OTP_LOCKED");
      }
    }
    throw unauthorized("INVALID_OTP");
  }
  if (match.expiresAt.getTime() <= nowMs) {
    throw unauthorized("OTP_EXPIRED");
  }
  await db.markOtpConsumed(match.id);
  await db.updateUser(user.id, { phoneVerifiedAt: new Date(nowMs) });
  const refreshed = await refreshAccountVerified(db, user.id, nowMs);
  return {
    phoneVerified: true,
    accountVerified: refreshed.accountVerifiedAt !== null,
    user: refreshed,
  };
}
