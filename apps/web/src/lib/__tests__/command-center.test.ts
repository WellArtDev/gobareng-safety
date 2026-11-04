// Command-center guards (TDD, CC-1..CC-3 + beacon kerangka) — source
// and pure-logic checks that need no browser.
//
// Keputusan Wella 28 Okt 2026:
// - CC-1 command center = SEPARATE safety dashboard route (/safety),
//   account-gated (dashboard roles only).
// - CC-2 the admin dashboard's Peta Live menu OPENS the command center
//   in a NEW TAB (fullscreen-able), through RBAC.
// - Beacon: kerangka only (BCN-XXX codes, OK/PANIC/battery, events) —
//   full build + LoRa/Meshtastic hardware is ON HOLD.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { canOpenCommandCenter, isBeaconCode } from "../command-center";
import { id } from "../i18n/id";
import { en } from "../i18n/en";

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("CC-1 separate safety route", () => {
	test("route /safety exists as its own page", () => {
		// Throws if the route file is missing.
		expect(src("../../routes/safety/+page.svelte").length).toBeGreaterThan(0);
	});

	test("safety page is RBAC-gated and calls the command-center overview", () => {
		const page = src("../../routes/safety/+page.svelte");
		expect(page).toContain("canOpenCommandCenter");
		expect(page).toContain("commandCenterOverview");
	});
});

describe("CC-2 Peta Live opens the command center in a new tab", () => {
	const page = src("../../routes/+page.svelte");

	test("live-map menu opens /safety in a new tab instead of an in-page view", () => {
		expect(page).toMatch(/window\.open\(\s*'\/safety'/);
		// The old in-dashboard Peta Live view is replaced by the CC page.
		expect(page).not.toContain("activeMenu === 'live-map'");
	});
});

describe("CC-3 RBAC: who may open the command center", () => {
	test("dashboard roles pass, regular users and null do not", () => {
		expect(canOpenCommandCenter({ role: "admin" })).toBe(true);
		expect(canOpenCommandCenter({ role: "command_center" })).toBe(true);
		expect(canOpenCommandCenter({ role: "user" })).toBe(false);
		expect(canOpenCommandCenter(null)).toBe(false);
	});
});

describe("Beacon kerangka (implementation ON HOLD)", () => {
	test("BCN-XXX device codes validate; anything else refuses", () => {
		expect(isBeaconCode("BCN-RNJ-02")).toBe(true);
		expect(isBeaconCode("BCN-GDE-01")).toBe(true);
		expect(isBeaconCode("bcn-rnj-02")).toBe(false);
		expect(isBeaconCode("BCN-1")).toBe(false);
		expect(isBeaconCode("")).toBe(false);
	});

	test("no beacon API calls exist yet (hardware is ON HOLD)", () => {
		const api = src("../api.ts");
		expect(api).not.toContain("/beacons");
	});
});

describe("CC i18n parity", () => {
	test("safety page keys exist in both dictionaries", () => {
		type Dict = { safety?: Record<string, unknown> };
		const idSafety = (id as Dict).safety;
		const enSafety = (en as Dict).safety;
		expect(idSafety).toBeDefined();
		expect(enSafety).toBeDefined();
		expect(Object.keys(idSafety!).sort()).toEqual(Object.keys(enSafety!).sort());
	});
});
