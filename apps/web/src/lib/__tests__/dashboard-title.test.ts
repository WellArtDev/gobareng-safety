// Judul dashboard = 'GoBareng' di semua kemunculan judul lama
// 'GoBareng Safety — Posko Dashboard': meta.title i18n id/en (yang
// dirender <svelte:head> di +layout.svelte) dan <title> statis di
// app.html (fallback shell CSR). Judul halaman safety
// (safety.ccTitle — GoBareng) adalah judul halaman lain, bukan judul
// dashboard, dan tidak diubah.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("judul dashboard", () => {
	test("meta.title id dan en = 'GoBareng'", () => {
		expect(id.meta.title).toBe("GoBareng");
		expect(en.meta.title).toBe("GoBareng");
	});

	test("app.html memakai judul baru, judul lama hilang dari sumber", () => {
		const html = read("../../app.html");
		expect(html).toContain("<title>GoBareng</title>");
		for (const src of [
			html,
			read("../i18n/id.ts"),
			read("../i18n/en.ts"),
			read("../../routes/+layout.svelte")
		]) {
			expect(src).not.toContain("GoBareng Safety — Posko Dashboard");
		}
	});

	test("+layout.svelte merender judul dari meta.title", () => {
		expect(read("../../routes/+layout.svelte")).toContain("<title>{$t('meta.title')}</title>");
	});
});
