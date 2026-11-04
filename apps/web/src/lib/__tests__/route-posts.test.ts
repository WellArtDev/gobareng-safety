// TDD — helper form pos jalur (tambahan A, 1 Nov 2026): gabung
// posts + checkpoints per order, serialisasi lat/lon (kosong = null).
import { describe, expect, test } from 'bun:test';

import {
	buildRouteEditPosts,
	toRoutePostPayload
} from '../route-posts';

describe('buildRouteEditPosts', () => {
	test('pos berkoordinat terisi dari checkpoint se-order; tanpa checkpoint = kosong', () => {
		const rows = buildRouteEditPosts(
			['Basecamp', 'Pos 1', 'Puncak Prau'],
			[
				{ order: 0, lat: -7.2, lon: 109.9 },
				{ order: 2, lat: -7.3, lon: 109.95 }
			]
		);
		expect(rows).toEqual([
			{ name: 'Basecamp', lat: '-7.2', lon: '109.9' },
			{ name: 'Pos 1', lat: '', lon: '' },
			{ name: 'Puncak Prau', lat: '-7.3', lon: '109.95' }
		]);
	});

	test('tanpa posts = satu baris kosong; checkpoint ekstra diabaikan', () => {
		expect(buildRouteEditPosts([], null)).toEqual([
			{ name: '', lat: '', lon: '' }
		]);
		expect(
			buildRouteEditPosts(['A'], [{ order: 5, lat: 1, lon: 2 }])
		).toEqual([{ name: 'A', lat: '', lon: '' }]);
	});
});

describe('toRoutePostPayload', () => {
	test('trim nama, kosong = null, baris kosong dibuang', () => {
		expect(
			toRoutePostPayload([
				{ name: '  Basecamp ', lat: '-7.2', lon: '109.9' },
				{ name: '', lat: '', lon: '' },
				{ name: 'Pos 1', lat: '', lon: '' }
			])
		).toEqual([
			{ name: 'Basecamp', lat: -7.2, lon: 109.9 },
			{ name: 'Pos 1', lat: null, lon: null }
		]);
	});
});
