// M7 — compaction posisi lama, FUNGSI MURNI (tanpa Prisma) supaya bisa
// dites dengan bun test tanpa DB. Metode DB yang memakainya ada di
// db.ts (compactLocationsForMember), dipanggil dari handler
// POST /trip-groups/:id/locations — blok M7 yang jelas dibatasi.
//
// Aturan persis (jangan diubah diam-diam — M6 memakai last-seen dari
// Location.ts terbaru, dan compaction TIDAK BOLEH menyentuh baris baru):
// - Hanya baris LEBIH TUA dari 30 menit (POSITION_COMPACTION_AGE_MS)
//   yang diproses. Baris tepat di batas 30 menit BUKAN "lebih tua"
//   -> dipertahankan. Baris lebih baru dari 30 menit TIDAK PERNAH
//   dihapus, berapa pun jumlahnya dalam satu jendela.
// - Baris lama dikelompokkan per jendela 5 menit
//   (POSITION_COMPACTION_WINDOW_MS, epoch absolut: floor(ts / 5 menit)).
//   Tiap jendela menyimpan baris PERTAMA dan TERAKHIR (jejak yang setia:
//   awal + akhir segmen), sisanya dihapus.
// - ts yang tak bisa diparse tidak pernah dihapus (fail-safe: lebih baik
//   menyimpan baris meragukan daripada menghapus jejak).
// - Fungsi ini TIDAK tahu (trip, user): pemanggil (db.ts) sudah
//   memfilter per (tripId, userId) sebelum memanggil.
export const POSITION_COMPACTION_AGE_MS = 30 * 60_000;
export const POSITION_COMPACTION_WINDOW_MS = 5 * 60_000;

export interface CompactableLocationRow {
  id: string;
  ts: Date | string | number;
}

function tsMs(ts: Date | string | number): number | null {
  const ms = ts instanceof Date ? ts.getTime() : Date.parse(String(ts));
  if (typeof ts === "number") return Number.isFinite(ts) ? ts : null;
  return Number.isFinite(ms) ? ms : null;
}

export function planPositionCompaction(
  rows: CompactableLocationRow[],
  nowMs: number,
): { keepIds: string[]; deleteIds: string[] } {
  const cutoff = nowMs - POSITION_COMPACTION_AGE_MS;
  const kept: { id: string; ms: number | null; idx: number }[] = [];
  const deleteIds: string[] = [];
  // Kelompokkan baris lama per jendela; urutkan dulu supaya "pertama"
  // dan "terakhir" bermakna kronologis walau input tak terurut.
  const byWindow = new Map<number, { id: string; ms: number; idx: number }[]>();
  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const ms = tsMs(row.ts);
    if (ms === null) {
      kept.push({ id: row.id, ms: null, idx });
      continue;
    }
    if (ms >= cutoff) {
      kept.push({ id: row.id, ms, idx });
      continue;
    }
    const windowKey = Math.floor(ms / POSITION_COMPACTION_WINDOW_MS);
    const group = byWindow.get(windowKey) ?? [];
    group.push({ id: row.id, ms, idx });
    byWindow.set(windowKey, group);
  }
  for (const group of byWindow.values()) {
    group.sort((a, b) => a.ms - b.ms);
    const keep = new Set<string>();
    keep.add(group[0].id);
    keep.add(group[group.length - 1].id);
    for (const entry of group) {
      if (keep.has(entry.id)) {
        kept.push({ id: entry.id, ms: entry.ms, idx: entry.idx });
      } else deleteIds.push(entry.id);
    }
  }
  // keepIds kronologis (ts tak valid di akhir, stabil per urutan input)
  // supaya hasilnya deterministik apa pun urutan input.
  kept.sort((a, b) => {
    if (a.ms === null && b.ms === null) return a.idx - b.idx;
    if (a.ms === null) return 1;
    if (b.ms === null) return -1;
    return a.ms - b.ms;
  });
  return { keepIds: kept.map((k) => k.id), deleteIds };
}
