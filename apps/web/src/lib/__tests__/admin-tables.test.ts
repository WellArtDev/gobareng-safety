// Guard tabel halaman admin (1 Nov 2026): Member, Verifikasi Organizer,
// Organizer, dan Trip tampil sebagai <table> gaya tabel Gunung
// (bukan kartu/list), dengan filter & aksi lama tetap jalan.
// Kunci i18n baru wajib ada di kedua bahasa (parity dijaga
// i18n-menus.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

type Dashboard = { dashboard: Record<string, unknown> };
const idD = (id as unknown as Dashboard).dashboard;
const enD = (en as unknown as Dashboard).dashboard;

const src = read("../../routes/+page.svelte");

function snippet(name: string, next: string): string {
  const start = src.indexOf(`{#snippet ${name}()}`);
  // next dicari sebagai awalan saja: mapSnippet punya parameter.
  const end = src.indexOf(`{#snippet ${next}`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const NEW_KEYS = [
  "tableName",
  "tablePhoto",
  "tableAction",
  "tripsTableType",
  "tripsTableStatus",
  "tripsTableVisibility",
  "tripsTableParticipants",
  "tripsTableSelect",
  "membersTableRole",
  "organizerTableArea",
  "organizerTableTrip",
  "organizerTableStat",
  "organizerTableRating",
  "verifyTableInfo",
  "verifyTableDetail",
  "verifyTableKtp",
  "verifyTableSubmitted",
  "verifyTableStatus",
  "verifyViewData",
  "verifyDataTitle",
  "verifyOrganizerName",
  "verifyAddress",
  "verifyKtpView",
  "verifyKtpMissing",
  "verifyKtpPresent",
  "verifyKtpAbsent",
] as const;

describe("kunci i18n tabel admin", () => {
  test("semua kunci baru ada di id dan en", () => {
    for (const key of NEW_KEYS) {
      expect(typeof idD[key]).toBe("string");
      expect(typeof enD[key]).toBe("string");
    }
  });
});

describe("halaman Trip jadi tabel", () => {
  const trips = snippet("tripsSnippet", "mapSnippet");
  test("daftar trip dirender sebagai tabel, bukan tombol kartu", () => {
    expect(trips).toContain('<table class="mountains-table">');
    expect(trips).not.toContain("trip-btn");
  });
  test("kolom + filter + aksi lihat trip tetap ada", () => {
    for (const key of [
      "dashboard.tableName",
      "dashboard.tripsTableType",
      "dashboard.tripsTableStatus",
      "dashboard.tripsTableVisibility",
      "dashboard.tripsTableParticipants",
      "dashboard.tableAction",
    ]) {
      expect(trips).toContain(`$t('${key}')`);
    }
    expect(trips).toContain("bind:value={tripSearch}");
    expect(trips).toContain("tripKindFilter");
    expect(trips).toContain("loadMeAndTrips()");
    // Klik baris tetap sekadar memilih (selectTrip); tombol aksi
    // membuka halaman detail trip tersendiri (perintah Wella 2 Nov
    // 2026), bukan lagi lompatan ke Ringkasan.
    expect(trips).toContain("selectTrip(trip.id)");
    expect(trips).toContain("$t('dashboard.viewTrip')");
    expect(trips).toContain("openTripDetail(trip.id)");
    expect(trips).not.toContain("activeMenu = 'summary'");
    expect(trips).not.toContain("$t('dashboard.tripsTableSelect')");
    expect(trips).toContain("class:selected={trip.id === selectedId}");
  });
  test("kartu buat trip (pratinjau nonaktif) sudah dihapus", () => {
    // Wella 1 Nov 2026: hapus kartu 'Buat Trip Baru' dari bawah tabel.
    // Key i18n-nya sengaja dibiarkan tak terpakai di kedua bahasa.
    expect(trips).not.toContain("$t('dashboard.createTrip')");
    expect(trips).not.toContain("$t('dashboard.createTripNotice')");
    expect(trips).not.toContain('class="form-grid"');
  });
});

describe("halaman Verifikasi Organizer jadi tabel", () => {
  const verify = snippet("verifySnippet", "organizerSnippet");
  test("antrean verifikasi dirender sebagai tabel, bukan kartu artikel", () => {
    expect(verify).toContain('<table class="mountains-table">');
    expect(verify).not.toContain("verify-row");
  });
  test("kolom + avatar + aksi setujui/tolak tetap ada", () => {
    for (const key of [
      "dashboard.tablePhoto",
      "dashboard.tableName",
      "dashboard.verifyTableDetail",
      "dashboard.verifyTableSubmitted",
      "dashboard.verifyTableStatus",
      "dashboard.tableAction",
    ]) {
      expect(verify).toContain(`$t('${key}')`);
    }
    expect(verify).toContain("verify-avatar-fallback");
    expect(verify).toContain("$t('dashboard.verifyWaiting')");
    expect(verify).toContain("decideVerification(person, true)");
    expect(verify).toContain("decideVerification(person, false)");
    expect(verify).toContain("verifyPending");
  });
  test("kolom Info sudah dihapus dari tabel verifikasi", () => {
    expect(verify).not.toContain("$t('dashboard.verifyTableInfo')");
    expect(verify).not.toContain("verification.primary");
  });
  test("kolom KTP + tombol Lihat Data + modal data pengajuan", () => {
    expect(verify).toContain("$t('dashboard.verifyTableKtp')");
    expect(verify).toContain("person.hasIdentityDocument");
    expect(verify).toContain("$t('dashboard.verifyKtpPresent')");
    expect(verify).toContain("$t('dashboard.verifyKtpAbsent')");
    expect(verify).toContain("openVerifyDetail(person)");
    expect(verify).toContain("$t('dashboard.verifyViewData')");
    expect(verify).toContain("verifyDetailTarget");
    expect(verify).toContain("$t('dashboard.verifyDataTitle')");
    expect(verify).toContain("verifyDetailTarget.organizerName");
    expect(verify).toContain("verifyDetailTarget.address");
    expect(verify).toContain("$t('dashboard.verifyKtpView')");
    expect(verify).toContain("$t('dashboard.verifyKtpMissing')");
    expect(verify).toContain("closeVerifyDetail()");
  });
  test("Lihat KTP memakai endpoint dokumen bertoken, bukan URL publik", () => {
    // Handler hidup di <script>, bukan di slice snippet — cek sumber penuh.
    expect(src).toContain("openVerifyKtp");
    expect(src).toContain("api.verificationDocument(person.id)");
    expect(src).toContain("window.open(verifyKtpUrl, '_blank')");
    expect(src).not.toContain("person.identityDocumentFilename");
  });
});

describe("halaman Organizer jadi tabel", () => {
  const organizer = snippet("organizerSnippet", "communityPageSnippet");
  test("daftar organizer dirender sebagai tabel, bukan kartu baris", () => {
    expect(organizer).toContain('<table class="mountains-table">');
    expect(organizer).not.toContain('class="row-item"');
  });
  test("kolom + pill terverifikasi + aksi lihat trip tetap ada", () => {
    for (const key of [
      "dashboard.tablePhoto",
      "dashboard.tableName",
      "dashboard.organizerTableArea",
      "dashboard.organizerTableTrip",
      "dashboard.organizerTableStat",
      "dashboard.organizerTableRating",
      "dashboard.tableAction",
    ]) {
      expect(organizer).toContain(`$t('${key}')`);
    }
    expect(organizer).toContain("$t('dashboard.organizerVerified')");
    expect(organizer).toContain("gotoOrganizerTrip(org)");
    expect(organizer).toContain("$t('dashboard.viewTrip')");
  });
});

describe("halaman Member jadi tabel", () => {
  const members = snippet("memberPageSnippet", "mountainsSnippet");
  test("daftar member dirender sebagai tabel, bukan alert-item", () => {
    expect(members).toContain('<table class="mountains-table">');
    expect(members).not.toContain("alert-item");
  });
  test("kolom + search + total + peran tetap ada", () => {
    expect(members).toContain("$t('dashboard.tableName')");
    expect(members).toContain("$t('dashboard.membersTableRole')");
    expect(members).toContain("bind:value={memberSearch}");
    expect(members).toContain("$t('dashboard.membersTotal')");
    expect(members).toContain("roles.${member.role}");
  });
});

describe("gaya baris terpilih tabel", () => {
  test("ada aturan tr.selected untuk baris trip yang dipilih", () => {
    expect(src).toContain(".mountains-table tr.selected");
  });
});
