// Form "Isi Data Profil": validasi telepon/nama, normalisasi payload,
// daftar negara + bendera, dan body PATCH /auth/me.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { en } from "../i18n/en";
import { id } from "../i18n/id";
import {
  COUNTRY_CODES,
  countryFlag,
  filterCountryCodes,
} from "../utils/countries";
import {
  profileDataPayload,
  updateMe,
  validateProfileData,
  validateProfilePhone,
} from "../utils/profile-api";
import { setSessionCache } from "../utils/session-token";

const realFetch = globalThis.fetch;
let lastRequest: { url: string; init?: RequestInit } | null = null;

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    lastRequest = { url: String(url), init };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  setSessionCache("jwt-tes", "Budi");
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionCache(undefined, undefined);
  lastRequest = null;
});

const me = {
  id: "u1",
  email: "budi@example.com",
  name: "Budi",
  slug: "budi",
  phone: "081234567890",
  country: "ID",
  address: "Jl. Kenangan 1",
  isAdmin: false,
  role: "user",
  isVerified: false,
  avatarUrl: null,
};

describe("validateProfilePhone", () => {
  test("kosong boleh, spasi/dash diabaikan, format server diterima", () => {
    expect(validateProfilePhone("")).toBeNull();
    expect(validateProfilePhone("0812 3456-7890")).toBeNull();
    expect(validateProfilePhone("+6281234567890")).toBeNull();
  });

  test("nomor tak valid ditolak dengan pesan, bukan diam-diam jadi null", () => {
    expect(validateProfilePhone("abc")).toBe("profile.dataErrors.phoneInvalid");
    expect(validateProfilePhone("123")).toBe("profile.dataErrors.phoneInvalid");
    expect(validateProfilePhone("08123456789012345")).toBe(
      "profile.dataErrors.phoneInvalid",
    );
  });
});

describe("validateProfileData + profileDataPayload", () => {
  test("nama pendek ditolak dulu, lalu telepon", () => {
    expect(
      validateProfileData({
        name: "A",
        address: "",
        phone: "abc",
        country: null,
      }),
    ).toBe("profile.editErrors.nameRequired");
    expect(
      validateProfileData({
        name: "Budi",
        address: "",
        phone: "abc",
        country: null,
      }),
    ).toBe("profile.dataErrors.phoneInvalid");
    expect(
      validateProfileData({
        name: "Budi",
        address: "",
        phone: "",
        country: "ID",
      }),
    ).toBeNull();
  });

  test("payload: trim nama/alamat, strip telepon, string kosong = hapus, negara null = hapus", () => {
    expect(
      profileDataPayload({
        name: "  Budi  ",
        address: "  Jl. Kenangan 1  ",
        phone: "0812 3456-7890",
        country: "ID",
      }),
    ).toEqual({
      name: "Budi",
      phone: "081234567890",
      address: "Jl. Kenangan 1",
      country: "ID",
    });
    expect(
      profileDataPayload({
        name: "Budi",
        address: "   ",
        phone: "",
        country: null,
      }),
    ).toEqual({ name: "Budi", phone: "", address: "", country: null });
  });
});

describe("negara", () => {
  test("ID di depan, tanpa duplikat, bendera benar", () => {
    expect(COUNTRY_CODES[0]).toBe("ID");
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(countryFlag("ID")).toBe("🇮🇩");
    expect(countryFlag(null)).toBe("—");
    expect(countryFlag("ZZZ")).toBe("—");
  });
});

describe("updateMe untuk isi data profil", () => {
  test("mengirim nama + alamat + telepon + negara ke PATCH /auth/me", async () => {
    mockFetch(200, { data: { user: me } });
    await updateMe({
      name: "Budi",
      phone: "081234567890",
      address: "Jl. Kenangan 1",
      country: "ID",
    });
    expect(lastRequest?.url).toContain("/auth/me");
    expect(lastRequest?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(lastRequest?.init?.body))).toEqual({
      name: "Budi",
      phone: "081234567890",
      address: "Jl. Kenangan 1",
      country: "ID",
    });
  });
});

describe("registrasi otp: kunci negara + validasi telepon", () => {
  test("kunci negara daftar ada di id/en, daftar negara mulai dari ID", () => {
    expect(id.auth.registerCountry).toBe("Negara (opsional)");
    expect(en.auth.registerCountry).toBe("Country (optional)");
    expect(id.auth.registerCountryPlaceholder).toBe("Pilih negara");
    expect(en.auth.registerCountryPlaceholder).toBe("Select country");
    expect(COUNTRY_CODES[0]).toBe("ID");
  });

  test("telepon daftar memakai validasi yang sama dengan isi data profil", () => {
    expect(validateProfilePhone("")).toBeNull();
    expect(validateProfilePhone("0812 3456 7890")).toBeNull();
    expect(validateProfilePhone("123")).toBe("profile.dataErrors.phoneInvalid");
  });
});

describe("filterCountryCodes (pencarian di picker negara)", () => {
  test("query kosong -> semua kode, urutan daftar dipertahankan", () => {
    expect(filterCountryCodes("")).toEqual(COUNTRY_CODES);
    expect(filterCountryCodes("   ")).toEqual(COUNTRY_CODES);
  });

  test("query dicocokkan substring kode, tidak peka huruf", () => {
    const hasil = filterCountryCodes("id");
    expect(hasil).toContain("ID");
    expect(hasil).not.toContain("US");
    expect(filterCountryCodes("ID")).toEqual(hasil);
    expect(filterCountryCodes("  us ")).toContain("US");
  });

  test("tanpa kecocokan -> daftar kosong", () => {
    expect(filterCountryCodes("ZZ")).toEqual([]);
  });

  test("kunci placeholder pencarian ada di id dan en", () => {
    expect(id.profile.dataCountrySearch).toBe("Cari negara (mis. ID)…");
    expect(en.profile.dataCountrySearch).toBe("Search country (e.g. ID)…");
  });
});
