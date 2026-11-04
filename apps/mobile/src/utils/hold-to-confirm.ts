// Tekan-tahan untuk aksi berbahaya yang mudah kepencet (SOS umum,
// keputusan Wella 3 Nov 2026): tombol harus DITAHAN selama durasi penuh,
// baru aksi dieksekusi. Lepas lebih cepat = batal, tidak terkirim.
// Pengganti double-confirm khusus SOS umum — SOS trip dan SOS suara
// tidak memakai util ini dan perilakunya tidak berubah.
export const HOLD_TO_CONFIRM_MS = 3000;

// Progres tahan 0..1 untuk umpan balik visual (bar progres tombol).
export function holdProgress(
  elapsedMs: number,
  holdMs: number = HOLD_TO_CONFIRM_MS,
): number {
  if (holdMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / holdMs));
}

export function createHoldToConfirm(holdMs: number = HOLD_TO_CONFIRM_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;

  return {
    isHolding(): boolean {
      return timer !== null;
    },
    hasFired(): boolean {
      return fired;
    },
    // Mulai menahan; onFire dipanggil tepat sekali saat durasi tercapai.
    // Tekan kedua saat masih menahan diabaikan (timer tidak di-restart).
    press(onFire: () => void): void {
      if (timer !== null || fired) return;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        onFire();
      }, holdMs);
    },
    // Lepas sebelum durasi = batal. Lepas setelah terkirim = no-op.
    release(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    reset(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      fired = false;
    },
  };
}

export type HoldToConfirm = ReturnType<typeof createHoldToConfirm>;
