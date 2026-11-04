// SSR — combobox gunung (tambahan B, 1 Nov 2026): keadaan tertutup
// menampilkan label pilihan aktif di input, tanpa listbox; opsi
// "semua" dipilih lewat allLabel, bukan option native.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let vite;
let MountainCombobox;
let render;

before(async () => {
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	({ default: MountainCombobox } = await vite.ssrLoadModule('/src/lib/mountain-combobox.svelte'));
	({ render } = await vite.ssrLoadModule('svelte/server'));
});

after(async () => {
	await vite?.close();
});

const options = [
	{ id: 'prau', label: 'Gunung Prau (8)' },
	{ id: 'galunggung', label: 'Gunung Galunggung (2)' }
];

function renderCombo(overrides = {}) {
	return render(MountainCombobox, {
		props: {
			value: 'all',
			options,
			allLabel: 'Semua gunung',
			ariaLabel: 'Filter gunung',
			emptyLabel: 'Tidak ada gunung yang cocok',
			onchange: () => undefined,
			...overrides
		}
	}).body;
}

test('input menampilkan label "Semua gunung" saat value all, listbox tertutup', () => {
	const html = renderCombo();

	assert.match(html, /role="combobox"/);
	assert.match(html, /value="Semua gunung"/);
	assert.doesNotMatch(html, /role="listbox"/);
});

test('input menampilkan label gunung terpilih saat value id gunung', () => {
	const html = renderCombo({ value: 'prau' });

	assert.match(html, /value="Gunung Prau \(8\)"/);
});

test('tanpa allLabel, pilihan tetap label gunung (dipakai picker modal jalur)', () => {
	const html = renderCombo({ value: 'galunggung', allLabel: null });

	assert.match(html, /value="Gunung Galunggung \(2\)"/);
});
