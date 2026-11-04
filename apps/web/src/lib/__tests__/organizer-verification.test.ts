import { describe, expect, test } from 'bun:test';
import {
	formatOrganizerVerification,
	organizerInitials
} from '../organizer-verification';
import type { OrganizerVerification } from '../types';

const NOW = new Date('2026-10-31T12:00:00.000Z');

function row(overrides: Partial<OrganizerVerification> = {}): OrganizerVerification {
	return {
		id: 'verification-1',
		user: { id: 'user-1', name: 'Rizky Pratama', email: 'rizky@example.com' },
		organizerType: 'HIKING',
		region: 'Lombok, NTB',
		avatarUrl: null,
		organizerName: null,
		address: null,
		hasIdentityDocument: false,
		identityDocumentComplete: true,
		profileComplete: true,
		trip: { id: 'trip-1', name: 'Pendakian Gunung Rinjani' },
		status: 'PENDING',
		submittedAt: '2026-10-31T10:00:00.000Z',
		...overrides
	};
}

describe('organizer verification view model', () => {
	test('formats a complete Indonesian hiking application with literal mockup copy', () => {
		const view = formatOrganizerVerification(row(), 'id', NOW);
		expect(view.primary).toBe('Mengajukan jadi organizer Pendakian · Lombok, NTB');
		expect(view.detail).toBe(
			'Trip terkait: Pendakian Gunung Rinjani · Dokumen: KTP & profil lengkap'
		);
		expect(view.submittedTime).toBe('2 jam yang lalu');
	});

	test('formats a complete English touring application', () => {
		const view = formatOrganizerVerification(
			row({ organizerType: 'TOURING', region: 'East Java' }),
			'en',
			NOW
		);
		expect(view.primary).toBe('Applying as a Touring organizer · East Java');
		expect(view.detail).toBe(
			'Related trip: Pendakian Gunung Rinjani · Documents: ID card & profile complete'
		);
		expect(view.submittedTime).toBe('2 hours ago');
	});

	test('uses localized missing values without malformed separators', () => {
		const idView = formatOrganizerVerification(
			row({ organizerType: null, region: null, trip: null, avatarUrl: null }),
			'id',
			NOW
		);
		expect(idView.primary).toBe('Mengajukan jadi organizer Belum diisi · Belum diisi');
		expect(idView.detail).toBe(
			'Trip terkait: Belum diisi · Dokumen: KTP & profil lengkap'
		);
		expect(idView.primary).not.toContain('··');
		expect(idView.detail).not.toMatch(/^·|·$/);

		const enView = formatOrganizerVerification(
			row({ organizerType: null, region: null, trip: null }),
			'en',
			NOW
		);
		expect(enView.primary).toBe('Applying as a Not provided organizer · Not provided');
		expect(enView.detail).toContain('Related trip: Not provided');
	});

	test('distinguishes incomplete ID card and profile combinations', () => {
		expect(
			formatOrganizerVerification(row({ identityDocumentComplete: false }), 'id', NOW).detail
		).toContain('Dokumen: KTP belum lengkap');
		expect(
			formatOrganizerVerification(row({ profileComplete: false }), 'id', NOW).detail
		).toContain('Dokumen: Profil belum lengkap');
		expect(
			formatOrganizerVerification(
				row({ identityDocumentComplete: false, profileComplete: false }),
				'id',
				NOW
			).detail
		).toContain('Dokumen: KTP & profil belum lengkap');
	});

	test('appends organizer name + address + KTP presence when the application carries them', () => {
		const view = formatOrganizerVerification(
			row({
				organizerName: 'Komunitas A',
				address: 'Jl. Merdeka 1',
				hasIdentityDocument: true
			}),
			'id',
			NOW
		);
		expect(view.detail).toContain('Nama organizer: Komunitas A');
		expect(view.detail).toContain('Alamat: Jl. Merdeka 1');
		expect(view.organizerName).toBe('Komunitas A');
		expect(view.address).toBe('Jl. Merdeka 1');
		expect(view.ktpPresent).toBe(true);
	});

	test('derives stable initials from real names', () => {
		expect(organizerInitials('Rizky Pratama')).toBe('RP');
		expect(organizerInitials('  Siti   Nur Aulia  ')).toBe('SA');
		expect(organizerInitials('Dewi')).toBe('DE');
		expect(organizerInitials('   ')).toBe('?');
	});
});
