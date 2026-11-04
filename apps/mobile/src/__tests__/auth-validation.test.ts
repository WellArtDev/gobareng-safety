// Validasi form auth OTP (Wella 1 Nov 2026): cek format identifier per
// kanal, nama, email baru, dan format 6 digit — bukan validasi OTP
// pura-pura (kode tetap diverifikasi server).
import { describe, expect, test } from "bun:test";

import {
  isEmailIdentifier,
  isPhoneIdentifier,
  normalizePhone,
  validateIdentifier,
  validateName,
  validateNewEmail,
  validateOtp,
} from "../utils/auth-validation";

describe("validateIdentifier", () => {
  test("email: kosong -> required, format salah -> invalidEmail", () => {
    expect(validateIdentifier("email", "")).toBe("auth.errors.required");
    expect(validateIdentifier("email", "bukan-email")).toBe(
      "auth.errors.invalidEmail",
    );
    expect(validateIdentifier("email", "a@b.co")).toBeNull();
  });

  test("sms: nomor HP valid, email ditolak", () => {
    expect(validateIdentifier("sms", "081234567890")).toBeNull();
    expect(validateIdentifier("sms", "a@b.co")).toBe("auth.errors.invalidPhone");
    expect(validateIdentifier("sms", "123")).toBe("auth.errors.invalidPhone");
  });

  test("whatsapp: sama seperti sms", () => {
    expect(validateIdentifier("whatsapp", "6281234567890")).toBeNull();
    expect(validateIdentifier("whatsapp", "a@b.co")).toBe(
      "auth.errors.invalidPhone",
    );
  });
});

describe("normalizePhone", () => {
  test("spasi dan strip dihapus", () => {
    expect(normalizePhone("0812 3456-7890")).toBe("081234567890");
  });
});

describe("identifier predicates", () => {
  test("email vs phone", () => {
    expect(isEmailIdentifier("a@b.co")).toBe(true);
    expect(isEmailIdentifier("081234567890")).toBe(false);
    expect(isPhoneIdentifier("081234567890")).toBe(true);
    expect(isPhoneIdentifier("a@b.co")).toBe(false);
  });
});

describe("validateName + validateNewEmail", () => {
  test("nama minimal 2 huruf", () => {
    expect(validateName("B")).toBe("auth.errors.invalidName");
    expect(validateName("Budi")).toBeNull();
  });

  test("email baru harus format email", () => {
    expect(validateNewEmail("bukan-email")).toBe("auth.errors.invalidEmail");
    expect(validateNewEmail("budi@example.com")).toBeNull();
  });
});

describe("validateOtp", () => {
  test("hanya 6 digit yang lolos (cek format, bukan verifikasi)", () => {
    expect(validateOtp("12345")).toBe("auth.errors.invalidOtp");
    expect(validateOtp("1234567")).toBe("auth.errors.invalidOtp");
    expect(validateOtp("12345a")).toBe("auth.errors.invalidOtp");
    expect(validateOtp("123456")).toBeNull();
  });
});
