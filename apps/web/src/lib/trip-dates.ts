// Helper tanggal trip (1 Nov 2026): "Trip yang Akan Datang" hanya trip
// PLANNED yang tanggalnya hari ini atau ke depan. Perbandingan memakai
// awal hari lokal supaya trip yang tanggalnya hari ini tetap upcoming,
// dan trip kemarin (mis. Demo Trip Prau 28 Okt dilihat 1 Nov) tidak lagi
// muncul. Tanggal tak valid dianggap tidak lampau (perilaku lama).
export function isTripDatePast(iso: string, now: Date = new Date()): boolean {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return false;
	const day = new Date(d);
	day.setHours(0, 0, 0, 0);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	return day < today;
}

export function isUpcomingTrip(
	trip: { status: string; date: string },
	now?: Date
): boolean {
	return trip.status === 'PLANNED' && !isTripDatePast(trip.date, now);
}

// Filter pin trip di peta Ringkasan (2 Nov 2026): peta hanya menampilkan
// trip yang AKAN DATANG (PLANNED, tanggal hari ini/ke depan) atau AKTIF.
// Trip PLANNED yang tanggalnya sudah lewat dan trip CLOSED tidak punya
// pin — filter ini khusus peta, tabel daftar trip tidak ikut difilter.
export function isMapVisibleTrip(
	trip: { status: string; date: string },
	now?: Date
): boolean {
	return trip.status === 'ACTIVE' || isUpcomingTrip(trip, now);
}

// Tampilan saja (perintah Wella 2 Nov 2026): trip PLANNED yang tanggalnya
// sudah lewat tampil "Expired" di tabel Trip. Enum status di DB tidak
// berubah; ACTIVE/CLOSED tidak pernah expired.
export function isTripExpired(
	trip: { status: string; date: string },
	now?: Date
): boolean {
	return trip.status === 'PLANNED' && isTripDatePast(trip.date, now);
}

// Jenis pin trip di peta Ringkasan (2 Nov 2026): pin bernomor dibedakan
// antara trip AKTIF dan trip AKAN DATANG. null = trip tidak tampil di peta
// (CLOSED, atau PLANNED yang tanggalnya sudah lewat).
export type TripPinKind = 'ACTIVE' | 'UPCOMING';

export function tripPinKind(
	trip: { status: string; date: string },
	now?: Date
): TripPinKind | null {
	if (trip.status === 'ACTIVE') return 'ACTIVE';
	if (isUpcomingTrip(trip, now)) return 'UPCOMING';
	return null;
}
