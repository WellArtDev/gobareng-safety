// Default sidebar menu for the generic dashboard shell.
//
// SINGLE SOURCE OF TRUTH: edit the menu set here, never inside the
// shell component. A dashboard page can pass its own array to the
// shell's `menus` prop instead of using this default.
//
// The default below is the exact menu list of the reference layout
// (Dashboard_Gobareg__7.html): same labels, same order. Badge counts
// from the reference (5, 86, 3, ...) are deliberately NOT copied —
// they were demo data. A dashboard that needs a different set (for
// example the trimmed safety set for posko) passes its own array at
// wiring time; this default stays as the reference set.
export interface DashboardMenuItem {
	/** Stable id, also the value matched by the shell's `activeMenu` prop. */
	id: string;
	/** i18n key under `dashboard.menus` (never a hardcoded label). */
	labelKey: string;
	/** Glyph shown before the label (taken from the reference layout). */
	icon: string;
	/**
	 * Badge style when the page passes a count for this id (file-10):
	 * 'red' for action items (Verifikasi, Notifikasi, Moderasi),
	 * 'grey' for informational counts (Semua Trip). Items without a
	 * badge style never render a badge.
	 */
	badge?: 'red' | 'grey';
}

export const dashboardMenus: DashboardMenuItem[] = [
	{ id: 'summary', labelKey: 'dashboard.menus.summary', icon: '▦' },
	{ id: 'organizer-verification', labelKey: 'dashboard.menus.organizerVerification', icon: '🛡️' },
	{ id: 'all-trips', labelKey: 'dashboard.menus.allTrips', icon: '🗺️' },
	{ id: 'global-settings', labelKey: 'dashboard.menus.globalSettings', icon: '⚙️' },
	{ id: 'organizer', labelKey: 'dashboard.menus.organizer', icon: '👥' },
	{ id: 'community-moderation', labelKey: 'dashboard.menus.communityModeration', icon: '🚩' },
	{ id: 'notifications', labelKey: 'dashboard.menus.notifications', icon: '🔔' },
	{ id: 'members', labelKey: 'dashboard.menus.members', icon: '👤' },
	{ id: 'settings', labelKey: 'dashboard.menus.settings', icon: '⚙️' }
];

// Trimmed menu set for the posko safety dashboard: the reference set
// above stays untouched as the all-dashboards default; a safety page
// passes this array to the shell's `menus` prop instead.
export const safetyMenus: DashboardMenuItem[] = [
	{ id: 'summary', labelKey: 'dashboard.menus.summary', icon: '▦' },
	{ id: 'trips', labelKey: 'dashboard.menus.trips', icon: '🗺️' },
	{ id: 'sos', labelKey: 'dashboard.menus.sos', icon: '🚨' },
	{ id: 'live-map', labelKey: 'dashboard.menus.liveMap', icon: '📍' },
	{ id: 'members', labelKey: 'dashboard.menus.tripMembers', icon: '👥' },
	{ id: 'settings', labelKey: 'dashboard.menus.settings', icon: '⚙️' }
];

// Full posko menu set: all 8 pages of the reference layout
// (Dashboard_Gobareg__9.html) plus the two safety menus (SOS, Peta
// Live) that the live dashboard already had, plus the Template Kit
// page from Dashboard_Gobareg__2__5_n6lx.html (last). The reference
// default above and `safetyMenus` stay untouched.
export const poskoMenus: DashboardMenuItem[] = [
	{ id: 'summary', labelKey: 'dashboard.menus.summary', icon: '▦' },
	{
		id: 'organizer-verification',
		labelKey: 'dashboard.menus.organizerVerification',
		icon: '🛡️',
		badge: 'red'
	},
	// Antre usulan gunung & jalur buatan user (admin-only; difilter
	// halaman untuk command_center lewat adminOnlyMenus).
	{
		id: 'proposals',
		labelKey: 'dashboard.menus.proposals',
		icon: '🏔️',
		badge: 'red'
	},
	{ id: 'trips', labelKey: 'dashboard.menus.trips', icon: '🗺️', badge: 'grey' },
	// Katalog gunung + jalur (kontrak §10, A-5): read-only untuk semua
	// peran dashboard; datanya di-seed otomatis tiap API boot.
	{ id: 'mountains', labelKey: 'dashboard.menus.mountains', icon: '⛰️' },
	{ id: 'sos', labelKey: 'dashboard.menus.sos', icon: '🚨', badge: 'red' },
	{ id: 'live-map', labelKey: 'dashboard.menus.liveMap', icon: '📍' },
	{ id: 'organizer', labelKey: 'dashboard.menus.organizer', icon: '👥' },
	{ id: 'moderation', labelKey: 'dashboard.menus.communityModeration', icon: '🚩', badge: 'red' },
	{ id: 'notifications', labelKey: 'dashboard.menus.notifications', icon: '🔔', badge: 'red' },
	{ id: 'members', labelKey: 'dashboard.menus.members', icon: '👤' },
	{ id: 'settings', labelKey: 'dashboard.menus.settings', icon: '⚙️' },
	// Staff accounts (admin-only page; the page filters this item out
	// for command_center, so it never appears in their sidebar or FAB).
	{ id: 'staff', labelKey: 'dashboard.menus.staff', icon: '🪪' }
	// Template Kit menu removed (keputusan 28 Okt 2026): the kit page
	// snippet stays in the codebase as a reference but is not linked.
];
