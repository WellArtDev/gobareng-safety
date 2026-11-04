// Halaman detail trip dashboard (perintah Wella 2 Nov 2026): tombol
// "Lihat Trip" di tabel Trip membuka halaman detail tersendiri, bukan
// lagi Ringkasan. Helper murni di sini; Leaflet dan state Svelte tetap
// di +page.svelte.
//
// CATATAN RUANG LINGKUP: model Trip di API tidak punya relasi route
// (tanpa mountainId/routeId) dan peta Ringkasan pun tidak pernah
// menampilkan track jalur untuk trip — jadi halaman detail tidak
// menampilkan seksi jalur/checkpoint. Peta detail menampilkan titik
// kumpul, tujuan touring, posisi live anggota, dan SOS (semuanya dari
// endpoint yang sudah ada: trips, tripMembers, tripLocations, tripSos).
import type { TripRole } from './types';

// Warna marker peran — sama persis dengan ROLE_COLORS di map.ts
// (emas leader, oranye sweeper, putih medic, hijau member). Duplikasi
// disengaja: map.ts tidak mengekspornya, dan warna ini dipakai daftar
// anggota di luar peta.
export const TRIP_DETAIL_ROLE_COLORS: Record<TripRole, string> = {
	LEADER: '#f5c518',
	SWEEPER: '#f78308',
	MEDIC: '#ffffff',
	MEMBER: '#268c4a'
};

export function tripDetailRoleColor(role: TripRole): string {
	return TRIP_DETAIL_ROLE_COLORS[role] ?? TRIP_DETAIL_ROLE_COLORS.MEMBER;
}

export type TripDetailVisibility = 'paid' | 'public' | 'private';

// Sifat trip di header detail: berbayar kalau ada harga (> 0; harga 0
// = gratis), kalau tidak: open trip = publik, sisanya privat. Field
// price sudah dikirim API list (mapTrip spread), hanya tipenya yang
// belum dideklarasikan di web.
export function tripDetailVisibility(trip: {
	isOpenTrip: boolean;
	price?: number | null;
}): TripDetailVisibility {
	if (typeof trip.price === 'number' && trip.price > 0) return 'paid';
	return trip.isOpenTrip ? 'public' : 'private';
}
