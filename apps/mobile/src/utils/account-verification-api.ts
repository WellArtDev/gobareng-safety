// Klien verifikasi akun dua kanal — TERPISAH dari pengajuan organizer
// (organizer-api.ts, verifikasi manual admin untuk PRO). Endpoint:
// GET /account-verification/status, POST .../email/request,
// POST .../whatsapp/request, POST .../whatsapp/verify. Kode error server
// dipetakan ke kunci i18n di sini supaya layar tinggal pakai t(key).
import { apiRequest } from "./api-client";
import { ApiError } from "./auth-api";

export interface VerificationStatus {
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  accountVerified: boolean;
  organizerVerified: boolean;
}

export async function fetchVerificationStatus(): Promise<VerificationStatus> {
  return apiRequest<VerificationStatus>("/account-verification/status");
}

export async function requestEmailLink(): Promise<{
  sent: boolean;
  expiresInSeconds: number;
}> {
  return apiRequest<{ sent: boolean; expiresInSeconds: number }>(
    "/account-verification/email/request",
    { method: "POST" },
  );
}

export async function requestWhatsappCode(): Promise<{
  channel: string;
  expiresInSeconds: number;
}> {
  return apiRequest<{ channel: string; expiresInSeconds: number }>(
    "/account-verification/whatsapp/request",
    { method: "POST" },
  );
}

export async function verifyWhatsappCode(
  code: string,
): Promise<{ phoneVerified: boolean; accountVerified: boolean }> {
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(
      "profile.accountVerification.errors.codeInvalid",
      "INVALID_PAYLOAD",
    );
  }
  return apiRequest<{ phoneVerified: boolean; accountVerified: boolean }>(
    "/account-verification/whatsapp/verify",
    { method: "POST", body: { code } },
  );
}

const CODE_TO_I18N: Record<string, string> = {
  PHONE_NOT_SET: "profile.accountVerification.errors.phoneMissing",
  EMAIL_NOT_SET: "profile.accountVerification.errors.emailMissing",
  EMAIL_LINK_COOLDOWN: "profile.accountVerification.errors.linkCooldown",
  EMAIL_SEND_FAILED: "profile.accountVerification.errors.linkSendFailed",
  CHANNEL_DISABLED: "profile.accountVerification.errors.channelDisabled",
  INVALID_OTP: "profile.accountVerification.errors.codeInvalid",
  OTP_EXPIRED: "profile.accountVerification.errors.codeExpired",
  OTP_LOCKED: "profile.accountVerification.errors.codeLocked",
};

export function verificationErrorKey(code: string | null): string {
  if (code && CODE_TO_I18N[code]) return CODE_TO_I18N[code];
  return "errors.invalidPayload";
}
