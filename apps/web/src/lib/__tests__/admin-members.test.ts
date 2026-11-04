// Guard tabel manajemen Member (1 Nov 2026): halaman Member untuk admin
// menampilkan SEMUA user sebagai tabel (Nama/Email/No HP/Negara/Status/
// Aksi), bukan lagi anggota trip terpilih; status = tier Unverified /
// Verified / Pro (Pro = upgrade berbayar terverifikasi, PAY) + penanda
// Banned; aksi Ban/Unban, Hapus (admin-only, server-side).
// Ganti password DIHAPUS bersama login password (OTP passwordless,
// Wella 1 Nov 2026): endpoint PATCH /admin/members/:id/password 410,
// UI ganti password member dihapus dari halaman ini.
// Kunci i18n baru wajib ada di kedua bahasa (parity dijaga
// i18n-menus.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";
import { getMemberTier } from "../member-tier";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

type Dashboard = { dashboard: Record<string, unknown> };
const idD = (id as unknown as Dashboard).dashboard;
const enD = (en as unknown as Dashboard).dashboard;

const src = read("../../routes/+page.svelte");
const apiSrc = read("../../lib/api.ts");

function snippet(name: string, next: string): string {
  const start = src.indexOf(`{#snippet ${name}()}`);
  const end = src.indexOf(`{#snippet ${next}`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const NEW_KEYS = [
  "membersTableEmail",
  "membersTablePhone",
  "membersTableCountry",
  "membersTableStatus",
  "membersStatusUnverified",
  "membersStatusVerified",
  "membersStatusPro",
  "membersStatusBanned",
  "membersActionBan",
  "membersActionUnban",
    "membersActionDelete",
  "membersDeleteConfirm",
            "membersSearchAdmin",
  "membersEmptyAdmin",
  "membersCountrySelect",
];

describe("tier member", () => {
  test("Pro menang atas Verified; Verified atas Unverified", () => {
    expect(getMemberTier(false, false)).toBe("unverified");
    expect(getMemberTier(true, false)).toBe("verified");
    expect(getMemberTier(false, true)).toBe("pro");
    expect(getMemberTier(true, true)).toBe("pro");
  });
});

describe("kunci i18n tabel manajemen Member", () => {
  for (const key of NEW_KEYS) {
    test(`${key} ada di id + en`, () => {
      expect(typeof idD[key]).toBe("string");
      expect(typeof enD[key]).toBe("string");
    });
  }
});

describe("snippet memberPageSnippet (admin)", () => {
  const body = snippet("memberPageSnippet", "mountainsSnippet");

  test("kolom Nama/Email/No HP/Negara/Status/Aksi", () => {
    for (const key of [
      "dashboard.tableName",
      "dashboard.membersTableEmail",
      "dashboard.membersTablePhone",
      "dashboard.membersTableCountry",
      "dashboard.membersTableStatus",
      "dashboard.tableAction",
    ]) {
      expect(body).toContain(`$t('${key}')`);
    }
  });

  test("status pakai tier + penanda banned", () => {
    expect(body).toContain("getMemberTier(");
    expect(body).toContain("dashboard.membersStatusBanned");
  });

  test("aksi Ban/Unban, Hapus (handler di snippet, API di script); ganti password dihapus (OTP)", () => {
    for (const handler of ["toggleMemberBan", "deleteAdminMember"]) {
      expect(body).toContain(handler);
    }
    // Pemanggilan API + konfirmasi hapus tinggal di handler script.
    for (const call of [
      "api.suspendMember",
      "api.unsuspendMember",
      "api.deleteMember",
      "dashboard.membersDeleteConfirm",
    ]) {
      expect(src).toContain(call);
    }
    expect(src).not.toContain("openMemberPassword");
    expect(src).not.toContain("membersActionChangePassword");
  });

  test("form search member di atas tabel", () => {
    expect(body).toContain("dashboard.membersSearchAdmin");
  });

  test("tidak ada lagi modal ganti password (OTP passwordless)", () => {
    expect(body).not.toContain("dashboard.membersChangePasswordTitle");
    expect(body).not.toContain("dashboard.membersNewPassword");
    expect(body).not.toContain("dashboard.membersConfirmPassword");
    expect(apiSrc).not.toContain("changeMemberPassword");
  });

  test("tampilan non-admin (anggota trip) tetap dipertahankan", () => {
    expect(body).toContain("dashboard.membersTableRole");
  });
});

describe("klien API manajemen Member", () => {
  test("adminMembers membawa proUserIds; password member dihapus, delete tetap", () => {
    expect(apiSrc).toContain("proUserIds: string[]");
    expect(apiSrc).not.toContain("changeMemberPassword");
    // Jalur password member yang dihapus (bukan sembarang substring
    // "/password": komentar OTP di api.ts masih menyebut path lama).
    expect(apiSrc).not.toContain("members/${id}/password");
    // Tindak lanjut #122 setelah OTP merge: klien changePassword akun
    // sendiri dicopot bersama tab Ubah Kata Sandi (endpointnya 410).
    expect(apiSrc).not.toContain("'/api/v1/auth/me/password'");
    expect(apiSrc).toContain("deleteMember");
    expect(apiSrc).toContain("method: 'DELETE'");
  });
});

describe("kolom Negara = ikon bendera saja (go international)", () => {
  test("countryFlag: ID -> 🇮🇩, US -> 🇺🇸, kosong/tak valid -> —", async () => {
    const { countryFlag, COUNTRY_CODES } = await import("../countries");
    expect(countryFlag("ID")).toBe("🇮🇩");
    expect(countryFlag("US")).toBe("🇺🇸");
    expect(countryFlag(null)).toBe("—");
    expect(countryFlag("IDD")).toBe("—");
    expect(countryFlag("1D")).toBe("—");
    expect(COUNTRY_CODES[0]).toBe("ID");
    expect(COUNTRY_CODES).toContain("US");
  });

  test("sel Negara di snippet: flag-select + setMemberCountry", () => {
    const body = snippet("memberPageSnippet", "mountainsSnippet");
    expect(body).toContain("flag-select");
    expect(body).toContain("countryFlag(");
    expect(body).toContain("changeMemberCountry");
    expect(body).toContain("dashboard.membersCountrySelect");
    expect(apiSrc).toContain("setMemberCountry");
    expect(apiSrc).toContain("/country");
  });
});
