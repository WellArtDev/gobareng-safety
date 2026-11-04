// Konfirmasi ganda untuk aksi berbahaya yang mudah kepencet (SOS umum):
// ketukan pertama hanya mempersenjatai tombol, ketukan kedua di dalam
// jendela yang sama yang benar-benar mengeksekusi. Di luar jendela,
// status kembali belum dipersenjatai dan hitungan dimulai dari awal.
export function createDoubleConfirm(windowMs = 10_000) {
  let armedAt: number | null = null;

  return {
    // true = ketukan kedua yang sah (eksekusi); false = baru dipersenjatai.
    tap(now: number = Date.now()): boolean {
      if (armedAt !== null && now - armedAt <= windowMs) {
        armedAt = null;
        return true;
      }
      armedAt = now;
      return false;
    },
    isArmed(now: number = Date.now()): boolean {
      return armedAt !== null && now - armedAt <= windowMs;
    },
    reset(): void {
      armedAt = null;
    },
  };
}

export type DoubleConfirm = ReturnType<typeof createDoubleConfirm>;
