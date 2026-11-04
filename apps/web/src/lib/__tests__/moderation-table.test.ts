// Guard tabel Moderasi Komunitas (1 Nov 2026): daftar laporan terbuka
// (OPEN saja, dari api.reports('OPEN')) tampil sebagai tabel gaya
// tabel Gunung — sama seperti Member/Verifikasi/Organizer/Trip —
// bukan lagi kartu .row-line. Semua info & aksi dipertahankan:
// Target/Pelapor/Alasan/Dilaporkan/Status/Aksi (Tindak = setujui
// laporan -> hijau, Abaikan = tolak laporan -> merah, sejalan dengan
// bahasa warna Setujui/Tolak di tabel Verifikasi).
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
  const end = src.indexOf(`{#snippet ${next}`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

const NEW_KEYS = [
  "moderationTableTarget",
  "moderationTableReporter",
  "moderationTableReason",
  "moderationTableDate",
];

describe("kunci i18n tabel Moderasi", () => {
  for (const key of NEW_KEYS) {
    test(`${key} ada di id + en`, () => {
      expect(typeof idD[key]).toBe("string");
      expect(typeof enD[key]).toBe("string");
    });
  }
});

describe("snippet moderationSnippet", () => {
  const body = snippet("moderationSnippet", "notificationsSnippet");

  test("tabel mountains-table, bukan kartu row-line", () => {
    expect(body).toContain("mountains-table");
    expect(body).not.toContain("row-line");
  });

  test("kolom Target/Pelapor/Alasan/Dilaporkan/Status/Aksi", () => {
    for (const key of [
      "dashboard.moderationTableTarget",
      "dashboard.moderationTableReporter",
      "dashboard.moderationTableReason",
      "dashboard.moderationTableDate",
      "dashboard.membersTableStatus",
      "dashboard.tableAction",
    ]) {
      expect(body).toContain(`$t('${key}')`);
    }
  });

  test("isi baris + status Terbuka + aksi Tindak/Abaikan", () => {
    expect(body).toContain("report.targetType");
    expect(body).toContain("report.reporterName");
    expect(body).toContain("report.reason");
    expect(body).toContain("report.createdAt");
    expect(body).toContain("dashboard.moderationStatusOpen");
    expect(body).toContain("decideReport(report, 'ACTIONED')");
    expect(body).toContain("decideReport(report, 'DISMISSED')");
    expect(body).toContain("dashboard.moderationAct");
    expect(body).toContain("dashboard.moderationDismiss");
    expect(body).toContain("mountains-action-btn toggle-on");
    expect(body).toContain("mountains-action-btn delete");
  });

  test("state kosong & loading dipertahankan", () => {
    expect(body).toContain("dashboard.moderationEmpty");
    expect(body).toContain("common.loading");
  });
});
