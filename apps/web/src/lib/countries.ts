// Kode negara untuk kolom Negara di tabel Member (go international).
// Di tabel, negara tampil sebagai ikon bendera saja — tanpa nama.
// Daftar kurasi (bukan seluruh ISO 3166): ID di depan, lalu negara
// yang paling mungkin ditemui; tambah kode baru ke list ini bila perlu.
export const COUNTRY_CODES = [
	'ID',
	'MY',
	'SG',
	'TH',
	'VN',
	'PH',
	'KH',
	'LA',
	'MM',
	'BN',
	'TL',
	'AU',
	'NZ',
	'JP',
	'KR',
	'CN',
	'HK',
	'TW',
	'IN',
	'PK',
	'BD',
	'LK',
	'NP',
	'US',
	'CA',
	'MX',
	'BR',
	'AR',
	'CL',
	'PE',
	'CO',
	'GB',
	'IE',
	'FR',
	'DE',
	'ES',
	'IT',
	'PT',
	'NL',
	'BE',
	'CH',
	'AT',
	'SE',
	'NO',
	'DK',
	'FI',
	'PL',
	'CZ',
	'SK',
	'HU',
	'GR',
	'TR',
	'RU',
	'UA',
	'ZA',
	'EG',
	'NG',
	'KE',
	'MA',
	'AE',
	'SA',
	'QA',
	'KW',
	'IL',
	'IR',
	'IQ',
	'KZ',
	'UZ'
];

// Bendera emoji dari kode ISO alpha-2 (regional indicator symbols).
// Kode tak valid / kosong -> '—'.
export function countryFlag(code: string | null | undefined): string {
	if (!code) return '—';
	const up = code.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(up)) return '—';
	return String.fromCodePoint(
		...[...up].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
	);
}
