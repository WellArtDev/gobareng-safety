// TDD RED — klien rekening organizer: validasi satu paket di form
// "Isi Data Profil", payload PATCH /me, dan organizerBank di
// payments/me untuk layar paid-join.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fetchMyTripPayment } from "../utils/pay-api";
import {
  profileDataPayload,
  validateBankDetails,
} from "../utils/profile-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
});

describe("validateBankDetails", () => {
  test("ketiganya kosong = boleh (tidak mengubah rekening)", () => {
    expect(
      validateBankDetails({
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolder: "",
      }),
    ).toBeNull();
  });

  test("sebagian saja = error bankIncomplete", () => {
    expect(
      validateBankDetails({
        bankName: "BCA",
        bankAccountNumber: "",
        bankAccountHolder: "",
      }),
    ).toBe("profile.dataErrors.bankIncomplete");
    expect(
      validateBankDetails({
        bankName: "BCA",
        bankAccountNumber: "1234567890",
        bankAccountHolder: "",
      }),
    ).toBe("profile.dataErrors.bankIncomplete");
  });

  test("nomor huruf / terlalu pendek / terlalu panjang = error bankAccountInvalid", () => {
    const base = { bankName: "BCA", bankAccountHolder: "Budi" };
    expect(validateBankDetails({ ...base, bankAccountNumber: "12AB34" })).toBe(
      "profile.dataErrors.bankAccountInvalid",
    );
    expect(validateBankDetails({ ...base, bankAccountNumber: "12345" })).toBe(
      "profile.dataErrors.bankAccountInvalid",
    );
    expect(
      validateBankDetails({ ...base, bankAccountNumber: "1".repeat(21) }),
    ).toBe("profile.dataErrors.bankAccountInvalid");
  });

  test("lengkap + nomor 6-20 digit = lolos (spasi/dash di nomor diabaikan)", () => {
    expect(
      validateBankDetails({
        bankName: "BCA",
        bankAccountNumber: "123 456-7890",
        bankAccountHolder: "Budi",
      }),
    ).toBeNull();
  });
});

describe("profileDataPayload bank", () => {
  test("field rekening ikut terkirim (nomor dinormalisasi)", () => {
    const payload = profileDataPayload({
      name: "Budi",
      address: "",
      phone: "",
      country: null,
      bankName: "BCA",
      bankAccountNumber: "123 456-7890",
      bankAccountHolder: "Budi",
    });
    expect(payload.bankName).toBe("BCA");
    expect(payload.bankAccountNumber).toBe("1234567890");
    expect(payload.bankAccountHolder).toBe("Budi");
  });
});

describe("fetchMyTripPayment organizerBank", () => {
  test("payments/me mengembalikan organizerBank untuk paid-join", async () => {
    mockFetch(200, {
      data: {
        payment: { id: "p1", status: "WAITING", amount: 150000 },
        organizerBank: {
          bankName: "BCA",
          bankAccountNumber: "1234567890",
          bankAccountHolder: "Budi",
        },
      },
    });
    const result = await fetchMyTripPayment("trip-1");
    expect(result?.payment.status).toBe("WAITING");
    expect(result?.organizerBank).toEqual({
      bankName: "BCA",
      bankAccountNumber: "1234567890",
      bankAccountHolder: "Budi",
    });
  });

  test("organizerBank null bila organizer belum mengisi rekening", async () => {
    mockFetch(200, {
      data: {
        payment: { id: "p1", status: "WAITING", amount: 150000 },
        organizerBank: null,
      },
    });
    const result = await fetchMyTripPayment("trip-1");
    expect(result?.organizerBank).toBeNull();
  });
});
