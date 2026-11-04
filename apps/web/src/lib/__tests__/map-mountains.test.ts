// Titik gunung di peta dashboard (ala muncak) — source checks, no
// browser needed. Keputusan Wella 1 Nov 2026 04:28: titik bisa diklik,
// popup menampilkan nama + ketinggian + jumlah jalur.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { id } from "../i18n/id";
import { en } from "../i18n/en";

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("map.ts: mountain markers", () => {
	const map = src("../map.ts");

	test("setMountains exists on the map handle with its own layer", () => {
		expect(map).toContain("setMountains");
		expect(map).toContain("mountainLayer");
	});

	test("marker is the GoBareng pin logo, not a member dot or glyph", () => {
		expect(map).toContain("mountain-pin.png");
		expect(map).toContain("L.icon");
		expect(map).not.toContain("⛰️");
	});

	test("pin logo asset exists as a transparent PNG", () => {
		const png = readFileSync(new URL("../../../static/mountain-pin.png", import.meta.url));
		expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(png[25]).toBe(6); // IHDR color type 6 = RGBA
	});

	test("click opens a popup with name, elevation and route count", () => {
		expect(map).toContain("bindPopup");
		expect(map).toContain("elevationUnit");
		expect(map).toContain("routeCount");
		expect(map).toContain("labels.trails");
	});

	test("mountains without coordinates are skipped", () => {
		expect(map).toContain("m.lat == null");
		expect(map).toContain("m.lon == null");
	});
});

describe("dashboard page: mountains on the login map", () => {
	const page = src("../../routes/+page.svelte");

	test("catalog loads once after login and feeds the map", () => {
		expect(page).toContain("loadMapMountains");
		expect(page).toContain("api.mountains()");
		expect(page).toContain("setMountains(");
	});

	test("only active mountains with coordinates render", () => {
		// Filter pindah ke map-pin-visibility.ts (chip Gunung) — intinya
		// sama: hanya gunung aktif berkoordinat yang di-render.
		const helper = src("../map-pin-visibility.ts");
		expect(helper).toMatch(/isActive && m\.lat != null && m\.lon != null/);
		expect(page).toContain("visibleMapMountains(mapMountains, showMountains)");
	});

	test("mountains redraw the map once loaded (no menu switch needed)", () => {
		const start = page.indexOf("async function loadMapMountains()");
		const end = page.indexOf("function updatePins()", start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		expect(page.slice(start, end)).toContain("updateMap()");
	});

	test("legend gains a mountain entry with the pin logo", () => {
		expect(page).toContain("legend-pin");
		expect(page).toContain("mountain-pin.png");
		expect(page).toContain("map.legendMountain");
	});
});

describe("map i18n", () => {
	test("legendMountain and mountainTrails exist in both dictionaries", () => {
		type Dict = { map?: Record<string, unknown> };
		expect((id as Dict).map?.legendMountain).toBe("Gunung");
		expect((en as Dict).map?.legendMountain).toBe("Mountain");
		expect((id as Dict).map?.mountainTrails).toBe("jalur");
		expect((en as Dict).map?.mountainTrails).toBe("trails");
	});
});
