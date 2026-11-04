// Format tanggal Indonesia untuk tampilan: "2026-10-28" -> "28 Okt 2026".
// Parsing manual per komponen (bukan new Date(string)) supaya tanggal
// ISO date-only tidak bergeser karena zona waktu perangkat.
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export function formatTripDate(raw: string): string {
  if (!raw) return raw;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
    }
    return raw;
  }
  return raw;
}
