// Popup Edit Profil member di halaman Member (admin-only, pola yang sama
// seperti popup Edit Profile staff PR #121): tiap baris admin punya tombol
// Edit Profil, popup mountains-modal-backdrop + focusTrap + tutup via
// Escape/backdrop, form nama/email saja (tanpa password — OTP_ONLY),
// tombol Simpan/Batal saja. Klien memanggil PATCH /admin/members/:id
// (route member yang memakai ulang helper profilePatch/saveProfilePatch
// API dengan gate perannya sendiri); halaman ini tidak menyentuh
// endpoint password apa pun.
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

const snippet = sliceSnippet("memberPageSnippet", "mountainsSnippet");
// {:else} cabang isStaffAdmin berindentasi 2 tab; {:else} rantai
// loaded/empty di dalamnya berindentasi 3 tab, jadi cari bentuk 2-tab.
const adminElse = snippet.indexOf("\n\t\t{:else}", snippet.indexOf("{#if isStaffAdmin}"));
const adminPart = snippet.slice(snippet.indexOf("{#if isStaffAdmin}"), adminElse);
const nonAdminPart = snippet.slice(adminElse);

describe("popup Edit Profil member", () => {
	test("kunci i18n edit profil member ada di id dan en", () => {
		for (const key of ["membersEditProfile", "membersEditProfileTitle", "membersEditProfileSaved"]) {
			expect(typeof idD[key]).toBe("string");
			expect(typeof enD[key]).toBe("string");
		}
	});

	test("tiap baris admin punya tombol Edit Profil, cabang non-admin tidak", () => {
		expect(adminPart).toContain("dashboard.membersEditProfile");
		expect(adminPart).toContain("openEditMember(member)");
		expect(nonAdminPart).not.toContain("dashboard.membersEditProfile");
	});

	test("popup memakai pola modal gunung + focus trap + Escape/backdrop", () => {
		expect(snippet).toContain("editMember");
		expect(snippet).toContain("dashboard.membersEditProfileTitle");
		expect(snippet).toContain('class="mountains-modal-backdrop"');
		expect(snippet).toContain('class="mountains-modal" use:focusTrap');
		expect(snippet).toContain("e.key === 'Escape'");
		expect(snippet).toContain("e.target === e.currentTarget");
	});

	test("popup berisi nama + email saja, tombol Simpan/Batal, tanpa password", () => {
		const modal = snippet.slice(snippet.indexOf("editMember"));
		expect(modal).toContain("bind:value={editMemberName}");
		expect(modal).toContain("bind:value={editMemberEmail}");
		expect(modal).toContain('class="mountains-edit-grid"');
		expect(modal).toContain("onsubmit={saveEditMember}");
		expect(modal).toContain("dashboard.staff.save");
		expect(modal).toContain("dashboard.staff.cancel");
		expect(modal).not.toContain('type="password"');
		expect(modal).not.toContain("editMemberPassword");
	});

	test("simpan memanggil PATCH member, refresh daftar, tutup popup; error di dalam popup", () => {
		expect(src).toContain("api.updateMember(");
		expect(src).toContain("editMember = null;");
		expect(src).toContain("editMemberErrorCode");
		expect(src).toContain("dashboard.membersEditProfileSaved");
	});

	test("klien api updateMember PATCH /admin/members/:id nama/email saja", () => {
		expect(apiSrc).toContain("updateMember:");
		expect(apiSrc).toContain("/api/v1/admin/members/${id}");
		expect(apiSrc).toContain("method: 'PATCH'");
		expect(apiSrc).not.toContain("members/${id}/password");
	});
});
