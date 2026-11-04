// Daftar negara kurasi untuk pemilih Negara — cerminan persis daftar
// web (apps/web/src/lib/countries.ts): ID di depan, lalu negara yang
// paling mungkin ditemui. Tampil sebagai bendera emoji + kode saja,
// sama seperti konvensi tabel Member di dashboard.
export const COUNTRY_CODES = [
  "ID",
  "MY",
  "SG",
  "TH",
  "VN",
  "PH",
  "KH",
  "LA",
  "MM",
  "BN",
  "TL",
  "AU",
  "NZ",
  "JP",
  "KR",
  "CN",
  "HK",
  "TW",
  "IN",
  "PK",
  "BD",
  "LK",
  "NP",
  "US",
  "CA",
  "MX",
  "BR",
  "AR",
  "CL",
  "PE",
  "CO",
  "GB",
  "IE",
  "FR",
  "DE",
  "ES",
  "IT",
  "PT",
  "NL",
  "BE",
  "CH",
  "AT",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "CZ",
  "SK",
  "HU",
  "GR",
  "TR",
  "RU",
  "UA",
  "ZA",
  "EG",
  "NG",
  "KE",
  "MA",
  "AE",
  "SA",
  "QA",
  "KW",
  "IL",
  "IR",
  "IQ",
  "KZ",
  "UZ",
];

// Bendera emoji dari kode ISO alpha-2 (regional indicator symbols).
// Kode tak valid / kosong -> "—".
export function countryFlag(code: string | null | undefined): string {
  if (!code) return "—";
  const up = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(up)) return "—";
  return String.fromCodePoint(
    ...[...up].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// Filter daftar negara untuk kolom cari di pemilih Negara: kosong ->
// semua kode; kalau tidak, kode yang mengandung kueri (tak peduli
// besar/kecil huruf). Daftar hanya berisi kode, jadi cari berdasarkan
// kode saja — mis. ketik "ID" langsung menyisakan Indonesia.
export function filterCountryCodes(query: string): string[] {
  const q = query.trim().toUpperCase();
  if (!q) return [...COUNTRY_CODES];
  return COUNTRY_CODES.filter((code) => code.includes(q));
}
