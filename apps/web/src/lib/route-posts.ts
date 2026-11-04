// Baris form Tambah/Edit Jalur (tambahan A, 1 Nov 2026): tiap pos
// punya nama + lat/lon teks (kosong = tanpa koordinat). Koordinat
// digabung dari checkpoints API berdasarkan order — posts dan
// checkpoints berasal dari baris RoutePost yang sama, jadi order
// selalu sejajar; pos tanpa checkpoint = kolom kosong, bukan hilang.
export interface RoutePostEdit {
	name: string;
	lat: string;
	lon: string;
}

export interface RouteCheckpointLike {
	order: number;
	lat: number;
	lon: number;
}

export const EMPTY_POST: RoutePostEdit = { name: '', lat: '', lon: '' };

export function buildRouteEditPosts(
	posts: string[],
	checkpoints?: RouteCheckpointLike[] | null
): RoutePostEdit[] {
	const byOrder = new Map((checkpoints ?? []).map((c) => [c.order, c]));
	const rows = posts.map((name, i) => {
		const cp = byOrder.get(i);
		return {
			name,
			lat: cp ? String(cp.lat) : '',
			lon: cp ? String(cp.lon) : ''
		};
	});
	return rows.length > 0 ? rows : [{ ...EMPTY_POST }];
}

export interface RoutePostPayload {
	name: string;
	lat: number | null;
	lon: number | null;
}

function parseCoord(value: string): number | null {
	const v = value.trim();
	if (v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

// Serialisasi ke body API: baris kosong dibuang (API melengkapi
// Puncak otomatis); lat/lon kosong = null eksplisit (menghapus
// koordinat lama bila admin mengosongkannya).
export function toRoutePostPayload(rows: RoutePostEdit[]): RoutePostPayload[] {
	return rows
		.filter((r) => r.name.trim() !== '')
		.map((r) => ({
			name: r.name.trim(),
			lat: parseCoord(r.lat),
			lon: parseCoord(r.lon)
		}));
}
