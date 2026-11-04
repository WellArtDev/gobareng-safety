// Guard "Trip yang Akan Datang" (1 Nov 2026): Demo Trip Prau (PLANNED,
// 28 Okt) tidak boleh lagi muncul 1 Nov; trip PLANNED bertanggal hari ini
// atau ke depan tetap muncul; status selain PLANNED tidak pernah upcoming.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { isMapVisibleTrip, isTripDatePast, isUpcomingTrip } from "../trip-dates";

// 1 Nov 2026 10:00 lokal (WIB di VM ini maupun browser Wella).
const NOW = new Date(2026, 10, 1, 10, 0, 0);

describe("isTripDatePast", () => {
	test("tanggal kemarin = lampau", () => {
		expect(isTripDatePast("2026-10-28", NOW)).toBe(true);
	});
	test("tanggal hari ini = belum lampau", () => {
		expect(isTripDatePast("2026-11-01", NOW)).toBe(false);
	});
	test("tanggal depan = belum lampau", () => {
		expect(isTripDatePast("2026-11-05", NOW)).toBe(false);
	});
	test("tanggal tak valid = tidak lampau (perilaku lama dipertahankan)", () => {
		expect(isTripDatePast("bukan-tanggal", NOW)).toBe(false);
	});
});

describe("isUpcomingTrip", () => {
	test("PLANNED kemarin bukan upcoming (kasus Demo Trip Prau)", () => {
		expect(isUpcomingTrip({ status: "PLANNED", date: "2026-10-28" }, NOW)).toBe(false);
	});
	test("PLANNED hari ini tetap upcoming", () => {
		expect(isUpcomingTrip({ status: "PLANNED", date: "2026-11-01" }, NOW)).toBe(true);
	});
	test("PLANNED ke depan tetap upcoming", () => {
		expect(isUpcomingTrip({ status: "PLANNED", date: "2026-11-05" }, NOW)).toBe(true);
	});
	test("ACTIVE/CLOSED tidak pernah upcoming", () => {
		expect(isUpcomingTrip({ status: "ACTIVE", date: "2026-11-05" }, NOW)).toBe(false);
		expect(isUpcomingTrip({ status: "CLOSED", date: "2026-11-05" }, NOW)).toBe(false);
	});
});

describe("isMapVisibleTrip", () => {
	test("PLANNED kemarin tersembunyi dari peta", () => {
		expect(isMapVisibleTrip({ status: "PLANNED", date: "2026-10-28" }, NOW)).toBe(false);
	});
	test("PLANNED hari ini dan besok tampil di peta", () => {
		expect(isMapVisibleTrip({ status: "PLANNED", date: "2026-11-01" }, NOW)).toBe(true);
		expect(isMapVisibleTrip({ status: "PLANNED", date: "2026-11-05" }, NOW)).toBe(true);
	});
	test("ACTIVE tampil di peta apa pun tanggalnya", () => {
		expect(isMapVisibleTrip({ status: "ACTIVE", date: "2026-10-28" }, NOW)).toBe(true);
		expect(isMapVisibleTrip({ status: "ACTIVE", date: "2026-11-05" }, NOW)).toBe(true);
	});
	test("CLOSED tersembunyi dari peta apa pun tanggalnya", () => {
		expect(isMapVisibleTrip({ status: "CLOSED", date: "2026-11-05" }, NOW)).toBe(false);
		expect(isMapVisibleTrip({ status: "CLOSED", date: "2026-10-28" }, NOW)).toBe(false);
	});
});

describe("halaman ringkasan memakai helper", () => {
	test("upcomingTrips memfilter lewat isUpcomingTrip", () => {
		const src = readFileSync(new URL("../../routes/+page.svelte", import.meta.url), "utf8");
		expect(src).toContain("trips.filter((trip) => isUpcomingTrip(trip))");
	});
	test("pin peta (updatePins + loadTripPins) memfilter lewat isMapVisibleTrip", () => {
		const src = readFileSync(new URL("../../routes/+page.svelte", import.meta.url), "utf8");
		// Dua call site: anchor pin dan gambar pin.
		const hits = src.split("trips.filter((trip) => isMapVisibleTrip(trip))").length - 1;
		expect(hits).toBe(2);
	});
});
