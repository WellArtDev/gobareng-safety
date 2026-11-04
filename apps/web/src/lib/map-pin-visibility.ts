// Predikat murni untuk pin peta Ringkasan — ditulis supaya bisa dites
// tanpa browser (lihat map-pin-visibility.test.ts).
//
// Dua perintah Wella 2 Nov 2026:
// (1) chip jenis trip (strip Ringkasan) ikut memfilter PIN TRIP di peta,
//     bukan hanya daftar Trip Aktif;
// (2) chip "Gunung" toggle tampil/sembunyi pin gunung, independen dari
//     filter jenis trip (pin trip tidak pernah dipengaruhi toggle ini).
// Filter visibilitas peta lain (mis. hanya ACTIVE + akan datang dari
// PR #143, toggle publicMapTrips SET-5) adalah konjungsi terpisah di
// updatePins/updateMap, bukan bagian dari predikat di sini.
export type MapKindFilter = 'ALL' | 'HIKING' | 'TOURING' | 'OPEN' | 'PRIVATE';

export function tripPinMatchesKind(
	trip: { type: 'HIKING' | 'TOURING'; isOpenTrip: boolean },
	kind: MapKindFilter
): boolean {
	if (kind === 'HIKING') return trip.type === 'HIKING';
	if (kind === 'TOURING') return trip.type === 'TOURING';
	if (kind === 'OPEN') return trip.isOpenTrip;
	if (kind === 'PRIVATE') return !trip.isOpenTrip;
	return true;
}

export function visibleMapMountains<T extends { isActive: boolean; lat?: number | null; lon?: number | null }>(
	mountains: T[],
	showMountains: boolean
): T[] {
	if (!showMountains) return [];
	return mountains.filter((m) => m.isActive && m.lat != null && m.lon != null);
}
