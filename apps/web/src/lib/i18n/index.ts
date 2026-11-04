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

// Locale awal (diubah 4 Nov 2026 atas perintah Wella: toggle ID|EN di
// landing harus benar-benar bertahan): baca pilihan tersimpan di
// localStorage ('gobareng-locale', ditulis setLocale). Nilai apa pun
// selain 'id'/'en' — termasuk dari masa dashboard-Indonesia-saja —
// jatuh ke 'id', jadi default tetap Bahasa Indonesia. Catatan dampak:
// store locale dipakai bersama seluruh aplikasi, jadi pilihan EN yang
// tersimpan juga dihormati saat load ulang di dashboard/safety, bukan
// hanya di landing. Itu konsekuensi yang disengaja dari perintah ini.
// Di server (SSR) localStorage tidak ada → selalu 'id'.
function initialLocale(): Locale {
	if (typeof localStorage === 'undefined') return 'id';
	try {
		const stored = localStorage.getItem('gobareng-locale');
		return stored === 'en' || stored === 'id' ? stored : 'id';
	} catch {
		return 'id';
	}
}

export const locale = writable<Locale>(initialLocale());

export function setLocale(next: Locale): void {
	locale.set(next);
	if (typeof localStorage !== 'undefined') {
		try {
			localStorage.setItem('gobareng-locale', next);
		} catch {
			// Penyimpanan privat/dibatasi: pilihan tetap berlaku sesi ini.
		}
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
