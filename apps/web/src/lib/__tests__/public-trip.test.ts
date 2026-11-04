// TDD — helper halaman publik /undang + /pantau (2 Nov 2026).
import { describe, expect, test } from 'bun:test';

import {
	isInviteUsable,
	isPantauScopeAllowed,
	isQuotaFull,
	trackedMemberCount,
	waLeaderUrl
} from '../public-trip';
import type { SharedTripView } from '../public-trip';

describe('isInviteUsable', () => {
	test('hanya PLANNED yang usable; ACTIVE/CLOSED tidak', () => {
		expect(isInviteUsable('PLANNED')).toBe(true);
		expect(isInviteUsable('ACTIVE')).toBe(false);
		expect(isInviteUsable('CLOSED')).toBe(false);
	});
});

describe('isPantauScopeAllowed', () => {
	test('hanya ANYONE; EMERGENCY_CONTACT ditolak (tetap app-only)', () => {
		expect(isPantauScopeAllowed('ANYONE')).toBe(true);
		expect(isPantauScopeAllowed('EMERGENCY_CONTACT')).toBe(false);
		expect(isPantauScopeAllowed('')).toBe(false);
	});
});

describe('isQuotaFull', () => {
	test('null -> tidak pernah penuh; 10/10 penuh; 9/10 belum; 11/10 penuh', () => {
		expect(isQuotaFull(null, 99)).toBe(false);
		expect(isQuotaFull(undefined, 99)).toBe(false);
		expect(isQuotaFull(10, 10)).toBe(true);
		expect(isQuotaFull(10, 9)).toBe(false);
		expect(isQuotaFull(10, 11)).toBe(true);
	});
});

describe('trackedMemberCount', () => {
	const viewWith = (positions: SharedTripView['positions']): SharedTripView => ({
		trip: { id: 't1', name: 'Trip Pagi', type: 'TOURING', status: 'ACTIVE' },
		scope: 'ANYONE',
		locations: [],
		positions,
		activeSos: [],
		status: 'SAFE'
	});

	test('hanya anggota berposisi yang dihitung (pill hero "anggota terpantau")', () => {
		expect(
			trackedMemberCount(
				viewWith([
					{ userId: 'u1', role: 'LEADER', user: { id: 'u1', name: 'Budi', slug: 'budi' }, location: { id: 'l1', tripId: 't1', userId: 'u1', lat: -6.2, lon: 106.8, ts: '2026-11-03T09:00:00.000Z' } },
					{ userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Ani', slug: 'ani' }, location: null }
				])
			)
		).toBe(1);
	});

	test('posisi kosong total -> 0', () => {
		expect(trackedMemberCount(viewWith([]))).toBe(0);
	});
});

describe('waLeaderUrl', () => {
	test('bersihkan spasi/dash/+ -> wa.me digit', () => {
		expect(waLeaderUrl('+62 812-3456-789')).toBe('https://wa.me/628123456789');
		expect(waLeaderUrl('08123456789')).toBe('https://wa.me/08123456789');
	});
	test('kosong/null/bukan digit -> null (tanpa link rusak)', () => {
		expect(waLeaderUrl(null)).toBeNull();
		expect(waLeaderUrl(undefined)).toBeNull();
		expect(waLeaderUrl('')).toBeNull();
		expect(waLeaderUrl('   ')).toBeNull();
		expect(waLeaderUrl('abc')).toBeNull();
		expect(waLeaderUrl('+- ')).toBeNull();
	});
});
