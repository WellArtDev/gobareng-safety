// Kode negara ISO 3166-1 alpha-2 untuk kolom User.country.
// Disimpan selalu huruf besar 2 huruf; null = belum diisi / dihapus.
export function normalizeCountryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
