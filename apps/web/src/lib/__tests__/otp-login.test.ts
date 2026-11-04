// Guard login OTP passwordless dashboard (Wella 1 Nov 2026):
// layar login +page = identifier (email) -> OTP -> sesi; TIDAK ADA
// lagi login password, ganti password, atau langkah buat akun di
// dashboard (needsName = akun belum terdaftar, bukan form daftar).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const page = read("../../routes/+page.svelte");
const apiSrc = read("../../lib/api.ts");
const shell = read("../dashboard-shell.svelte");

const OTP_ERRORS = [
  "INVALID_OTP",
  "OTP_EXPIRED",
  "OTP_LOCKED",
  "OTP_COOLDOWN",
  "OTP_HOURLY_CAP",
  "OTP_SEND_FAILED",
  "CHANNEL_DISABLED",
  "WHATSAPP_TEMPLATE_NO_VARIABLE",
  "OTP_ONLY",
  "ACCOUNT_NOT_FOUND",
];

describe("login dashboard OTP", () => {
  test("dua langkah: identifier -> OTP, tanpa password", () => {
    for (const key of [
      "requestOtpCode",
      "verifyOtpCode",
      "otpStep",
      "auth.sendOtp",
      "auth.otpCode",
      "auth.otpIntro",
      "auth.resendOtp",
      "auth.changeIdentifier",
    ]) {
      expect(page).toContain(key);
    }
    for (const gone of [
      "onsubmit={login}",
      "api.login(",
      "auth.password",
      "staffPassword",
      "changeMemberPassword",
      "openMemberPassword",
    ]) {
      expect(page).not.toContain(gone);
    }
  });

  test("klien API OTP, tanpa login password (changePassword dicopot bersama tab #122)", () => {
    for (const fn of ["otpChannels", "requestOtp", "verifyOtp"]) {
      expect(apiSrc).toContain(fn);
    }
    expect(apiSrc).toContain("/api/v1/auth/otp/request");
    expect(apiSrc).toContain("/api/v1/auth/otp/verify");
    expect(apiSrc).toContain("/api/v1/auth/otp/channels");
    for (const gone of ["/api/v1/auth/login", "changeMemberPassword"]) {
      expect(apiSrc).not.toContain(gone);
    }
    // Tindak lanjut #122 setelah OTP merge: tab Ubah Kata Sandi dicopot
    // (submit-nya 410 OTP_ONLY), jadi klien changePassword ikut dihapus.
    expect(apiSrc).not.toContain("changePassword");
    expect(apiSrc).not.toContain("'/api/v1/auth/me/password'");
  });

  test("needsName dashboard = akun belum terdaftar, bukan langkah daftar", () => {
    // verifyOtp mengembalikan needsName untuk identifier baru; dashboard
    // memetakannya ke error akun-tidak-terdaftar, tidak membuka form nama.
    expect(page).toContain("if ('needsName' in res)");
    expect(page).toContain("errorCode = 'ACCOUNT_NOT_FOUND'");
  });

  test("dropdown profil tanpa item ganti kata sandi (dicopot bersama tab #122)", () => {
    // Tindak lanjut #122 setelah OTP merge: item ini dicopot karena
    // hanya membuka tab Ubah Kata Sandi yang submit-nya 410 OTP_ONLY.
    expect(shell).not.toContain("dashboard.menuPassword");
    expect(shell).toContain("dashboard.menuProfile");
    expect(shell).toContain("dashboard.menuLogout");
  });

  test("kunci i18n OTP ada di kedua bahasa", () => {
    type Dict = { auth: Record<string, unknown>; errors: Record<string, unknown> };
    const idD = id as unknown as Dict;
    const enD = en as unknown as Dict;
    for (const key of [
      "sendOtp",
      "otpCode",
      "otpIntro",
      "resendOtp",
      "changeIdentifier",
    ]) {
      expect(idD.auth[key]).toBeTruthy();
      expect(enD.auth[key]).toBeTruthy();
    }
    for (const code of OTP_ERRORS) {
      expect(idD.errors[code]).toBeTruthy();
      expect(enD.errors[code]).toBeTruthy();
    }
  });
});
