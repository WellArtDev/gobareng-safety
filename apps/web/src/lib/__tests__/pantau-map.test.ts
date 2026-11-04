// TDD — adaptor peta halaman publik /pantau (3 Nov 2026): dari payload
// SharedTripView ke input createMap.setData, tanpa mengubah payload.
import { describe, expect, test } from 'bun:test';

import { buildPantauMapInput } from '../pantau-map';
import type { SharedTripView } from '../public-trip';

function viewWith(
	positions: SharedTripView['positions'],
	sos: SharedTripView['activeSos'] = []
): SharedTripView {
	return {
		trip: { id: 't1', name: 'ke warjok', type: 'TOURING', status: 'ACTIVE' },
		scope: 'ANYONE',
		locations: [],
		positions,
		activeSos: sos,
		status: 'SAFE'
	};
}

const loc = (userId: string, lat: number, lon: number) => ({
	id: `loc-${userId}`,
	tripId: 't1',
	userId,
	lat,
	lon,
	ts: '2026-11-03T09:00:00.000Z'
});

describe('buildPantauMapInput', () => {
	test('hanya anggota berposisi yang jadi marker; urutan dipertahankan', () => {
		const input = buildPantauMapInput(
			viewWith([
				{ userId: 'u1', role: 'LEADER', user: { id: 'u1', name: 'WellA', slug: 'wella' }, location: loc('u1', -6.33, 106.77) },
				{ userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Anak', slug: 'anak' }, location: null }
			])
		);
		expect(input.locations.map((l) => l.userId)).toEqual(['u1']);
		expect(input.hasMap).toBe(true);
	});

	test('roles dipetakan dari semua posisi (dipakai pewarnaan marker)', () => {
		const input = buildPantauMapInput(
			viewWith([
				{ userId: 'u1', role: 'LEADER', user: { id: 'u1', name: 'WellA', slug: 'wella' }, location: loc('u1', -6.33, 106.77) },
				{ userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Anak', slug: 'anak' }, location: null }
			])
		);
		expect(input.roles.get('u1')).toBe('LEADER');
		expect(input.roles.get('u2')).toBe('MEMBER');
	});

	test('SOS aktif diteruskan apa adanya (setData yang menyaring RESOLVED/CANCELLED)', () => {
		const sos = [
			{ id: 's1', tripId: 't1', senderId: 'u1', senderName: 'WellA', reason: 'MOTOR_RUSAK', level: 'SOS', lat: -6.33, lon: 106.77, status: 'OPEN', createdAt: '2026-11-03T09:00:00.000Z' }
		] as SharedTripView['activeSos'];
		const input = buildPantauMapInput(viewWith([], sos));
		expect(input.sos).toEqual(sos);
	});

	test('tanpa anggota berposisi: hasMap false, lokasi kosong', () => {
		const input = buildPantauMapInput(
			viewWith([
				{ userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Anak', slug: 'anak' }, location: null }
			])
		);
		expect(input.locations).toEqual([]);
		expect(input.hasMap).toBe(false);
	});

	test('posisi kosong total: hasMap false, tidak throw', () => {
		const input = buildPantauMapInput(viewWith([]));
		expect(input.locations).toEqual([]);
		expect(input.roles.size).toBe(0);
		expect(input.hasMap).toBe(false);
	});

	test('names dipetakan dari semua posisi (dipakai popup marker)', () => {
		const input = buildPantauMapInput(
			viewWith([
				{ userId: 'u1', role: 'LEADER', user: { id: 'u1', name: 'WellA', slug: 'wella' }, location: loc('u1', -6.33, 106.77) },
				{ userId: 'u2', role: 'MEMBER', user: { id: 'u2', name: 'Anak', slug: 'anak' }, location: null }
			])
		);
		expect(input.names.get('u1')).toBe('WellA');
		expect(input.names.get('u2')).toBe('Anak');
	});
});
