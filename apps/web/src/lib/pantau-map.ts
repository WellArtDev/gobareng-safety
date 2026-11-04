// Adaptor peta halaman publik /pantau (3 Nov 2026) — murni, dites
// unit. Mengubah payload SharedTripView (yang memang sudah memuat
// posisi anggota + SOS aktif) menjadi input createMap.setData dari
// dashboard: marker anggota diwarnai per role (LEADER emas, MEMBER
// hijau, dst — konvensi yang sama dengan dashboard safety), SOS aktif
// jadi marker merah berkedip. Tidak menyentuh API: endpoint pantau
// sudah mengembalikan semua yang dibutuhkan peta ini.
import type { Location, SosAlert, TripRole } from './types';
import type { SharedTripView } from './public-trip';

export interface PantauMapInput {
	locations: Location[];
	roles: Map<string, TripRole>;
	sos: SosAlert[];
	/** false bila tidak satu pun anggota punya posisi: peta tidak dirender. */
	hasMap: boolean;
}

export function buildPantauMapInput(view: SharedTripView): PantauMapInput {
	const locations = view.positions
		.filter((p) => p.location !== null)
		.map((p) => p.location!);
	const roles = new Map<string, TripRole>(
		view.positions.map((p) => [p.userId, p.role] as [string, TripRole])
	);
	return { locations, roles, sos: view.activeSos, hasMap: locations.length > 0 };
}
