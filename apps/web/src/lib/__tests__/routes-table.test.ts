// Guard tabel Jalur + popup Tambah Jalur (1 Nov 2026): urutan kolom
// Nama Jalur, Gunung, Titik Kumpul, Jarak, Gain, Estimasi, Action;
// Action per jalur (Edit, Nonaktifkan/Aktifkan, Hapus) khusus admin;
// tombol Tambah Jalur membuka popup berisi pilihan gunung, nama jalur,
// titik kumpul, jarak, gain, estimasi, direkomendasikan, dan daftar
// pos berurutan (pos terakhir dilengkapi Puncak otomatis oleh API).
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
const start = src.indexOf("{#snippet mountainsSnippet()}");
expect(start).toBeGreaterThan(-1);
const end = src.indexOf("{#snippet settingsSnippet()}", start);
expect(end).toBeGreaterThan(start);
const snippet = src.slice(start, end);

// Blok tabel Jalur saja (dari select filter sampai akhir tabel).
const tableStart = snippet.indexOf("mountainsRoutesFilter");
expect(tableStart).toBeGreaterThan(-1);
const tableBlock = snippet.slice(tableStart);

describe("kunci i18n jalur", () => {
	test("semua kunci baru ada di id dan en", () => {
		for (const key of [
			"mountainsRoutesAdd",
			"mountainsRoutesAddTitle",
			"mountainsRoutesEditTitle",
			"mountainsRoutesFieldMountain",
			"mountainsRoutesPosts",
			"mountainsRoutesPostsHint",
			"mountainsRoutesAddPost",
			"mountainsRoutesRemovePost",
			"mountainsRoutesEdit",
			"mountainsRoutesDeactivate",
			"mountainsRoutesActivate",
			"mountainsRoutesDelete",
			"mountainsRoutesDeleteConfirm"
		]) {
			expect(typeof idD[key]).toBe("string");
			expect(typeof enD[key]).toBe("string");
		}
	});
});

describe("urutan kolom tabel jalur", () => {
	test("Nama Jalur, Gunung, Titik Kumpul, Jarak, Gain, Estimasi, Action", () => {
		const head = tableBlock.slice(0, tableBlock.indexOf("</thead>"));
		const order = [
			"mountainsRoutesName",
			"mountainsRoutesMountain",
			"mountainsRoutesMeetingPoint",
			"mountainsRoutesDistance",
			"mountainsRoutesGain",
			"mountainsRoutesEst",
			"tableAction"
		];
		let prev = -1;
		for (const key of order) {
			const at = head.indexOf(key);
			expect(at).toBeGreaterThan(prev);
			prev = at;
		}
	});

	test("baris memakai urutan yang sama: nama dulu, lalu gunung", () => {
		const body = tableBlock.slice(tableBlock.indexOf("<tbody>"));
		const nameAt = body.indexOf("{route.name}");
		const mountainAt = body.indexOf("openMountain(mountain.id)");
		expect(nameAt).toBeGreaterThan(-1);
		expect(mountainAt).toBeGreaterThan(nameAt);
	});
});

describe("aksi per jalur (admin-only)", () => {
	test("Edit, Nonaktifkan/Aktifkan, Hapus memanggil handler jalur", () => {
		for (const key of [
			"mountainsRoutesEdit",
			"mountainsRoutesDeactivate",
			"mountainsRoutesActivate",
			"mountainsRoutesDelete"
		]) {
			expect(tableBlock).toContain(key);
		}
		expect(tableBlock).toContain("openRouteEdit(mountain, route)");
		expect(tableBlock).toContain("toggleRouteActive(mountain, route)");
		expect(tableBlock).toContain("deleteRouteRow(mountain, route)");
		expect(tableBlock).toContain("class:toggle-off={route.isActive}");
	});
});

describe("popup tambah/edit jalur", () => {
	test("tombol Tambah Jalur di atas tabel, khusus admin", () => {
		expect(snippet).toContain("mountainsRoutesAdd");
		expect(snippet).toContain("openRouteCreate()");
		const btn = snippet.indexOf("openRouteCreate()");
		const filter = snippet.indexOf("mountainsRoutesFilter");
		expect(btn).toBeGreaterThan(-1);
		expect(filter).toBeGreaterThan(btn);
		expect(snippet.lastIndexOf("{#if isStaffAdmin}", btn)).toBeGreaterThan(-1);
	});

	test("popup berisi gunung, nama, titik kumpul, jarak, gain, estimasi, pos", () => {
		expect(snippet).toContain("showRouteModal");
		expect(snippet).toContain("mountainsRoutesFieldMountain");
		// Picker gunung modal pakai combobox (tambahan B), bukan <select>.
		expect(snippet).toContain("MountainCombobox");
		expect(snippet).toContain("value={routeMountainId}");
		expect(snippet).toContain("bind:value={routeName}");
		expect(snippet).toContain("bind:value={routeMeetingPoint}");
		expect(snippet).toContain("bind:value={routeDistanceKm}");
		expect(snippet).toContain("bind:value={routeGainM}");
		expect(snippet).toContain("bind:value={routeEstHours}");
		expect(snippet).toContain("bind:checked={routeRecommended}");
		expect(snippet).toContain("mountainsRoutesPostsHint");
		// Pos edit: nama + lat + lon per baris (tambahan A).
		expect(snippet).toContain("bind:value={routePosts[i].name}");
		expect(snippet).toContain("bind:value={routePosts[i].lat}");
		expect(snippet).toContain("bind:value={routePosts[i].lon}");
		// saveRoute/openRouteEdit ada di <script>, bukan di snippet.
		expect(src).toContain("toRoutePostPayload(routePosts)");
		expect(src).toContain("buildRouteEditPosts(route.posts, route.checkpoints)");
		expect(snippet).toContain("mountainsRoutesAddPost");
		expect(snippet).toContain("onsubmit={saveRoute}");
	});

	test("filter gunung pakai combobox cari (bukan select native), label tetap bawa jumlah rute", () => {
		// Dropdown 'Semua gunung' lama (select + option all) sudah diganti.
		expect(snippet).toContain("MountainCombobox");
		expect(snippet).toContain("value={mountainsRoutesFilter}");
		expect(snippet).toContain("mountainsRoutesAll");
		expect(snippet).toContain("`${m.name} (${m.routeCount})`");
		expect(snippet).not.toContain("bind:value={mountainsRoutesFilter}");
	});

	test("modal lihat jalur: judul hierarki + statistik pill + tabel checkpoint semantik", () => {
		const modalStart = snippet.indexOf("{#if routeMapTarget}");
		expect(modalStart).toBeGreaterThan(-1);
		const modalEnd = snippet.indexOf("{#if showRouteModal", modalStart);
		expect(modalEnd).toBeGreaterThan(modalStart);
		const modal = snippet.slice(modalStart, modalEnd);
		// Judul: gunung sebagai subjudul, rute sebagai heading (bukan
		// satu baris gabungan); tombol tutup tidak terjepit (flex gap).
		expect(modal).toContain("route-map-subtitle");
		expect(modal).toContain("{routeMapTarget.mountain.name}");
		expect(modal).toContain("{routeMapTarget.route.name}");
		expect(modal).not.toContain("{routeMapTarget.mountain.name} — {routeMapTarget.route.name}");
		// Statistik pill (bukan paragraf teks •).
		expect(modal).toContain("route-map-stats");
		expect(modal).toContain("mountainsRoutesDistance");
		expect(modal).toContain("mountainsRoutesGain");
		expect(modal).toContain("mountainsRoutesEst");
		// Tabel checkpoint: <table> semantik, header kunci i18n,
		// badge keterangan — bukan <ul> teks sambung • lagi.
		expect(modal).toContain("<table");
		expect(modal).toContain("route-map-table");
		expect(modal).toContain("mountainsRouteMapColPost");
		expect(modal).toContain("mountainsRouteMapColElevation");
		expect(modal).toContain("mountainsRouteMapColNotes");
		expect(modal).toContain("mountainsRouteMapAuto");
		expect(modal).toContain("mountainsRouteMapTarget");
		expect(modal).not.toContain("cp.elevationM} m{/if}{#if cp.autoCheckpoint}");
		// Modal dilebarkan khusus (modal lain tetap 520px).
		expect(src).toContain("route-map-modal");
		// Jenis checkpoint: legenda 3 warna + badge jenis di kolom
		// Keterangan (bukan hanya badge bawaan/tujuan).
		expect(modal).toContain("route-map-legend");
		expect(modal).toContain("mountainsRouteMapKindPost");
		expect(modal).toContain("mountainsRouteMapKindCamp");
		expect(modal).toContain("mountainsRouteMapKindPeak");
		expect(modal).toContain("row.kindClass");
		expect(modal).toContain("row.kindKey");
	});

	test("peta lihat jalur: marker berwarna per jenis + popup menyebut jenis", () => {
		// map.ts menggambar marker dari checkpointKind (bukan satu
		// warna hijau untuk semua) dan popup memakai label jenis.
		const mapSrc = read("../map.ts");
		expect(mapSrc).toContain("checkpointMarkerColor");
		expect(mapSrc).toContain("checkpointKind(cp.tags, cp.isTarget)");
		expect(mapSrc).toContain("labels.post");
		expect(mapSrc).toContain("labels.camp");
		expect(mapSrc).toContain("labels.peak");
		// Pemanggil mengoper label i18n ke setRouteTrack.
		expect(src).toContain("mountainsRouteMapKindCamp");
	});

	test("simpan memanggil API tambah/edit lalu menyegarkan daftar", () => {
		expect(src).toContain("api.createMountainRoute(routeMountainId, body)");
		expect(src).toContain("api.updateMountainRoute(");
		expect(src).toContain("await refreshMountainRoutes()");
	});

	test("detail gunung menampilkan alur pos basecamp sampai puncak", () => {
		expect(snippet).toContain("route.posts.join(' → ')");
	});
});
