// Fokus kamera peta Ringkasan ke trip yang dipilih (laporan Wella 2 Nov
// 2026 17:30: klik trip Warjok di menu Trip, peta tetap menampilkan
// daerah Prau). Kamera lama hanya bergerak lewat fitBounds di setData,
// yang butuh titik posisi live / SOS aktif — trip tanpa keduanya tidak
// pernah menggerakkan kamera. Helper ini murni (mudah dites) dan tidak
// menyentuh Leaflet; pemanggil di +page.svelte menjaga sifat one-shot
// lewat pendingTripFocusId.
import type { TripType } from './types';

export interface FocusPoint {
	lat: number;
	lon: number;
}

/** Field koordinat yang dipakai resolusi anchor (subset dari Trip). */
export interface TripFocusSource {
	type: TripType;
	meetingLat?: number | null;
	meetingLon?: number | null;
	destinationLat?: number | null;
	destinationLon?: number | null;
}

function pair(lat: number | null | undefined, lon: number | null | undefined): FocusPoint | null {
	// Sepasang saja yang sah; lat tanpa lon (atau sebaliknya) dilewati
	// ke fallback berikutnya, bukan dipakai setengah-setengah.
	if (typeof lat !== 'number' || typeof lon !== 'number') return null;
	return { lat, lon };
}

/**
 * Urutan anchor fokus trip terpilih:
 * (a) titik kumpul meetingLat/Lon,
 * (b) kalau tidak ada dan trip TOURING: destinationLat/Lon,
 * (c) kalau tidak ada: anchor pin (posisi anggota terakhir, yang sama
 *     dengan yang dipakai loadTripPins),
 * (d) kalau tidak ada sama sekali: null — pemanggil membiarkan kamera
 *     apa adanya, jangan crash dan jangan lompat ke default.
 */
export function resolveTripFocusAnchor(
	trip: TripFocusSource,
	pinAnchor?: FocusPoint | null
): FocusPoint | null {
	return (
		pair(trip.meetingLat, trip.meetingLon) ??
		(trip.type === 'TOURING' ? pair(trip.destinationLat, trip.destinationLon) : null) ??
		pinAnchor ??
		null
	);
}

/**
 * Cermin kondisi fitBounds di map.ts setData: kamera sudah digerakkan
 * oleh titik posisi live / SOS aktif. Kalau true, fokus anchor TIDAK
 * boleh ikut menggeser kamera (perilaku lama dipertahankan).
 */
export function hasLiveMapPoints(
	locations: { lat: number; lon: number }[],
	sos: { status: string }[]
): boolean {
	if (locations.length > 0) return true;
	return sos.some((alert) => alert.status !== 'RESOLVED' && alert.status !== 'CANCELLED');
}
