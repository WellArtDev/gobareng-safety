import { en } from './i18n/en';
import { id } from './i18n/id';
import { relativeTime } from './time';
import type { Locale } from './i18n';
import type { OrganizerVerification } from './types';

export interface OrganizerVerificationView {
	initials: string;
	primary: string;
	detail: string;
	submittedTime: string;
	organizerName: string | null;
	address: string | null;
	ktpPresent: boolean;
}

export function organizerInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase();
}

export function formatOrganizerVerification(
	application: OrganizerVerification,
	locale: Locale,
	now = new Date()
): OrganizerVerificationView {
	const copy = locale === 'id' ? id.dashboard : en.dashboard;
	const organizerType =
		application.organizerType === 'HIKING'
			? copy.verifyTypeHiking
			: application.organizerType === 'TOURING'
				? copy.verifyTypeTouring
				: copy.verifyMissing;
	const region = application.region?.trim() || copy.verifyMissing;
	const trip = application.trip?.name.trim() || copy.verifyMissing;
	const documents = application.identityDocumentComplete
		? application.profileComplete
			? copy.verifyDocsComplete
			: copy.verifyProfileIncomplete
		: application.profileComplete
			? copy.verifyKtpIncomplete
			: copy.verifyDocsIncomplete;
	const organizerNoun = locale === 'id' ? '' : ' organizer';
	const organizerName = application.organizerName?.trim() || null;
	const address = application.address?.trim() || null;
	let detail = `${copy.verifyRelatedTrip}: ${trip} · ${copy.verifyDocuments}: ${documents}`;
	if (organizerName) detail += ` · ${copy.verifyOrganizerName}: ${organizerName}`;
	if (address) detail += ` · ${copy.verifyAddress}: ${address}`;

	return {
		initials: organizerInitials(application.user.name),
		primary: `${copy.verifyApplying} ${organizerType}${organizerNoun} · ${region}`,
		detail,
		organizerName,
		address,
		ktpPresent: application.hasIdentityDocument,
		submittedTime: relativeTime(
			application.submittedAt,
			locale === 'id' ? 'id-ID' : 'en-US',
			now
		)
	};
}
