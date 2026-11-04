// TDD — filter combobox gunung (tambahan B, 1 Nov 2026).
import { describe, expect, test } from 'bun:test';

import { filterComboOptions } from '../combobox-filter';

const options = [
	{ id: 'prau', label: 'Gunung Prau (8)' },
	{ id: 'galunggung', label: 'Gunung Galunggung (2)' },
	{ id: 'semeru', label: 'Gunung Semeru (4)' }
];

describe('filterComboOptions', () => {
	test('query kosong = semua opsi', () => {
		expect(filterComboOptions('', options)).toEqual(options);
		expect(filterComboOptions('   ', options)).toEqual(options);
	});

	test('substring case-insensitive, termasuk angka jumlah rute di label', () => {
		expect(filterComboOptions('prau', options).map((o) => o.id)).toEqual(['prau']);
		expect(filterComboOptions('GUNUNG', options).map((o) => o.id)).toEqual([
			'prau',
			'galunggung',
			'semeru'
		]);
		expect(filterComboOptions('(2)', options).map((o) => o.id)).toEqual([
			'galunggung'
		]);
	});

	test('tidak cocok = list kosong', () => {
		expect(filterComboOptions('rinjani', options)).toEqual([]);
	});
});
