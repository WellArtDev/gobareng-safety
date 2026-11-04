import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	CANONICAL_ORGANIZERS,
	getCanonicalOrganizers,
	resolveOrganizers
} from '../organizers.js';
import type { Trip } from '../types.js';

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

describe('Organizer page mockup alignment (Dashboard Gobareg 13)', () => {
	it('canonical organizers array has exact 5 organizers matching mockup', () => {
		expect(CANONICAL_ORGANIZERS).toHaveLength(5);

		const names = CANONICAL_ORGANIZERS.map((o) => o.name);
		expect(names).toEqual([
			'Rizky Pratama',
			'Siti Aulia',
			'Budi Santoso',
			'Dewi Lestari',
			'Andi Maulana'
		]);

		const [rizky, siti, budi, dewi, andi] = CANONICAL_ORGANIZERS;
		expect(rizky.area).toBe('Lombok, NTB');
		expect(rizky.trip).toBe('Pendakian Gunung Rinjani');
		expect(rizky.stat).toBe('12 / 15 peserta · Sedang Berlangsung');
		expect(rizky.rating).toBe('★ 4.9');

		expect(siti.area).toBe('Malang, Jawa Timur');
		expect(siti.trip).toBe('Touring Bromo – Ijen');
		expect(siti.stat).toBe('8 / 12 peserta · Menuju Lokasi');
		expect(siti.rating).toBe('★ 4.8');

		expect(budi.area).toBe('Jawa Tengah');
		expect(budi.trip).toBe('Pendakian Gunung Merbabu');
		expect(budi.stat).toBe('14 / 15 peserta · Sedang Berlangsung');
		expect(budi.rating).toBe('★ 4.8');

		expect(dewi.area).toBe('Lumajang, Jawa Timur');
		expect(dewi.trip).toBe('Pendakian Gunung Semeru');
		expect(dewi.stat).toBe('18 / 20 peserta · Sedang Berlangsung');
		expect(dewi.rating).toBe('★ 4.9');

		expect(andi.area).toBe('Bali');
		expect(andi.trip).toBe('Touring Bali Loop');
		expect(andi.stat).toBe('6 / 10 peserta · Persiapan');
		expect(andi.rating).toBe('★ 4.7');
	});

	it('canonical organizers have valid avatar asset paths', () => {
		for (const org of CANONICAL_ORGANIZERS) {
			expect(org.avatar).toStartWith('/organizers/');
			expect(org.avatar).toEndWith('.jpeg');
		}
	});

	it('getCanonicalOrganizers adapts stat labels for English locale', () => {
		const enList = getCanonicalOrganizers('en');
		expect(enList).toHaveLength(5);
		expect(enList[0].stat).toBe('12 / 15 participants · Ongoing');
		expect(enList[1].stat).toBe('8 / 12 participants · Heading to Location');
		expect(enList[4].stat).toBe('6 / 10 participants · Preparing');
	});

	it('resolveOrganizers matches tripId when live trips are provided', () => {
		const fakeTrips: Trip[] = [
			{
				id: 'trip-rinjani',
				name: 'Pendakian Gunung Rinjani',
				type: 'HIKING',
				date: '2026-10-25',
				meetingPoint: 'Sembalun, Lombok, NTB',
				quota: 15,
				isOpenTrip: true,
				status: 'ACTIVE',
				leaderId: 'leader-1',
				createdAt: '2026-10-20'
			}
		];

		const resolved = resolveOrganizers([], fakeTrips, [], 'id');
		expect(resolved).toHaveLength(5);
		const rinjaniOrg = resolved.find((o) => o.name === 'Rizky Pratama');
		expect(rinjaniOrg).toBeDefined();
		expect(rinjaniOrg?.tripId).toBe('trip-rinjani');
	});

	it('Lihat Trip nonaktif kalau organizer tidak punya trip (1 Nov 2026: klik sebelumnya pindah menu diam-diam tanpa trip terpilih)', () => {
		const page = src('../../routes/+page.svelte');
		expect(page).toContain('disabled={!org.tripId}');
		expect(page).toContain('gotoOrganizerTrip(org)');
	});

	it('+page.svelte template markup conforms to mockup page-organizer structure', () => {
		const page = src('../../routes/+page.svelte');

		// Page hierarchy
		expect(page).toMatch(/<div class="page-view" id="page-organizer">/);
		expect(page).toMatch(/<div class="page-head">/);
		expect(page).toMatch(/<h1>\{\$t\('dashboard\.menus\.organizer'\)\}<\/h1>/);
		expect(page).toMatch(/<p>\{\$t\('dashboard\.organizerNote'\)\}<\/p>/);
		expect(page).toMatch(/<div class="list-card" id="organizerList">/);

		// Row item structure
		expect(page).toMatch(/class="row-item"/);
		expect(page).toMatch(/class="avatar-lg"/);
		expect(page).toMatch(/class="pill-status green"/);
		expect(page).toMatch(/class="spacer"/);
		expect(page).toMatch(/class="btn-sm btn-ghost-sm"/);
		expect(page).toMatch(/gotoOrganizerTrip\(org\)/);
	});

	it('+page.svelte stylesheet defines mockup tokens and classes', () => {
		const page = src('../../routes/+page.svelte');

		expect(page).toMatch(/\.page-head\s*\{/);
		expect(page).toMatch(/\.list-card\s*\{/);
		expect(page).toMatch(/\.row-item\s*\{/);
		expect(page).toMatch(/\.avatar-lg\s*\{/);
		expect(page).toMatch(/\.pill-status\.green\s*\{/);
		expect(page).toMatch(/\.btn-ghost-sm\s*\{/);
		expect(page).toMatch(/\.empty-note\s*\{/);
	});
});
