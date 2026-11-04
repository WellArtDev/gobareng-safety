// Tabel Trip dashboard (perintah Wella 2 Nov 2026): trip PLANNED yang
// tanggalnya sudah lewat tampil "Expired" (tampilan saja, enum DB tidak
// berubah), dan kolom Tanggal ada di urutan kedua setelah Nama.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { isTripDatePast, isTripExpired } from "../trip-dates";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

// 2 Nov 2026 10:00 lokal — sehari setelah Demo Trip Prau (28 Okt).
const NOW = new Date(2026, 10, 2, 10, 0, 0);

describe("isTripExpired", () => {
	test("PLANNED kemarin → expired (kasus Demo Trip Prau)", () => {
		expect(isTripExpired({ status: "PLANNED", date: "2026-10-28" }, NOW)).toBe(true);
	});
	test("PLANNED hari ini → tidak expired", () => {
		expect(isTripExpired({ status: "PLANNED", date: "2026-11-02" }, NOW)).toBe(false);
	});
	test("PLANNED ke depan → tidak expired", () => {
		expect(isTripExpired({ status: "PLANNED", date: "2026-11-05" }, NOW)).toBe(false);
	});
	test("ACTIVE/CLOSED tanggal lampau → tidak expired (status asli dipertahankan)", () => {
		expect(isTripExpired({ status: "ACTIVE", date: "2026-10-28" }, NOW)).toBe(false);
		expect(isTripExpired({ status: "CLOSED", date: "2026-10-28" }, NOW)).toBe(false);
	});
	test("tanggal tak valid → tidak expired (perilaku isTripDatePast)", () => {
		expect(isTripExpired({ status: "PLANNED", date: "bukan-tanggal" }, NOW)).toBe(false);
	});
	test("konsisten dengan isTripDatePast untuk PLANNED", () => {
		for (const date of ["2026-10-28", "2026-11-02", "2026-11-05"]) {
			expect(isTripExpired({ status: "PLANNED", date }, NOW)).toBe(
				isTripDatePast(date, NOW)
			);
		}
	});
});

describe("label Expired di i18n (id dan en sama, kata Wella)", () => {
	test("id + en punya trips.statuses.EXPIRED = 'Expired'", () => {
		expect((id.trips.statuses as Record<string, string>).EXPIRED).toBe("Expired");
		expect((en.trips.statuses as Record<string, string>).EXPIRED).toBe("Expired");
	});
	test("id + en punya tripsTableDate", () => {
		expect((id.dashboard as Record<string, string>).tripsTableDate).toBe("Tanggal");
		expect((en.dashboard as Record<string, string>).tripsTableDate).toBe("Date");
	});
});

describe("tabel Trip di +page.svelte", () => {
	const src = readFileSync(new URL("../../routes/+page.svelte", import.meta.url), "utf8");

	test("urutan kolom: Nama, Tanggal, Jenis, Status, Sifat, Peserta, Aksi", () => {
		const header = src.match(
			/<th>\{\$t\('dashboard\.tableName'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tripsTableDate'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tripsTableType'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tripsTableStatus'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tripsTableVisibility'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tripsTableParticipants'\)\}<\/th>\s*<th>\{\$t\('dashboard\.tableAction'\)\}<\/th>/
		);
		expect(header).not.toBeNull();
	});
	test("sel Tanggal memakai fmtTripDate yang sudah ada", () => {
		expect(src).toContain("{fmtTripDate(trip.date)}");
	});
	test("badge status memakai isTripExpired + label EXPIRED", () => {
		expect(src).toContain("isTripExpired(trip)");
		expect(src).toContain("trips.statuses.EXPIRED");
	});
});
