// Login background photo picked from the browser's local hour.
// malam 18:00-05:00 -> night, pagi 05:00-11:00 -> morning,
// siang 11:00-15:00 -> day, sore 15:00-18:00 -> evening.
// Pure function (no server call, no timezone library, no geolocation)
// so the mapping is trivially testable.
export function loginBgForHour(hour: number): string {
	if (hour >= 5 && hour < 11) return '/login-mountains-morning.webp';
	if (hour >= 11 && hour < 15) return '/login-mountains-day.webp';
	if (hour >= 15 && hour < 18) return '/login-mountains-evening.webp';
	return '/login-mountains-night.webp';
}

export function loginBgForNow(now: Date = new Date()): string {
	return loginBgForHour(now.getHours());
}
