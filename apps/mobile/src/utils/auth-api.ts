// Klien auth OTP passwordless (Wella 1 Nov 2026) — menggantikan login/
// register password. Server hanya mengirim { error: { code } }; klien
// memetakan kode ke kunci i18n di sini. Jaringan gagal = fail-soft
// (ApiError "unavailable"), tidak pernah crash. Tidak ada validasi OTP
// pura-pura di sini: setiap langkah memanggil endpoint sungguhan.
import { apiV1 } from "./config";

export interface PublicUser {
  id: string;
  name: string;
  slug: string;
}

export interface Session {
  token: string;
  // Refresh token rotasi (server lama tanpa field ini tetap jalan).
  refreshToken?: string;
  user: PublicUser;
}

export type OtpChannel = "email" | "sms" | "whatsapp";

export interface OtpChannels {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface OtpRequestResult {
  channel: OtpChannel;
  // Kanal yang benar-benar mengirim (bisa berbeda dari channel bila
  // fallback SMS -> WhatsApp terjadi di server). Opsional supaya klien
  // lama tetap jalan melawan API lama yang belum mengirim field ini.
  channelSent?: OtpChannel;
  expiresInSeconds: number;
}

export type VerifyOtpResult =
  | { session: Session }
  | { needsName: true; needsEmail: boolean };

const ERROR_CODE_TO_I18N: Record<string, string> = {
  ACCOUNT_SUSPENDED: "auth.errors.suspended",
  EMAIL_TAKEN: "auth.errors.emailTaken",
  SIGNUP_CLOSED: "auth.errors.signupClosed",
  INVALID_PAYLOAD: "auth.errors.invalidPayload",
  INVALID_OTP: "auth.errors.invalidOtpServer",
  OTP_EXPIRED: "auth.errors.otpExpired",
  OTP_LOCKED: "auth.errors.otpLocked",
  OTP_COOLDOWN: "auth.errors.otpCooldown",
  OTP_HOURLY_CAP: "auth.errors.otpHourlyCap",
  OTP_SEND_FAILED: "auth.errors.otpSendFailed",
  CHANNEL_DISABLED: "auth.errors.channelDisabled",
  WHATSAPP_TEMPLATE_NO_VARIABLE: "auth.errors.whatsappTemplateNoVariable",
  OTP_ONLY: "auth.errors.otpOnly",
  TRIP_EXPIRED: "auth.errors.tripExpired",
  INVALID_MAGIC_LINK: "auth.errors.magicLinkInvalid",
  MAGIC_LINK_EXPIRED: "auth.errors.magicLinkExpired",
};

const FALLBACK_ERROR_KEY = "auth.errors.invalidPayload";
const UNAVAILABLE_KEY = "auth.errors.unavailable";
const TIMEOUT_KEY = "auth.errors.timeout";

// Batas request auth (3 Nov 2026): tanpa ini, request yang stall di
// jalan membuat spinner login muter selamanya. 30 detik cukup untuk
// kirim OTP (SMTP Brevo read-timeout 10 detik + REST 5 detik) dan
// verifikasi DB lokal (<1 detik), tapi tetap mengakhiri spinner.
export const AUTH_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  readonly i18nKey: string;
  readonly code: string | null;

  constructor(i18nKey: string, code: string | null = null) {
    super(code ?? i18nKey);
    this.name = "ApiError";
    this.i18nKey = i18nKey;
    this.code = code;
  }
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = AUTH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    // Abort dari timer sendiri = timeout; sisanya = tidak terjangkau.
    if (controller.signal.aborted) throw new ApiError(TIMEOUT_KEY);
    throw new ApiError(UNAVAILABLE_KEY);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; json: unknown }> {
  const res = await fetchWithTimeout(apiV1(path), init);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(UNAVAILABLE_KEY);
  }
  return { status: res.status, json };
}

function errorFrom(json: unknown): ApiError {
  const code =
    typeof json === "object" &&
    json !== null &&
    typeof (json as { error?: { code?: unknown } }).error?.code === "string"
      ? (json as { error: { code: string } }).error.code
      : null;
  return new ApiError(
    (code && ERROR_CODE_TO_I18N[code]) || FALLBACK_ERROR_KEY,
    code,
  );
}

function sessionFrom(data: unknown): Session {
  const d = data as {
    user?: PublicUser;
    token?: string;
    refreshToken?: string;
  };
  if (!d || typeof d.token !== "string" || !d.user) {
    throw new ApiError(UNAVAILABLE_KEY);
  }
  return {
    token: d.token,
    user: d.user,
    refreshToken:
      typeof d.refreshToken === "string" ? d.refreshToken : undefined,
  };
}

// GET /auth/otp/channels — publik, hanya flag aktif/tidak per kanal.
// Layar OTP menampilkan HANYA kanal yang aktif.
export async function getOtpChannels(): Promise<OtpChannels> {
  const { status, json } = await fetchJson("/auth/otp/channels");
  if (status !== 200) throw errorFrom(json);
  const data = (json as { data?: OtpChannels }).data;
  if (
    !data ||
    typeof data.email !== "boolean" ||
    typeof data.sms !== "boolean" ||
    typeof data.whatsapp !== "boolean"
  ) {
    throw new ApiError(UNAVAILABLE_KEY);
  }
  return data;
}

export async function requestOtp(
  identifier: string,
  channel: OtpChannel,
): Promise<OtpRequestResult> {
  const { status, json } = await fetchJson("/auth/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, channel }),
  });
  if (status !== 200) throw errorFrom(json);
  const data = (json as { data?: OtpRequestResult }).data;
  if (
    !data ||
    (data.channel !== "email" &&
      data.channel !== "sms" &&
      data.channel !== "whatsapp") ||
    typeof data.expiresInSeconds !== "number"
  ) {
    throw new ApiError(UNAVAILABLE_KEY);
  }
  return data;
}

export async function verifyOtp(
  identifier: string,
  code: string,
  name?: string,
  email?: string,
  // Opsional langkah pembuatan akun: hanya dikirim bila diisi, server
  // menyimpannya pada User baru (telepon tak valid -> null di server).
  phone?: string,
  country?: string | null,
): Promise<VerifyOtpResult> {
  const body: Record<string, string> = { identifier, code };
  if (name !== undefined) body.name = name;
  if (email !== undefined) body.email = email;
  if (phone !== undefined && phone !== "") body.phone = phone;
  if (country !== undefined && country !== null) body.country = country;
  const { status, json } = await fetchJson("/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (status !== 200) throw errorFrom(json);
  const data = (json as { data?: Record<string, unknown> }).data;
  if (!data) throw new ApiError(UNAVAILABLE_KEY);
  if (data.needsName === true) {
    return {
      needsName: true,
      needsEmail: data.needsEmail === true,
    };
  }
  return { session: sessionFrom(data) };
}

// Magic link juri tanpa OTP (3 Nov 2026): satu tautan per akun juri,
// pakai-ulang sampai tenggat pengumuman. Responsnya sama dengan
// otp/verify (sesi penuh) supaya penyimpanan sesi tidak bercabang.
export async function redeemMagicLink(token: string): Promise<Session> {
  const { status, json } = await fetchJson("/auth/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (status !== 200) throw errorFrom(json);
  const data = (json as { data?: unknown }).data;
  if (!data) throw new ApiError(UNAVAILABLE_KEY);
  return sessionFrom(data);
}

// Cabut refresh token di server saat logout. Best-effort — logout
// lokal tetap jalan walau jaringan gagal. Pakai timeout yang sama
// supaya logout tidak ikut menggantung bila koneksi stall.
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await fetchWithTimeout(apiV1("/auth/logout"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Token kedaluwarsa sendiri dalam 30 hari.
  }
}
