// Filter combobox (tambahan B, 1 Nov 2026): ketik untuk menyaring
// opsi berdasarkan substring label, case-insensitive. Query kosong
// = semua opsi. Dipakai MountainCombobox; diuji unit terpisah.
export interface ComboOption {
	id: string;
	label: string;
}

export function filterComboOptions(
	query: string,
	options: ComboOption[]
): ComboOption[] {
	const q = query.trim().toLowerCase();
	if (q === '') return options;
	return options.filter((o) => o.label.toLowerCase().includes(q));
}
