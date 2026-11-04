// TDD — popup nama member + warna SOS di peta pantau & safety
// (4 Nov 2026): marker anggota yang SOS harus berubah sendiri jadi
// merah berkedip (bukan titik merah terpisah), dan klik marker mana
// pun membuka popup nama + role + (bila SOS) alasan & waktu.
// Helper di sini murni supaya bisa dites tanpa Leaflet/DOM.
import { describe, expect, test } from 'bun:test';

import {
	activeSosBySender,
	buildMemberPopupHtml,
	memberMarkerStyle
} from '../map';
import type { SosAlert } from '../types';

const sos = (over: Partial<SosAlert> = {}): SosAlert => ({
	id: 's1',
	tripId: 't1',
	senderId: 'u2',
	senderName: 'Gotest Bai1',
	reason: 'BAN_BOCOR',
	level: 'SOS',
	lat: -6.94,
	lon: 107.59,
	status: 'OPEN',
	createdAt: '2026-11-04T11:25:00.000Z',
	...over
});

describe('memberMarkerStyle', () => {
	test('anggota tanpa SOS pakai warna role, tanpa kedip', () => {
		expect(memberMarkerStyle('LEADER', null)).toEqual({ color: '#f5c518', pulse: false });
		expect(memberMarkerStyle('MEMBER', null)).toEqual({ color: '#268c4a', pulse: false });
		expect(memberMarkerStyle('SWEEPER', null)).toEqual({ color: '#f78308', pulse: false });
	});

	test('anggota dengan SOS aktif jadi merah berkedip, apapun role-nya', () => {
		expect(memberMarkerStyle('LEADER', sos())).toEqual({ color: '#e11d48', pulse: true });
		expect(memberMarkerStyle('MEMBER', sos())).toEqual({ color: '#e11d48', pulse: true });
	});
});

describe('activeSosBySender', () => {
	test('hanya SOS aktif (bukan RESOLVED/CANCELLED), pertama menang per pengirim', () => {
		const bySender = activeSosBySender([
			sos({ id: 's-old', status: 'RESOLVED' }),
			sos({ id: 's-new', reason: 'MOTOR_RUSAK' }),
			sos({ id: 's-dup', reason: 'KECELAKAAN' }),
			sos({ id: 's-cancel', senderId: 'u9', status: 'CANCELLED' })
		]);
		expect(bySender.get('u2')?.id).toBe('s-new');
		expect(bySender.has('u9')).toBe(false);
		expect(bySender.size).toBe(1);
	});
});

describe('buildMemberPopupHtml', () => {
	test('tanpa SOS: nama + role saja', () => {
		const html = buildMemberPopupHtml('Gobareng Test 1', 'LEADER', null);
		expect(html).toContain('Gobareng Test 1');
		expect(html).toContain('LEADER');
		expect(html).not.toContain('SOS');
	});

	test('dengan SOS: nama + role + alasan + waktu (bukan ISO mentah)', () => {
		const html = buildMemberPopupHtml('Gotest Bai1', 'MEMBER', sos());
		expect(html).toContain('Gotest Bai1');
		expect(html).toContain('MEMBER');
		expect(html).toContain('BAN_BOCOR');
		expect(html).toContain('SOS');
		expect(html).not.toContain('2026-11-04T11:25:00.000Z');
	});

	test('nama/alasan di-escape, tidak bisa menyuntik HTML', () => {
		const html = buildMemberPopupHtml('<img src=x onerror=alert(1)>', 'MEMBER', sos({ reason: '<b>X</b>' }));
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<b>X</b>');
		expect(html).toContain('&lt;img');
	});

	test('waktu SOS tak valid tidak crash, tampil apa adanya', () => {
		const html = buildMemberPopupHtml('Gotest Bai1', 'MEMBER', sos({ createdAt: 'bukan-tanggal' }));
		expect(html).toContain('bukan-tanggal');
	});

	test('tanpa nama (SOS fallback): tetap tampil alasan + waktu', () => {
		const html = buildMemberPopupHtml(null, 'MEMBER', sos());
		expect(html).toContain('BAN_BOCOR');
		expect(html).toContain('SOS');
	});
});
