import { describe, expect, test } from 'bun:test';
import {
	checkpointKind,
	checkpointMarkerColor
} from '../route-checkpoint-type';

// Warna marker peta modal Lihat Jalur: Pos hijau (lama), Titik kemah
// oranye (brand), Puncak emas (warna role LEADER, bukan merah SOS).
describe('checkpointKind / checkpointMarkerColor', () => {
	test('Post / tanpa tags / tag lain = pos hijau', () => {
		expect(checkpointKind(['Post'])).toBe('post');
		expect(checkpointKind([])).toBe('post');
		expect(checkpointKind(undefined)).toBe('post');
		expect(checkpointKind(['Shelter', 'WaterSource'])).toBe('post');
		expect(checkpointKind(['OfficialBaseCamp'])).toBe('post');
		expect(checkpointMarkerColor('post')).toBe('#268c4a');
	});

	test('CampArea = titik kemah oranye', () => {
		expect(checkpointKind(['CampArea'])).toBe('camp');
		expect(checkpointMarkerColor('camp')).toBe('#f78308');
	});

	test('Peak menang atas CampArea; isTarget juga puncak', () => {
		expect(checkpointKind(['Peak', 'CampArea'])).toBe('peak');
		expect(checkpointKind(['Post'], true)).toBe('peak');
		expect(checkpointMarkerColor('peak')).toBe('#f5c518');
	});
});
