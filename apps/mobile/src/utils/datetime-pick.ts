// Format/parse nilai picker tanggal & jam untuk form buat trip.
// Format yang dikirim ke API TIDAK berubah: tanggal YYYY-MM-DD,
// jam HH:MM 24 jam. Semua konstruksi memakai komponen lokal
// (getFullYear/getMonth/getDate) supaya tidak ada geser zona waktu.

const pad = (n: number) => String(n).padStart(2, "0");

export function formatPickerDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatPickerTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-11-08" -> Date lokal, atau null bila format/tanggal tak valid. */
export function parsePickerDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, mo - 1, day);
  // Tanggal mustahil (mis. 30 Feb) akan "meluber" ke bulan berikut.
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

/** "05:30" -> Date hari ini pada jam itu, atau null bila tak valid. */
export function parsePickerTime(value: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/**
 * Nilai awal picker: nilai form lama bila valid, fallback bila kosong
 * atau tak valid. Komponen pemanggil yang memegang "batal = nilai tidak
 * berubah" — util ini hanya menentukan titik awal roda picker.
 */
export function initialPickerValue(
  kind: "date" | "time",
  dateStr: string,
  timeStr: string,
  fallback: Date,
): Date {
  if (kind === "date") {
    return parsePickerDate(dateStr) ?? fallback;
  }
  const t = parsePickerTime(timeStr);
  if (!t) return fallback;
  const d = new Date(fallback);
  d.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return d;
}
