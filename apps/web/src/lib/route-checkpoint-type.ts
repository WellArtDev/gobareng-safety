// Jenis checkpoint untuk warna marker peta + badge tabel modal Lihat
// Jalur. Tiga keranjang saja supaya legenda tetap ringkas: tag MDPL
// lain (Basecamp, Shelter, WaterSource, Gate, dll.) digolongkan Pos —
// tags mentah tetap ada di API bila nanti perlu diperhalus.
// Precedence: Puncak menang atas CampArea (puncak yang juga area
// kemah tetap emas), isTarget admin juga dihitung Puncak.
export type CheckpointKind = 'post' | 'camp' | 'peak';

export function checkpointKind(
	tags: string[] | null | undefined,
	isTarget?: boolean
): CheckpointKind {
	if (isTarget) return 'peak';
	const list = tags ?? [];
	if (list.includes('Peak')) return 'peak';
	if (list.includes('CampArea')) return 'camp';
	return 'post';
}

// Hijau Pos = warna lama; oranye = brand GoBareng; emas = warna role
// LEADER yang sudah ada (bukan merah SOS #e11d48).
export function checkpointMarkerColor(kind: CheckpointKind): string {
	if (kind === 'peak') return '#f5c518';
	if (kind === 'camp') return '#f78308';
	return '#268c4a';
}
