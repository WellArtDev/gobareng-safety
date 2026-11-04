// Halaman detail trip dashboard (perintah Wella 2 Nov 2026): tombol
// "Lihat Trip" di tabel Trip membuka halaman detail tersendiri, bukan
// lagi Ringkasan. Klik baris tabel tetap selectTrip + fokus tertunda
// ke Ringkasan (perilaku PR #159 tidak diubah).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { tripDetailRoleColor, tripDetailVisibility } from "../trip-detail";
import { en } from "../i18n/en";
import { id } from "../i18n/id";

describe("tripDetailVisibility", () => {
	test("harga > 0 → berbayar, apa pun isOpenTrip-nya", () => {
		expect(tripDetailVisibility({ isOpenTrip: true, price: 150000 })).toBe("paid");
		expect(tripDetailVisibility({ isOpenTrip: false, price: 150000 })).toBe("paid");
	});

	test("tanpa harga + open trip → publik", () => {
		expect(tripDetailVisibility({ isOpenTrip: true, price: null })).toBe("public");
		expect(tripDetailVisibility({ isOpenTrip: true })).toBe("public");
	});

	test("tanpa harga + bukan open trip → privat", () => {
		expect(tripDetailVisibility({ isOpenTrip: false, price: null })).toBe("private");
		expect(tripDetailVisibility({ isOpenTrip: false })).toBe("private");
	});

	test("harga 0 = gratis, bukan berbayar", () => {
		expect(tripDetailVisibility({ isOpenTrip: false, price: 0 })).toBe("private");
	});
});

describe("tripDetailRoleColor (sama dengan ROLE_COLORS map.ts)", () => {
	test("emas leader, oranye sweeper, putih medic, hijau member", () => {
		expect(tripDetailRoleColor("LEADER")).toBe("#f5c518");
		expect(tripDetailRoleColor("SWEEPER")).toBe("#f78308");
		expect(tripDetailRoleColor("MEDIC")).toBe("#ffffff");
		expect(tripDetailRoleColor("MEMBER")).toBe("#268c4a");
	});
});

describe("i18n tripDetail (id dan en bentuknya identik)", () => {
	const keys = [
		"back",
		"date",
		"departed",
		"destination",
		"mapTitle",
		"meetingPoint",
		"members",
		"noMembers",
		"noQuota",
		"noSos",
		"noSosNote",
		"notDeparted",
		"notFound",
		"paid",
		"quota",
		"sos",
		"title",
		"viewInSummary"
	];

	test("id + en punya kunci yang sama", () => {
		const idKeys = Object.keys(
			(id as unknown as { tripDetail: Record<string, string> }).tripDetail
		).sort();
		const enKeys = Object.keys(
			(en as unknown as { tripDetail: Record<string, string> }).tripDetail
		).sort();
		expect(idKeys).toEqual([...keys].sort());
		expect(enKeys).toEqual([...keys].sort());
	});

	test("nilai id/en", () => {
		const idDetail = (id as unknown as { tripDetail: Record<string, string> }).tripDetail;
		const enDetail = (en as unknown as { tripDetail: Record<string, string> }).tripDetail;
		expect(idDetail.back).toBe("Kembali");
		expect(enDetail.back).toBe("Back");
		expect(idDetail.viewInSummary).toBe("Lihat di Ringkasan");
		expect(enDetail.viewInSummary).toBe("View in Summary");
		expect(idDetail.paid).toBe("Berbayar");
		expect(enDetail.paid).toBe("Paid");
	});
});

describe("halaman detail trip di +page.svelte", () => {
	const src = readFileSync(new URL("../../routes/+page.svelte", import.meta.url), "utf8");
	const menusSrc = readFileSync(
		new URL("../dashboard-menus.ts", import.meta.url),
		"utf8"
	);

	test("dispatch menu merender tripDetailSnippet untuk activeMenu 'trip-detail'", () => {
		expect(src).toContain("{:else if activeMenu === 'trip-detail'}");
		expect(src).toContain("{@render tripDetailSnippet()}");
	});

	test("tombol Lihat Trip memanggil openTripDetail, bukan pindah ke Ringkasan", () => {
		const at = src.indexOf("$t('dashboard.viewTrip')");
		expect(at).toBeGreaterThan(0);
		const window = src.slice(Math.max(0, at - 2000), at);
		expect(window).toContain("openTripDetail(trip.id)");
		expect(window).not.toContain("activeMenu = 'summary'");
	});

	test("klik baris tabel tetap selectTrip (perilaku PR #159 tidak diubah)", () => {
		const row = src.match(
			/<tr\s+class:selected=\{trip\.id === selectedId\}[\s\S]{0,600}?onclick=\{\(\) => void selectTrip\(trip\.id\)\}/
		);
		expect(row).not.toBeNull();
	});

	test("snippet detail: tombol Kembali ke daftar Trip; Lihat di Ringkasan = anchor scroll, bukan pindah menu (klarifikasi Wella 18:19)", () => {
		const start = src.indexOf("{#snippet tripDetailSnippet()}");
		expect(start).toBeGreaterThan(0);
		const end = src.indexOf("{#snippet ", start + 1);
		const snippet = src.slice(start, end === -1 ? undefined : end);
		expect(snippet).toContain("activeMenu = 'trips'");
		expect(snippet).toContain("$t('tripDetail.back')");
		expect(snippet).toContain("$t('tripDetail.viewInSummary')");
		expect(snippet).toContain("getElementById('trip-detail-ai-summary')");
		expect(snippet).toContain("scrollIntoView");
		expect(snippet).not.toContain("void selectTrip(detailTrip.id)");
	});

	test("kartu Ringkasan di detail punya id anchor trip-detail-ai-summary", () => {
		const start = src.indexOf("{#snippet aiSummarySnippet()}");
		expect(start).toBeGreaterThan(0);
		const end = src.indexOf("{#snippet ", start + 1);
		const snippet = src.slice(start, end === -1 ? undefined : end);
		expect(snippet).toContain('id="trip-detail-ai-summary"');
	});

	test("snippet detail menampilkan anggota, SOS, peta, dan kuota", () => {
		const start = src.indexOf("{#snippet tripDetailSnippet()}");
		const end = src.indexOf("{#snippet ", start + 1);
		const snippet = src.slice(start, end === -1 ? undefined : end);
		expect(snippet).toContain("detailMembers");
		expect(snippet).toContain("detailSos");
		expect(snippet).toContain("bind:this={detailMapEl}");
		expect(snippet).toContain("$t('tripDetail.members')");
		expect(snippet).toContain("$t('tripDetail.sos')");
	});

	test("detail trip TIDAK masuk sidebar (tidak ada di dashboard-menus)", () => {
		expect(menusSrc).not.toContain("trip-detail");
	});
});
