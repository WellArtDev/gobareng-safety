// Peringatan duplikat antre usulan: kunci label + haversine.
import { describe, expect, test } from 'bun:test';

import {
	haversineKm,
	normalizeProposalName,
	proposalWarningKeys
} from '../proposal-warnings';

describe('proposalWarningKeys', () => {
	test('tanpa peringatan -> kosong; keduanya -> dua kunci', () => {
		expect(proposalWarningKeys({ duplicateName: false, duplicateNearby: false })).toEqual([]);
		expect(proposalWarningKeys({ duplicateName: true, duplicateNearby: true })).toEqual([
			'dashboard.proposalsWarnName',
			'dashboard.proposalsWarnNearby'
		]);
	});
});

describe('haversineKm', () => {
	test('titik sama = 0; Jakarta-Bandung ~110-120 km', () => {
		expect(haversineKm(-6.2, 106.8, -6.2, 106.8)).toBe(0);
		const d = haversineKm(-6.2088, 106.8456, -6.9175, 107.6191);
		expect(d).toBeGreaterThan(100);
		expect(d).toBeLessThan(130);
	});
	test('titik berdekatan < 2 km terdeteksi sebagai nearby', () => {
		expect(haversineKm(-6.2, 106.8, -6.21, 106.81)).toBeLessThan(2);
	});
});

describe('normalizeProposalName', () => {
	test('trim + lowercase', () => {
		expect(normalizeProposalName('  Gunung Prau ')).toBe('gunung prau');
	});
});
