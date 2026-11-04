// Guard tabel Akun Staff + popup Buat Akun (1 Nov 2026): daftar staff tampil
// sebagai <table> gaya tabel Gunung (bukan kartu), tombol Buat Akun di atas
// tabel membuka popup berisi form lama, dan aksi Tangguhkan/Aktifkan tetap.
// Bonus: key dashboard.staff.email yang hilang (label tampil mentah di
// screenshot Wella) kini ada di kedua bahasa, bersama staff.status.
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
const start = src.indexOf("{#snippet staffSnippet()}");
expect(start).toBeGreaterThan(-1);
// staffSnippet adalah snippet terakhir: iris sampai akhir file.
const snippet = src.slice(start);

describe("kunci i18n staff", () => {
	test("email + status ada di id dan en", () => {
		const staffId = idD.staff as Record<string, unknown>;
		const staffEn = enD.staff as Record<string, unknown>;
		for (const key of ["email", "status", "create", "formTitle", "listTitle"]) {
			expect(typeof staffId[key]).toBe("string");
			expect(typeof staffEn[key]).toBe("string");
		}
	});
});

describe("daftar staff jadi tabel", () => {
	test("memakai mountains-table dengan 5 kolom", () => {
		expect(snippet).toContain('<table class="mountains-table">');
		for (const key of ["staff.name", "staff.email", "staff.role", "staff.status", "tableAction"]) {
			expect(snippet).toContain(`$t('dashboard.${key}')`);
		}
	});
	test("status pill + aksi tangguhkan/aktifkan dipertahankan", () => {
		expect(snippet).toContain("account.suspendedAt");
		expect(snippet).toContain("dashboard.staff.suspended");
		expect(snippet).toContain("dashboard.staff.active");
		expect(snippet).toContain("toggleSuspend(account)");
		expect(snippet).toContain("disabled={account.id === me?.id}");
		expect(snippet).toContain("mountains-action-btn {account.suspendedAt ? 'toggle-on' : 'toggle-off'}");
	});
	test("tidak ada lagi form inline di luar popup", () => {
		const beforeModal = snippet.slice(0, snippet.indexOf("showStaffModal"));
		expect(beforeModal).not.toContain("bind:value={staffName}");
		expect(beforeModal).not.toContain("bind:value={staffEmail}");
	});
});

describe("popup Buat Akun", () => {
	test("tombol di atas tabel membuka popup", () => {
		expect(snippet).toContain("showStaffModal = true");
		expect(snippet).toContain("dashboard.staff.create");
	});
	test("popup memakai pola modal gunung + form lama di dalamnya", () => {
		expect(snippet).toContain('class="mountains-modal-backdrop"');
		expect(snippet).toContain('class="mountains-modal"');
		expect(snippet).toContain("e.key === 'Escape'");
		expect(snippet).toContain('class="mountains-edit-grid"');
		expect(snippet).toContain("onsubmit={createStaff}");
		for (const binding of ["staffName", "staffEmail", "staffRole"]) {
			expect(snippet).toContain(`bind:value={${binding}}`);
		}
		// Form staff tanpa password (OTP): ada catatan OTP, tanpa field sandi.
		expect(snippet).toContain("dashboard.staff.otpHint");
		expect(snippet).not.toContain("staffPassword");
	});
	test("sukses buat akun menutup popup", () => {
		expect(src).toContain("staffNotice = 'created';\n\t\t\tshowStaffModal = false;");
	});
});

describe("popup Edit Profile staff", () => {
	test("kunci i18n edit profil ada di id dan en", () => {
		const staffId = idD.staff as Record<string, unknown>;
		const staffEn = enD.staff as Record<string, unknown>;
		for (const key of [
			"editProfile",
			"editProfileTitle",
			"editProfileSaved",
			"editPhoto",
			"changePhoto",
			"removePhoto",
			"save",
			"cancel"
		]) {
			expect(typeof staffId[key]).toBe("string");
			expect(typeof staffEn[key]).toBe("string");
		}
	});
	test("tiap baris staff punya tombol Edit Profile", () => {
		expect(snippet).toContain("dashboard.staff.editProfile");
		expect(snippet).toContain("openEditProfile(account)");
	});
	test("popup edit memakai pola modal gunung + focus trap + Escape", () => {
		expect(snippet).toContain("editStaff");
		expect(snippet).toContain("dashboard.staff.editProfileTitle");
		expect(snippet).toContain("use:focusTrap");
		expect(snippet).toContain("e.key === 'Escape'");
	});
	test("popup berisi foto saat ini + input foto + nama + email, tanpa field password", () => {
		const modal = snippet.slice(snippet.indexOf("editStaff"));
		expect(modal).toContain("bind:value={editName}");
		expect(modal).toContain("bind:value={editEmail}");
		expect(modal).toContain('type="file"');
		expect(modal).toContain("dashboard.staff.editPhoto");
		expect(modal).toContain("dashboard.staff.removePhoto");
		expect(modal).not.toContain("bind:value={editPassword}");
	});
	test("simpan memanggil endpoint edit + avatar, refresh daftar, tutup popup; error tampil di dalam popup", () => {
		expect(src).toContain("api.updateStaff(");
		expect(src).toContain("api.uploadStaffAvatar(");
		expect(src).toContain("api.deleteStaffAvatar(");
		expect(src).toContain("editStaff = null;");
		expect(src).toContain("editErrorCode");
		expect(src).toContain("dashboard.staff.editProfileSaved");
	});
	test("client api + tipe staff mendukung edit profil", () => {
		const apiSrc = read("../api.ts");
		expect(apiSrc).toContain("updateStaff:");
		expect(apiSrc).toContain("uploadStaffAvatar:");
		expect(apiSrc).toContain("deleteStaffAvatar:");
		expect(apiSrc).toContain("/api/v1/admin/staff/${id}");
		expect(apiSrc).toContain("/api/v1/admin/staff/${id}/avatar");
		const typesSrc = read("../types.ts");
		expect(typesSrc).toContain("avatarUrl: string | null;");
	});
});
