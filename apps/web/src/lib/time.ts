// Relative-time formatter for raw ISO timestamps ([ACTIVITY]).
//
// The posko dashboard used to render raw ISO strings ("Terakhir
// terlihat: 2026-10-28T06:34:03.233Z") in the home activity card, the
// SOS list, and the Member page alerts card. This turns those into
// localized relative times. No i18n keys are added on purpose: $t has
// no interpolation support, so this uses Intl directly with the
// page's display locale ('id-ID' / 'en-US').
//
// Buckets: < 60s seconds, < 60min minutes, < 24h hours, < 7d days,
// older than that an absolute localized date. Future timestamps clamp
// to now; invalid input returns the raw string untouched.
export function relativeTime(iso: string, locale: string, now: Date = new Date()): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return iso;
	const diff = Math.max(0, now.getTime() - ms);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return rtf.format(-seconds, 'second');
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return rtf.format(-minutes, 'minute');
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return rtf.format(-hours, 'hour');
	const days = Math.floor(hours / 24);
	if (days < 7) return rtf.format(-days, 'day');
	return new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(ms));
}
