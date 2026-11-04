// Fokus kamera peta Ringkasan ke trip yang dipilih (laporan Wella 2 Nov
// 2026 17:30: klik trip Warjok di menu Trip, peta tetap menampilkan
// daerah Prau). Kamera lama hanya bergerak lewat fitBounds posisi live /
// SOS aktif, jadi trip tanpa keduanya tidak pernah menggerakkan kamera.
// Helper ini menentukan titik fokusnya; one-shot-nya dijaga pemanggil
// (+page.svelte: pendingTripFocusId).
import { describe, expect, test } from "bun:test";

import { hasLiveMapPoints, resolveTripFocusAnchor } from "../trip-focus";

const MEETING = { lat: -6.33492, lon: 106.78251 };
const DESTINATION = { lat: -6.5, lon: 106.9 };
const PIN = { lat: -6.2, lon: 106.8 };

describe("resolveTripFocusAnchor", () => {
	test("titik kumpul menang atas tujuan dan pin", () => {
		expect(
			resolveTripFocusAnchor(
				{ type: "TOURING", meetingLat: MEETING.lat, meetingLon: MEETING.lon, destinationLat: DESTINATION.lat, destinationLon: DESTINATION.lon },
				PIN
			)
		).toEqual(MEETING);
	});

	test("tanpa titik kumpul, trip TOURING memakai tujuan", () => {
		expect(
			resolveTripFocusAnchor(
				{ type: "TOURING", destinationLat: DESTINATION.lat, destinationLon: DESTINATION.lon },
				PIN
			)
		).toEqual(DESTINATION);
	});

	test("tujuan diabaikan untuk trip HIKING, jatuh ke pin", () => {
		expect(
			resolveTripFocusAnchor(
				{ type: "HIKING", destinationLat: DESTINATION.lat, destinationLon: DESTINATION.lon },
				PIN
			)
		).toEqual(PIN);
	});

	test("koordinat sepasang saja yang dihitung: lat tanpa lon dilewati", () => {
		expect(
			resolveTripFocusAnchor(
				{ type: "TOURING", meetingLat: MEETING.lat, destinationLat: DESTINATION.lat, destinationLon: DESTINATION.lon },
				PIN
			)
		).toEqual(DESTINATION);
		expect(
			resolveTripFocusAnchor(
				{ type: "TOURING", destinationLat: DESTINATION.lat },
				PIN
			)
		).toEqual(PIN);
	});

	test("tanpa titik kumpul dan tujuan, memakai pin (posisi terakhir)", () => {
		expect(resolveTripFocusAnchor({ type: "HIKING" }, PIN)).toEqual(PIN);
	});

	test("tidak ada sumber titik sama sekali = null, bukan crash", () => {
		expect(resolveTripFocusAnchor({ type: "TOURING" }, null)).toBeNull();
		expect(resolveTripFocusAnchor({ type: "TOURING" })).toBeNull();
	});

	test("null eksplisit di field diperlakukan seperti tidak ada", () => {
		expect(
			resolveTripFocusAnchor(
				{ type: "TOURING", meetingLat: null, meetingLon: null, destinationLat: null, destinationLon: null },
				PIN
			)
		).toEqual(PIN);
	});
});

describe("hasLiveMapPoints", () => {
	test("tanpa posisi dan tanpa SOS = false (kasus Warjok)", () => {
		expect(hasLiveMapPoints([], [])).toBe(false);
	});

	test("satu posisi live saja = true", () => {
		expect(hasLiveMapPoints([{ lat: -6.3, lon: 106.7 }], [])).toBe(true);
	});

	test("SOS aktif = true, SOS yang sudah selesai saja = false", () => {
		expect(hasLiveMapPoints([], [{ status: "ACTIVE" }])).toBe(true);
		expect(hasLiveMapPoints([], [{ status: "RESOLVED" }, { status: "CANCELLED" }])).toBe(false);
	});
});
