// Relative-time formatter for raw ISO timestamps (TDD, [ACTIVITY]).
//
// The posko dashboard used to render raw ISO strings ("Terakhir
// terlihat: 2026-10-28T06:34:03.233Z") in the home activity card, the
// SOS list, and the Member page alerts card. relativeTime turns those
// into localized relative times; no new i18n keys are needed because
// $t has no interpolation support.
import { describe, expect, test } from "bun:test";
import { relativeTime } from "../time";

// Fixed "now" so every bucket boundary is deterministic.
const NOW = new Date("2026-10-29T12:00:00.000Z");
const isoBefore = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("relativeTime", () => {
	test("seconds bucket (< 60s)", () => {
		expect(relativeTime(isoBefore(30_000), "id-ID", NOW)).toBe("30 detik yang lalu");
		expect(relativeTime(isoBefore(30_000), "en-US", NOW)).toBe("30 seconds ago");
	});

	test("minutes bucket (< 60min)", () => {
		expect(relativeTime(isoBefore(5 * 60_000), "id-ID", NOW)).toBe("5 menit yang lalu");
		expect(relativeTime(isoBefore(5 * 60_000), "en-US", NOW)).toBe("5 minutes ago");
	});

	test("hours bucket (< 24h)", () => {
		expect(relativeTime(isoBefore(3 * 3_600_000), "id-ID", NOW)).toBe("3 jam yang lalu");
		expect(relativeTime(isoBefore(3 * 3_600_000), "en-US", NOW)).toBe("3 hours ago");
	});

	test("days bucket (< 7d)", () => {
		expect(relativeTime(isoBefore(2 * 86_400_000), "id-ID", NOW)).toBe("2 hari yang lalu");
		expect(relativeTime(isoBefore(2 * 86_400_000), "en-US", NOW)).toBe("2 days ago");
	});

	test("older than 7 days renders an absolute localized date", () => {
		const id = relativeTime(isoBefore(10 * 86_400_000), "id-ID", NOW);
		expect(id).toContain("19");
		expect(id).toContain("Okt");
		expect(id).toContain("2026");
		expect(id).not.toContain("yang lalu");
		const en = relativeTime(isoBefore(10 * 86_400_000), "en-US", NOW);
		expect(en).toContain("Oct");
		expect(en).toContain("2026");
		expect(en).not.toContain("ago");
	});

	test("bucket boundaries roll up: 60s -> minutes, 60min -> hours, 24h -> days", () => {
		expect(relativeTime(isoBefore(60_000), "id-ID", NOW)).toBe("1 menit yang lalu");
		expect(relativeTime(isoBefore(60 * 60_000), "id-ID", NOW)).toBe("1 jam yang lalu");
		expect(relativeTime(isoBefore(24 * 3_600_000), "id-ID", NOW)).toBe("1 hari yang lalu");
	});

	test("future timestamps clamp to now", () => {
		const future = new Date(NOW.getTime() + 60_000).toISOString();
		expect(relativeTime(future, "id-ID", NOW)).toBe("0 detik yang lalu");
	});

	test("invalid input returns the raw string", () => {
		expect(relativeTime("bukan-tanggal", "id-ID", NOW)).toBe("bukan-tanggal");
		expect(relativeTime("", "id-ID", NOW)).toBe("");
	});

	test("singular units use the locale's singular form", () => {
		expect(relativeTime(isoBefore(1_000), "id-ID", NOW)).toBe("1 detik yang lalu");
		expect(relativeTime(isoBefore(1_000), "en-US", NOW)).toBe("1 second ago");
	});
});
