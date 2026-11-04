// Layout regression guards (TDD, LAY-1..LAY-4) — source-level checks
// that need no browser, mirroring design/dashboard/index.html (desain 11):
// 1. Stat grid breakpoints: 4 cols desktop, 2 cols at <=1180px and STILL
//    2 cols at <=760px — never 1 column (the live bug was 1 col <=600px).
// 2. Stat card uses tokens (no hardcoded light-only hex) so dark mode works.
// 3. Body font is Plus Jakarta Sans everywhere (not system-ui).
// 4. Theme default is Light: initialTheme() ignores the system preference.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { initialTheme } from "../theme";

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("LAY-1 stat grid breakpoints follow desain 11", () => {
	const grid = src("../stat-grid.svelte");

	test("desktop is 4 columns", () => {
		expect(grid).toMatch(/grid-template-columns:\s*repeat\(4,\s*1fr\)/);
	});

	test("<=1180px collapses to 2 columns (design breakpoint, not 1100)", () => {
		expect(grid).toMatch(/@media\s*\(max-width:\s*1180px\)/);
		expect(grid).not.toMatch(/@media\s*\(max-width:\s*1100px\)/);
	});

	test("<=760px STAYS 2 columns with 10px gap — never 1 column", () => {
		const m760 = grid.match(/@media\s*\(max-width:\s*760px\)\s*{([\s\S]*?)}\s*}/);
		expect(m760).not.toBeNull();
		expect(m760![1]).toMatch(/repeat\(2,\s*1fr\)/);
		expect(m760![1]).toMatch(/gap:\s*10px/);
		// The old bug: a 1-column rule at any width.
		expect(grid).not.toMatch(/grid-template-columns:\s*1fr\s*;/);
		expect(grid).not.toMatch(/@media\s*\(max-width:\s*600px\)/);
	});

	test("<=420px uses 8px gap", () => {
		const m420 = grid.match(/@media\s*\(max-width:\s*420px\)\s*{([\s\S]*?)}\s*}/);
		expect(m420).not.toBeNull();
		expect(m420![1]).toMatch(/gap:\s*8px/);
	});
});

describe("LAY-1 stat card mobile sizing + LAY-4 token colors", () => {
	const card = src("../stat-card.svelte");

	test("card surfaces use tokens, not hardcoded light hex", () => {
		// These exact values broke dark mode: they must come from tokens now.
		expect(card).not.toContain("#ffffff");
		expect(card).not.toContain("#e3ebef");
		expect(card).not.toContain("#6d7f90");
		expect(card).toMatch(/background:\s*var\(--card\)/);
		expect(card).toMatch(/border:\s*1px solid var\(--line\)/);
	});

	test("<=760px: column layout, padding 12px, icon 36px, value 20px, label 11px", () => {
		const m760 = card.match(/@media\s*\(max-width:\s*760px\)\s*{([\s\S]*?)}\s*}/);
		expect(m760).not.toBeNull();
		const block = m760![1];
		expect(block).toMatch(/flex-direction:\s*column/);
		expect(block).toMatch(/padding:\s*12px/);
		expect(block).toMatch(/width:\s*36px/);
		expect(block).toMatch(/font-size:\s*20px/);
		expect(block).toMatch(/font-size:\s*11px/);
	});
});

describe("LAY-3 fonts follow desain 11", () => {
	const layout = src("../../routes/+layout.svelte");

	test("body font is Plus Jakarta Sans (not bare system-ui)", () => {
		const body = layout.match(/:global\(body\)\s*{([\s\S]*?)}/);
		expect(body).not.toBeNull();
		expect(body![1]).toContain("Plus Jakarta Sans");
	});

	test("layout loads the Google Fonts stylesheet for every page", () => {
		expect(layout).toContain("fonts.googleapis.com");
		expect(layout).toContain("Plus+Jakarta+Sans");
		expect(layout).toContain("Manrope");
	});
});

describe("LAY-4 theme default is Light like desain 11", () => {
	test("initialTheme: saved value wins, otherwise light — system pref ignored", () => {
		expect(initialTheme("dark")).toBe("dark");
		expect(initialTheme("light")).toBe("light");
		expect(initialTheme(null)).toBe("light");
		expect(initialTheme("junk")).toBe("light");
	});

	test("shell no longer derives the initial theme from matchMedia", () => {
		const shell = src("../dashboard-shell.svelte");
		expect(shell).not.toContain("matchMedia");
	});

	test("layout has no prefers-color-scheme override (design starts Light)", () => {
		const layout = src("../../routes/+layout.svelte");
		expect(layout).not.toContain("prefers-color-scheme: dark");
	});
});

describe("LAY-2 topbar profile dropdown", () => {
	const shell = src("../dashboard-shell.svelte");
	const page = src("../../routes/+page.svelte");

	test("shell renders the file-10 profile menu items", () => {
		expect(shell).toContain("dashboard.menuProfile");
		// Tindak lanjut #122 setelah OTP merge: item ganti kata sandi
		// dicopot bersama tab Ubah Kata Sandi (submit-nya 410 OTP_ONLY).
		expect(shell).not.toContain("dashboard.menuPassword");
		expect(shell).toContain("dashboard.menuLogout");
	});

	test("page passes the admin NAME (not email) to the chip and drops the standalone logout", () => {
		expect(page).toMatch(/userLabel=\{me\.name/);
		expect(page).not.toContain("shell-logout");
	});
});
