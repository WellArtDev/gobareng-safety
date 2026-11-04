// Switcher gaya peta dashboard (Standar/Satelit) lewat createMap bersama
// di map.ts: default = gaya yang sekarang (tileUrl pemanggil = Standar),
// tombol switcher ada di SEMUA peta dashboard karena semuanya dibuat
// lewat createMap — tidak ada peta dashboard lain di luar createMap.
// Label lewat i18n id/en bentuk identik.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function count(hay: string, needle: string): number {
	return hay.split(needle).length - 1;
}

type MapDict = { map: Record<string, unknown> };
const idMap = (id as unknown as MapDict).map;
const enMap = (en as unknown as MapDict).map;

const mapSrc = read("../map.ts");
const page = read("../../routes/+page.svelte");
const safety = read("../../routes/safety/+page.svelte");

describe("switcher gaya peta di createMap", () => {
	test("kunci i18n gaya peta ada di id dan en", () => {
		for (const key of ["styleStandard", "styleSatellite"]) {
			expect(typeof idMap[key]).toBe("string");
			expect(typeof enMap[key]).toBe("string");
		}
	});

	test("createMap menerima label gaya + punya 2 layer (standar default, satelit Esri)", () => {
		expect(mapSrc).toContain("styleLabels.standard");
		expect(mapSrc).toContain("styleLabels.satellite");
		expect(mapSrc).toContain("World_Imagery");
		expect(mapSrc).toContain("arcgisonline.com");
	});

	test("default = gaya sekarang: layer tileUrl ditambahkan saat init, satelit tidak", () => {
		const std = mapSrc.indexOf("L.tileLayer(tileUrl");
		expect(std).toBeGreaterThan(-1);
		expect(mapSrc.slice(std, std + 200)).toContain(".addTo(map)");
		// Pernyataan layer satelit saja (deklarasi s/d penutupnya): tanpa addTo.
		const satDecl = mapSrc.indexOf("const satelliteLayer");
		const satEnd = mapSrc.indexOf(");", satDecl);
		expect(satDecl).toBeGreaterThan(-1);
		expect(mapSrc.slice(satDecl, satEnd)).not.toContain(".addTo(map)");
	});

	test("switcher = overlay 2 tombol di kontainer peta + aria-pressed + ganti layer", () => {
		expect(mapSrc).toContain("getContainer().appendChild");
		expect(mapSrc).toContain("createElement('button')");
		expect(mapSrc).toContain("aria-pressed");
		expect(mapSrc).toContain("removeLayer");
		expect(mapSrc).toContain("standardLayer");
		expect(mapSrc).toContain("satelliteLayer");
	});

	test("tidak ada peta dashboard di luar createMap", () => {
		expect(page).not.toContain("L.map(");
		expect(safety).not.toContain("L.map(");
		expect(page).not.toContain("L.tileLayer(");
		expect(safety).not.toContain("L.tileLayer(");
	});
});

describe("semua pemakai createMap ikut dapat switcher", () => {
	test("halaman utama: 3 createMap (overview + modal detail jalur + peta detail trip), masing-masing berlabel i18n", () => {
		expect(count(page, "await createMap(")).toBe(3);
		expect(count(page, "$t('map.styleStandard')")).toBe(3);
		expect(count(page, "$t('map.styleSatellite')")).toBe(3);
	});

	test("halaman safety: 1 createMap, berlabel i18n", () => {
		expect(count(safety, "await createMap(")).toBe(1);
		expect(count(safety, "$t('map.styleStandard')")).toBe(1);
		expect(count(safety, "$t('map.styleSatellite')")).toBe(1);
	});
});
