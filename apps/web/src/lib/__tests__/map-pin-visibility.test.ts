// Pin peta Ringkasan — dua perintah Wella 2 Nov 2026:
// (1) chip "Gunung" toggle tampil/sembunyi pin gunung, supaya pin trip
// dan pin gunung tidak menumpuk; (2) chip jenis trip (Pendakian/
// Touring/Semua) ikut memfilter PIN TRIP di peta, bukan hanya daftar.
// Predikatnya murni di map-pin-visibility.ts supaya bisa dites tanpa
// browser; wiring ke halaman dicek dari source (pola map-mountains.test.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
	tripPinMatchesKind,
	visibleMapMountains,
	type MapKindFilter
} from "../map-pin-visibility";
import { id } from "../i18n/id";
import { en } from "../i18n/en";

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const HIKING = { type: "HIKING" as const, isOpenTrip: false };
const TOURING = { type: "TOURING" as const, isOpenTrip: true };
const HIKING_OPEN = { type: "HIKING" as const, isOpenTrip: true };

describe("tripPinMatchesKind", () => {
	test("ALL meloloskan semua trip", () => {
		const kind: MapKindFilter = "ALL";
		expect(tripPinMatchesKind(HIKING, kind)).toBe(true);
		expect(tripPinMatchesKind(TOURING, kind)).toBe(true);
	});

	test("chip Pendakian (HIKING) → hanya pin HIKING", () => {
		expect(tripPinMatchesKind(HIKING, "HIKING")).toBe(true);
		expect(tripPinMatchesKind(HIKING_OPEN, "HIKING")).toBe(true);
		expect(tripPinMatchesKind(TOURING, "HIKING")).toBe(false);
	});

	test("chip Touring (TOURING) → hanya pin TOURING", () => {
		expect(tripPinMatchesKind(TOURING, "TOURING")).toBe(true);
		expect(tripPinMatchesKind(HIKING, "TOURING")).toBe(false);
		expect(tripPinMatchesKind(HIKING_OPEN, "TOURING")).toBe(false);
	});

	test("chip Open/Private tetap bekerja (tidak diubah perilaku lama)", () => {
		expect(tripPinMatchesKind(TOURING, "OPEN")).toBe(true);
		expect(tripPinMatchesKind(HIKING, "OPEN")).toBe(false);
		expect(tripPinMatchesKind(HIKING, "PRIVATE")).toBe(true);
		expect(tripPinMatchesKind(TOURING, "PRIVATE")).toBe(false);
	});
});

describe("visibleMapMountains (chip Gunung)", () => {
	const mountains = [
		{ isActive: true, lat: -7.5, lon: 110.0 },
		{ isActive: false, lat: -7.5, lon: 110.0 },
		{ isActive: true, lat: null, lon: 110.0 },
		{ isActive: true, lat: -7.5, lon: null }
	];

	test("default tampil (true) → hanya gunung aktif berkoordinat", () => {
		expect(visibleMapMountains(mountains, true)).toEqual([mountains[0]]);
	});

	test("toggle off (false) → tidak ada pin gunung sama sekali", () => {
		expect(visibleMapMountains(mountains, false)).toEqual([]);
	});

	test("toggle on kembali (daftar yang sama) → pin gunung muncul lagi", () => {
		expect(visibleMapMountains(mountains, false)).toEqual([]);
		expect(visibleMapMountains(mountains, true)).toEqual([mountains[0]]);
	});
});

describe("dashboard page wiring", () => {
	const page = src("../../routes/+page.svelte");

	test("updatePins memakai predikat jenis trip (bukan filter inline lama)", () => {
		expect(page).toContain("tripPinMatchesKind(trip, summaryKindFilter)");
	});

	test("chip jenis trip memicu gambar ulang pin (effect melacak filter secara eksplisit)", () => {
		// Penyebab bug lama: effect pin early-return saat mapHandle null
		// SEBELUM membaca summaryKindFilter, sehingga tidak ada dependensi
		// yang terlacak dan klik chip tidak pernah menggambar ulang pin.
		const start = page.indexOf("Re-render pins when the kind strip");
		expect(start).toBeGreaterThan(-1);
		const end = page.indexOf("});", start);
		const block = page.slice(start, end);
		expect(block).toContain("void summaryKindFilter");
		expect(block).toContain("updatePins()");
	});

	test("chip Gunung ada di strip, toggle state + gambar ulang peta", () => {
		const strip = page.slice(page.indexOf("{#snippet kindStripSnippet()}"));
		expect(strip).toContain("stripMountains");
		expect(strip).toContain("showMountains");
		expect(strip).toContain("void updateMap()");
	});

	test("updateMap memakai helper visibilitas gunung", () => {
		expect(page).toContain("visibleMapMountains(mapMountains, showMountains)");
	});

	test("pin trip tidak terpengaruh toggle Gunung (independen)", () => {
		const pins = page.slice(page.indexOf("function updatePins()"), page.indexOf("async function updateMap()"));
		expect(pins).not.toContain("showMountains");
	});
});

describe("stripMountains i18n", () => {
	test("id + en sama bentuknya", () => {
		type Dict = { dashboard?: Record<string, unknown> };
		expect((id as Dict).dashboard?.stripMountains).toBe("Gunung");
		expect((en as Dict).dashboard?.stripMountains).toBe("Mountains");
	});
});
