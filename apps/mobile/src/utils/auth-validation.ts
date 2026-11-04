// Validasi form auth OTP sisi klien — mengembalikan kunci i18n (bukan
// teks UI) atau null bila valid. Ini HANYA cek format sebelum request
// (email/HP/6 digit/nama) — bukan validasi OTP pura-pura: kode tetap
// diverifikasi server lewat POST /auth/otp/verify. Sejak OTP
// passwordless (Wella 1 Nov 2026) tidak ada lagi validasi password,
// dan nomor HP tidak lagi wajib di langkah awal (identifier bisa email
// saja; akun baru dari nomor HP baru diminta email di langkah nama).
import type { OtpChannel } from "./auth-api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?\d{9,15}$/;
const OTP_RE = /^\d{6}$/;
const MIN_NAME_LENGTH = 2;

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

export function isEmailIdentifier(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isPhoneIdentifier(value: string): boolean {
  return PHONE_RE.test(normalizePhone(value));
}

// Identifier harus sesuai kanal yang dipilih (email untuk kanal email,
// nomor HP untuk SMS/WhatsApp). Kanal nonaktif tidak pernah sampai ke
// sini — layar hanya menampilkan kanal aktif dari GET /otp/channels.
export function validateIdentifier(
  channel: OtpChannel,
  value: string,
): string | null {
  if (!value.trim()) return "auth.errors.required";
  if (channel === "email") {
    return isEmailIdentifier(value) ? null : "auth.errors.invalidEmail";
  }
  return isPhoneIdentifier(value) ? null : "auth.errors.invalidPhone";
}

export function validateName(name: string): string | null {
  if (name.trim().length < MIN_NAME_LENGTH) return "auth.errors.invalidName";
  return null;
}

export function validateNewEmail(email: string): string | null {
  if (!EMAIL_RE.test(email.trim())) return "auth.errors.invalidEmail";
  return null;
}

export function validateOtp(code: string): string | null {
  return OTP_RE.test(code) ? null : "auth.errors.invalidOtp";
}
