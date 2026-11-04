// Guard halaman Profil TANPA tab Ubah Kata Sandi (tindak lanjut #122
// setelah OTP merge): submit tab itu error 410 OTP_ONLY, jadi tab,
// tombol dropdown-nya, dan plumbing yang hanya dipakai tab itu dicopot.
// 1. Halaman Profil tidak muncul di sidebar.
// 2. Topnav hanya punya item Profil (tanpa item Ubah Kata Sandi, tanpa
//    onPassword); halaman Profil tidak lagi memakai state profileTab.
// 3. ProfilePanel tanpa tablist: langsung konten Profil (foto profil/
//    avatar, form ganti nama, form ganti email). Form ganti email TETAP
//    memakai konfirmasi kata sandi saat ini (gate API updateMe, bukan
//    tab ubah kata sandi) — itu bukan plumbing tab dan dipertahankan.
// 4. Klien api.changePassword dan kunci i18n yang hanya dipakai tab itu
//    dihapus dari kedua bahasa; kunci error OTP_ONLY dipertahankan
//    (dipakai banner error umum, bukan tab).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dashboardMenus, poskoMenus, safetyMenus } from "../dashboard-menus";

import { en } from "../i18n/en";
import { id } from "../i18n/id";

function read(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

type Dashboard = { dashboard: Record<string, unknown> };
const idD = (id as unknown as Dashboard).dashboard;
const enD = (en as unknown as Dashboard).dashboard;
const idErrors = (id as unknown as { errors: Record<string, unknown> }).errors;
const enErrors = (en as unknown as { errors: Record<string, unknown> }).errors;

// Kunci yang hanya dipakai tab Ubah Kata Sandi / item dropdown-nya.
const GONE_KEYS = [
	"profileTabProfile",
	"profileTabPassword",
	"passwordTitle",
	"passwordCurrent",
	"passwordNew",
	"passwordConfirm",
	"passwordMismatch",
	"passwordRuleHint",
	"passwordSave",
	"passwordChanged",
	"menuPassword"
];

describe("halaman Profil tidak muncul di sidebar", () => {
	test("poskoMenus, dashboardMenus, dan safetyMenus tidak memuat id 'profile'", () => {
		for (const set of [dashboardMenus, poskoMenus, safetyMenus]) {
			const ids = set.map((m) => m.id);
			expect(ids).not.toContain("profile");
			expect(ids).not.toContain("password");
		}
	});
});

describe("topnav hanya punya item Profil, tanpa jalur ke tab password", () => {
	const page = read("../../routes/+page.svelte");
	const shell = read("../dashboard-shell.svelte");

	test("onProfile mengeset activeMenu = 'profile' (tanpa profileTab)", () => {
		expect(page).toMatch(/onProfile=\{[\s\S]*?activeMenu\s*=\s*['"]profile['"]/);
		expect(page).not.toContain("onPassword");
		expect(page).not.toContain("profileTab");
		expect(page).not.toContain("ptab");
	});

	test("dropdown profil shell tanpa item Ubah Kata Sandi", () => {
		expect(shell).toContain("dashboard.menuProfile");
		expect(shell).toContain("dashboard.menuLogout");
		expect(shell).not.toContain("dashboard.menuPassword");
		expect(shell).not.toContain("onPassword");
		expect(shell).not.toContain("profileAction('password')");
	});

	test("halaman merender ProfilePanel saat activeMenu === 'profile'", () => {
		expect(page).toContain("activeMenu === 'profile'");
		expect(page).toContain("profileSnippet");
		expect(page).toContain("<ProfilePanel");
		expect(page).not.toContain("onChangePassword");
		expect(page).not.toContain("passwordNotice");
		expect(page).not.toContain("passwordError");
	});
});

describe("komponen ProfilePanel tanpa tab, hanya konten Profil", () => {
	const panel = read("../profile-panel.svelte");

	test("tanpa tablist dan tanpa tab password", () => {
		expect(panel).not.toContain('role="tablist"');
		expect(panel).not.toContain("data-profile-tab=");
		expect(panel).not.toContain('data-tabpanel="password"');
		expect(panel).not.toContain('data-profile-card="password"');
		for (const key of GONE_KEYS) {
			expect(panel).not.toContain(`dashboard.${key}`);
		}
		expect(panel).not.toContain("onChangePassword");
		expect(panel).not.toContain("submitPassword");
	});

	test("konten Profil dipertahankan: foto, ganti nama, ganti email", () => {
		expect(panel).toContain('data-profile-card="avatar"');
		expect(panel).toContain('data-profile-card="name"');
		expect(panel).toContain('data-profile-card="email"');
		expect(panel).toContain("dashboard.avatarUpload");
		expect(panel).toContain("dashboard.profileNameSave");
		expect(panel).toContain("dashboard.emailSave");
		// Gate email (konfirmasi kata sandi saat ini) bukan tab: tetap ada.
		expect(panel).toContain("dashboard.emailPasswordConfirm");
	});
});

describe("plumbing tab password dicopot, OTP_ONLY dipertahankan", () => {
	const apiSrc = read("../api.ts");

	test("klien api.changePassword dan path-nya hilang", () => {
		expect(apiSrc).not.toContain("changePassword");
		expect(apiSrc).not.toContain("'/api/v1/auth/me/password'");
		// updateMe (nama/email, gate kata sandi saat ini) bukan tab: tetap ada.
		expect(apiSrc).toContain("updateMe:");
	});

	test("kunci i18n tab password hilang dari id dan en", () => {
		for (const key of GONE_KEYS) {
			expect(idD[key]).toBeUndefined();
			expect(enD[key]).toBeUndefined();
		}
	});

	test("kunci error OTP_ONLY dipertahankan di kedua bahasa", () => {
		expect(typeof idErrors["OTP_ONLY"]).toBe("string");
		expect(typeof enErrors["OTP_ONLY"]).toBe("string");
	});
});
