import { derived, writable } from 'svelte/store';
import { en } from './en';
import { id, type Translations } from './id';

export type Locale = 'id' | 'en';

// Adding a language = add one translation file (for example
// `src/lib/i18n/fr.ts`, typed as `Translations`) and register it in
// `dictionaries` below. Components never change.
// Menambah bahasa = tambah satu file terjemahan (misalnya
// `src/lib/i18n/fr.ts`, bertipe `Translations`) lalu daftarkan di
// `dictionaries` di bawah. Komponen tidak berubah.
const dictionaries: Record<Locale, Translations> = { en, id };

function resolve(dict: Translations, key: string): string {
	const value = key
		.split('.')
		.reduce<unknown>(
			(acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
			dict
		);
	return typeof value === 'string' ? value : key;
}

// Dashboard Bahasa Indonesia saja (Wella 1 Nov 2026): pemilih bahasa
// di Pengaturan dihapus, dan nilai 'en' yang mungkin tersimpan di
// localStorage sengaja diabaikan — locale awal selalu 'id'. setLocale
// tetap ada untuk layar login/safety yang masih punya toggle sendiri
// (lihat laporan: itu sisa follow-up bila Wella mau EN benar-benar mati).
function initialLocale(): Locale {
	return 'id';
}

export const locale = writable<Locale>(initialLocale());

export function setLocale(next: Locale): void {
	locale.set(next);
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('gobareng-locale', next);
	}
}

// Interpolasi {param} (Tugas 1.2): pesan konfirmasi/jejak keputusan
// memakai nama orang/laporan dinamis. Kompatibel mundur: kunci lama
// tanpa {param} tidak berubah sama sekali.
export const t = derived(
	locale,
	($locale) => (key: string, params?: Record<string, string>) => {
		let value = resolve(dictionaries[$locale], key);
		if (params) {
			for (const [name, replacement] of Object.entries(params)) {
				value = value.replaceAll(`{${name}}`, replacement);
			}
		}
		return value;
	}
);
