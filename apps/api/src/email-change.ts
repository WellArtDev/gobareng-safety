// Ganti email berbasis OTP — menggantikan gate currentPassword di
// PATCH /me (Wella 1 Nov 2026 mematikan login password, jadi pengguna
// OTP-only tidak punya password untuk digate-kan; akun yang dibuat
// lewat OTP bahkan tidak pernah punya password).
//
// Alur (sesi terautentikasi WAJIB di semua langkah — endpoint di bawah
// requireAuth, jadi kode ini tidak pernah berdiri sendiri tanpa sesi):
//   1. POST /me/email-change/request { email } — kirim kode 6 digit ke
//      alamat email BARU (bukan ke alamat lama: yang dibuktikan adalah
//      kepemilikan alamat tujuan, supaya salah ketik / alamat orang
//      lain tidak bisa membajak akun).
//   2. PATCH /me { email, emailOtp } — kode diverifikasi, lalu email
//      diganti. Token sesi saat ini TETAP berlaku: JWT hanya membawa
//      user id, jadi tidak ada sesi yang diputus oleh ganti email.
//   3. Setelah sukses, alamat LAMA diberitahu lewat email (fail-soft,
//      via infrastruktur SMTP/Brevo yang sudah ada) supaya pemilik
//      akun tahu bila ada yang mengubah emailnya.
// Aturan pengaman = sama dengan OTP login (otp.ts): kode 6 digit,
// hash sha256, kedaluwarsa 5 menit, sekali pakai, maks 5 percobaan
// salah lalu kunci 15 menit, cooldown kirim ulang 60 detik,
// cap 10 kiriman/jam — dihitung pada identifier ber-namespace di
// bawah, sehingga kode ganti-email TIDAK PERNAH bisa dipakai lewat
// /otp/verify publik (identifier itu gagal regex email/HP di sana)
// dan sebaliknya kode login tidak bisa dipakai untuk ganti email.
// Kanal mengikuti toggle otpEmail: nonaktif -> CHANNEL_DISABLED,
// TANPA fallback diam-diam ke kanal lain (aturan yang sama dengan
// OTP login).
import { createHash, randomInt } from "node:crypto";
import { ApiError, badRequest, conflict, unauthorized } from "./errors.js";
import { sendOtpCode } from "./otp-delivery.js";
import type { Db, PlatformSettings } from "./db.js";

export const EMAIL_CHANGE_TTL_MS = 5 * 60_000;
export const EMAIL_CHANGE_MAX_ATTEMPTS = 5;
export const EMAIL_CHANGE_LOCK_MS = 15 * 60_000;
export const EMAIL_CHANGE_RESEND_COOLDOWN_MS = 60_000;
export const EMAIL_CHANGE_HOURLY_CAP = 10;

export interface EmailChangeDeps {
  now?: () => number;
  generateCode?: () => string;
  send?: typeof sendOtpCode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Namespace memisahkan baris ganti-email dari baris OTP login di tabel
// OtpCode yang sama (lihat header). Format sengaja bukan email valid.
export function emailChangeIdentifier(userId: string, newEmail: string): string {
  return `email-change:${userId}:${newEmail}`;
}

function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("INVALID_PAYLOAD");
  const normalized = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw badRequest("INVALID_PAYLOAD");
  return normalized;
}

export async function requestEmailChangeOtp(
  db: Db,
  settings: PlatformSettings,
  userId: string,
  newEmailRaw: unknown,
  deps: EmailChangeDeps = {},
): Promise<{ expiresInSeconds: number }> {
  const now = deps.now ?? Date.now;
  const generateCode = deps.generateCode ?? (() =>
    String(randomInt(0, 1_000_000)).padStart(6, "0"));
  const send = deps.send ?? sendOtpCode;

  const newEmail = normalizeEmail(newEmailRaw);
  const current = await db.userById(userId);
  if (!current) throw unauthorized();
  if (newEmail === current.email) throw badRequest("INVALID_PAYLOAD");
  if (await db.emailTaken(newEmail)) throw conflict("EMAIL_TAKEN");
  if (!settings.otpEmail) throw badRequest("CHANNEL_DISABLED");

  const identifier = emailChangeIdentifier(userId, newEmail);
  const nowMs = now();
  const rows = await db.otpCodesFor(identifier);
  if (rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > nowMs)) {
    throw new ApiError(429, "OTP_LOCKED");
  }
  const lastSent = await db.latestOtpSentAt(identifier, "email");
  if (lastSent && nowMs - lastSent.getTime() < EMAIL_CHANGE_RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "OTP_COOLDOWN");
  }
  const sentThisHour = await db.countOtpSentSince(
    identifier,
    new Date(nowMs - 60 * 60_000),
  );
  if (sentThisHour >= EMAIL_CHANGE_HOURLY_CAP) {
    throw new ApiError(429, "OTP_HOURLY_CAP");
  }

  const code = generateCode();
  const result = await send("email", newEmail, code, settings);
  if (!result.ok) {
    throw new ApiError(503, result.errorCode ?? "OTP_SEND_FAILED");
  }
  await db.createOtpCode({
    identifier,
    channel: "email",
    codeHash: hashCode(code),
    expiresAt: new Date(nowMs + EMAIL_CHANGE_TTL_MS),
  });
  return { expiresInSeconds: EMAIL_CHANGE_TTL_MS / 1000 };
}

// Verifikasi + konsumsi kode. Mengembalikan true bila kode valid untuk
// (userId, newEmail) ini; pemanggil yang melakukan updateUser setelah
// memeriksa ulang EMAIL_TAKEN (race antar request).
export async function verifyEmailChangeOtp(
  db: Db,
  userId: string,
  newEmailRaw: unknown,
  codeRaw: unknown,
  deps: EmailChangeDeps = {},
): Promise<boolean> {
  const now = deps.now ?? Date.now;
  const newEmail = normalizeEmail(newEmailRaw);
  if (typeof codeRaw !== "string" || !CODE_RE.test(codeRaw)) {
    throw unauthorized("INVALID_OTP");
  }
  const identifier = emailChangeIdentifier(userId, newEmail);
  const nowMs = now();
  const rows = await db.otpCodesFor(identifier);
  if (rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > nowMs)) {
    throw new ApiError(429, "OTP_LOCKED");
  }
  const match = rows.find((r) => r.codeHash === hashCode(codeRaw));
  if (!match) {
    const latest = rows.find((r) => r.expiresAt.getTime() > nowMs);
    if (latest) {
      const attempts = await db.bumpOtpAttempt(
        latest.id,
        latest.attempts + 1 >= EMAIL_CHANGE_MAX_ATTEMPTS
          ? new Date(nowMs + EMAIL_CHANGE_LOCK_MS)
          : null,
      );
      if (attempts >= EMAIL_CHANGE_MAX_ATTEMPTS) {
        throw new ApiError(429, "OTP_LOCKED");
      }
    }
    throw unauthorized("INVALID_OTP");
  }
  if (match.expiresAt.getTime() <= nowMs) {
    throw unauthorized("OTP_EXPIRED");
  }
  await db.markOtpConsumed(match.id);
  return true;
}
