import type { Trip, AdminMember, TripMember } from './types.js';

export interface OrganizerItem {
	id?: string;
	name: string;
	avatar: string;
	area: string;
	trip: string;
	stat: string;
	rating: string;
	tripId?: string;
}

export const CANONICAL_ORGANIZERS: OrganizerItem[] = [
	{
		name: 'Rizky Pratama',
		avatar: '/organizers/rizky-pratama.jpeg',
		area: 'Lombok, NTB',
		trip: 'Pendakian Gunung Rinjani',
		stat: '12 / 15 peserta · Sedang Berlangsung',
		rating: '★ 4.9'
	},
	{
		name: 'Siti Aulia',
		avatar: '/organizers/siti-aulia.jpeg',
		area: 'Malang, Jawa Timur',
		trip: 'Touring Bromo – Ijen',
		stat: '8 / 12 peserta · Menuju Lokasi',
		rating: '★ 4.8'
	},
	{
		name: 'Budi Santoso',
		avatar: '/organizers/budi-santoso.jpeg',
		area: 'Jawa Tengah',
		trip: 'Pendakian Gunung Merbabu',
		stat: '14 / 15 peserta · Sedang Berlangsung',
		rating: '★ 4.8'
	},
	{
		name: 'Dewi Lestari',
		avatar: '/organizers/dewi-lestari.jpeg',
		area: 'Lumajang, Jawa Timur',
		trip: 'Pendakian Gunung Semeru',
		stat: '18 / 20 peserta · Sedang Berlangsung',
		rating: '★ 4.9'
	},
	{
		name: 'Andi Maulana',
		avatar: '/organizers/andi-maulana.jpeg',
		area: 'Bali',
		trip: 'Touring Bali Loop',
		stat: '6 / 10 peserta · Persiapan',
		rating: '★ 4.7'
	}
];

export function getCanonicalOrganizers(locale: 'id' | 'en' = 'id'): OrganizerItem[] {
	if (locale === 'id') return CANONICAL_ORGANIZERS;
	return CANONICAL_ORGANIZERS.map((o) => {
		const statParts = o.stat.split(' · ');
		const countPart = statParts[0].replace('peserta', 'participants');
		const rawStatus = statParts[1] ?? '';
		let statusPart = rawStatus;
		if (rawStatus === 'Sedang Berlangsung') statusPart = 'Ongoing';
		else if (rawStatus === 'Menuju Lokasi') statusPart = 'Heading to Location';
		else if (rawStatus === 'Persiapan') statusPart = 'Preparing';
		return {
			...o,
			stat: `${countPart} · ${statusPart}`
		};
	});
}

/**
 * Resolves verified organizers by combining real trips / members data with
 * canonical organizer metadata (avatar, rating). Falls back gracefully to
 * the 5 canonical organizers if live organizer data is empty.
 */
export function resolveOrganizers(
	verifiedMembers: AdminMember[] = [],
	trips: Trip[] = [],
	allMembers: TripMember[] = [],
	locale: 'id' | 'en' = 'id'
): OrganizerItem[] {
	const canonicalList = getCanonicalOrganizers(locale);

	// Map each canonical organizer to real trip if available
	const enrichedCanonical = canonicalList.map((canonical) => {
		const matchedTrip = trips.find(
			(t) =>
				t.name.toLowerCase().includes(canonical.trip.toLowerCase()) ||
				canonical.trip.toLowerCase().includes(t.name.toLowerCase())
		);
		if (matchedTrip) {
			return {
				...canonical,
				tripId: matchedTrip.id
			};
		}
		return canonical;
	});

	if (verifiedMembers.length === 0 && trips.length === 0) {
		return enrichedCanonical;
	}

	// Always ensure canonical organizers are present (matching mockup's primary 5)
	const seenNames = new Set<string>();
	const result: OrganizerItem[] = [];

	for (const item of enrichedCanonical) {
		seenNames.add(item.name.toLowerCase());
		result.push(item);
	}

	// If there are other verified members who lead trips, append them
	for (const member of verifiedMembers) {
		if (seenNames.has(member.name.toLowerCase())) continue;
		seenNames.add(member.name.toLowerCase());

		// Find trip led by this member
		const ledTrip = trips.find((t) => t.leaderId === member.id);
		if (ledTrip) {
			const joined = allMembers.filter((m) => m.tripId === ledTrip.id).length || ledTrip.prevJoined || 1;
			const quota = ledTrip.quota || 15;
			const statusLabel =
				locale === 'en'
					? ledTrip.status === 'ACTIVE'
						? 'Ongoing'
						: ledTrip.status === 'PLANNED'
						? 'Preparing'
						: 'Completed'
					: ledTrip.status === 'ACTIVE'
					? 'Sedang Berlangsung'
					: ledTrip.status === 'PLANNED'
					? 'Persiapan'
					: 'Selesai';
			const partWord = locale === 'en' ? 'participants' : 'peserta';

			result.push({
				id: member.id,
				name: member.name,
				avatar: member.name.toLowerCase().includes('avatar') ? member.name : '',
				area: ledTrip.meetingPoint || (locale === 'en' ? 'Indonesia' : 'Indonesia'),
				trip: ledTrip.name,
				stat: `${joined} / ${quota} ${partWord} · ${statusLabel}`,
				rating: '★ 4.8',
				tripId: ledTrip.id
			});
		}
	}

	return result;
}
