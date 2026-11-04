// Warna pin trip di peta Ringkasan (2 Nov 2026): trip AKTIF dan trip
// AKAN DATANG dibedakan warnanya; trip CLOSED dan PLANNED lewat tanggal
// tidak tampil di peta sama sekali.
import { describe, expect, test } from "bun:test";

import { tripPinColor } from "../map";
import { tripPinKind } from "../trip-dates";

// 2 Nov 2026 10:00 lokal.
const NOW = new Date(2026, 10, 2, 10, 0, 0);

describe("tripPinKind", () => {
	test("ACTIVE tampil apa pun tanggalnya", () => {
		expect(tripPinKind({ status: "ACTIVE", date: "2026-10-28" }, NOW)).toBe("ACTIVE");
		expect(tripPinKind({ status: "ACTIVE", date: "2026-11-05" }, NOW)).toBe("ACTIVE");
	});
	test("PLANNED hari ini/ke depan = upcoming", () => {
		expect(tripPinKind({ status: "PLANNED", date: "2026-11-02" }, NOW)).toBe("UPCOMING");
		expect(tripPinKind({ status: "PLANNED", date: "2026-11-05" }, NOW)).toBe("UPCOMING");
	});
	test("PLANNED lewat tanggal = tidak tampil", () => {
		expect(tripPinKind({ status: "PLANNED", date: "2026-10-28" }, NOW)).toBeNull();
	});
	test("CLOSED tidak tampil apa pun tanggalnya", () => {
		expect(tripPinKind({ status: "CLOSED", date: "2026-11-05" }, NOW)).toBeNull();
		expect(tripPinKind({ status: "CLOSED", date: "2026-10-28" }, NOW)).toBeNull();
	});
});

describe("tripPinColor", () => {
	test("ACTIVE hijau brand, UPCOMING teal brand, keduanya berbeda", () => {
		expect(tripPinColor("ACTIVE")).toBe("#268c4a");
		expect(tripPinColor("UPCOMING")).toBe("#108b93");
		expect(tripPinColor("ACTIVE")).not.toBe(tripPinColor("UPCOMING"));
	});
	test("tidak ada warna pin trip yang sama dengan merah SOS", () => {
		expect(tripPinColor("ACTIVE")).not.toBe("#e11d48");
		expect(tripPinColor("UPCOMING")).not.toBe("#e11d48");
	});
});
