// Input alasan penolakan di UI admin antrean proposal (menu proposals):
// tombol Tolak membuka popup (pola modal gunung) berisi input alasan
// opsional; submit mengirim reason ke api.rejectProposal yang sudah
// menerima field itu (API + klien sudah ada, hanya UI yang kurang).
// Jalur Setujui tidak berubah (tetap window.confirm).
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
const apiSrc = read("../api.ts");

function sliceSnippet(name: string, next: string): string {
	const start = src.indexOf(`{#snippet ${name}()}`);
	const end = src.indexOf(`{#snippet ${next}`, start);
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return src.slice(start, end);
}

const snippet = sliceSnippet("proposalsSnippet", "verifySnippet");

describe("input alasan penolakan proposal", () => {
	test("kunci i18n alasan penolakan ada di id dan en", () => {
		for (const key of [
			"proposalsRejectReasonLabel",
			"proposalsRejectReasonPlaceholder",
			"proposalsRejectCancel"
		]) {
			expect(typeof idD[key]).toBe("string");
			expect(typeof enD[key]).toBe("string");
		}
	});

	test("klien rejectProposal sudah mengirim reason (prasyarat UI)", () => {
		expect(apiSrc).toContain("rejectProposal:");
		expect(apiSrc).toContain("reason?: string");
		expect(apiSrc).toContain("JSON.stringify(reason ? { reason } : {})");
	});

	test("tombol Tolak di kedua tabel membuka popup alasan, bukan confirm", () => {
		expect(snippet).toContain("proposalRejectTarget");
		expect(snippet).toContain("decideProposal('mountain', p.id, p.name, false)");
		expect(snippet).toContain("decideProposal('route', p.id, p.name, false)");
		// confirm hanya untuk Setujui; penolakan lewat popup.
		expect(src).toContain("dashboard.proposalsApproveConfirm");
		expect(src).not.toContain(
			"approve\n\t\t\t\t\t\t? 'dashboard.proposalsApproveConfirm'\n\t\t\t\t\t\t: 'dashboard.proposalsRejectConfirm'"
		);
	});

	test("popup penolakan memakai pola modal gunung + input alasan + Tolak/Batal", () => {
		expect(snippet).toContain('class="mountains-modal-backdrop"');
		expect(snippet).toContain('class="mountains-modal"');
		expect(snippet).toContain("use:focusTrap");
		expect(snippet).toContain("e.key === 'Escape'");
		expect(snippet).toContain("bind:value={proposalRejectReason}");
		expect(snippet).toContain("dashboard.proposalsRejectReasonLabel");
		expect(snippet).toContain("dashboard.proposalsRejectReasonPlaceholder");
		expect(snippet).toContain("dashboard.proposalsRejectCancel");
		expect(snippet).toContain("dashboard.proposalsReject");
	});

	test("submit popup mengirim reason, menghapus dari antrean, menutup popup", () => {
		expect(src).toContain("api.rejectProposal(");
		expect(src).toContain("proposalRejectReason");
		expect(src).toContain("proposalRejectTarget = null");
		expect(src).toContain("dashboard.proposalsRejectedNotice");
	});
});
