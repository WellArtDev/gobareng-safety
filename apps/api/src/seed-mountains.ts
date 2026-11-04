// Katalog gunung — MDPL SHIFTED saja (Wella, 1 Nov 2026).
// Menggantikan katalog lama (4 seed + 36 impor #104): seed ini MENGHAPUS
// gunung yang tidak ada di katalog MDPL lewat replaceMountainCatalog,
// lalu meng-upsert 125 destinasi / 305 rute / checkpoint MDPL.
// Idempotent: re-run (restart API atau `bun run src/seed.ts` tidak —
// seed gunung jalan di createApp ready) tidak menduplikasi; edit admin
// pada gunung MDPL yang sudah ada hanya di-backfill field kosongnya
// (lihat db.seedMountains), kecuali track/checkpoint yang selalu
// disinkronkan dari katalog.
// Re-generate data: python3 apps/api/scripts/mdpl-generate-catalog.py
//   <converted-shifted-dir> <destinations.json>  (lihat header script
//   untuk aturan sumber yang boleh dibaca).
import type { Db } from "./db.js";
import { loadMdplCatalog } from "./mdpl-import.js";

export async function seedMountains(db: Db): Promise<void> {
  const { mountains } = loadMdplCatalog();
  await db.replaceMountainCatalog(mountains);
}
