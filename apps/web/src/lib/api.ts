import type { InviteResolve, SharedTripView } from './public-trip';
import type {
	AdminMember,
	AppNotification,
	CommandCenterTripRow,
	Community,
	CurrentWeather,
	Quake,
	ModReport,
	Location,
	Me,
	MemberAlert,
	Mountain,
	MountainDetail,
	MountainProposal,
	MountainRoute,
	MountainRouteInput,
	RouteProposal,
	OrganizerVerification,
	PlatformSettings,
	SosAlert,
	StaffAccount,
	Trip,
	TripMember,
	TripPosition,
	TripReport
} from './types';

export class ApiError extends Error {
	constructor(public code: string) {
		super(code);
	}
}

const TOKEN_KEY = 'gobareng-token';

export function getToken(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
	if (typeof localStorage === 'undefined') return;
	if (token) localStorage.setItem(TOKEN_KEY, token);
	else localStorage.removeItem(TOKEN_KEY);
}

function base(): string {
	if (typeof window !== 'undefined') {
		const host = window.location.hostname;
		if (host === 'posko.gobareng.app') return 'https://jalur.gobareng.app';
		if (host === 'localhost' || host === '127.0.0.1') return window.location.origin;
		return 'https://jalur.gobareng.app';
	}
	return 'https://jalur.gobareng.app';
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${base()}${path}`, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
				...(init.headers ?? {})
			}
		});
	} catch {
		throw new ApiError('NETWORK');
	}
	const body = (await res.json().catch(() => ({}))) as {
		data?: T;
		error?: { code?: string };
	};
	if (!res.ok) throw new ApiError(body.error?.code ?? 'GENERIC');
	return body.data as T;
}

export const api = {
	// Login OTP passwordless (Wella 1 Nov 2026): tidak ada lagi login
	// password. POST /auth/login dan PATCH /auth/me/password di API
	// sudah 410 OTP_ONLY.
	otpChannels: () =>
		call<{ email: boolean; sms: boolean; whatsapp: boolean }>(
			'/api/v1/auth/otp/channels'
		),
	requestOtp: (identifier: string, channel: string) =>
		call<{ channel: string; expiresInSeconds: number }>('/api/v1/auth/otp/request', {
			method: 'POST',
			body: JSON.stringify({ identifier, channel })
		}),
	verifyOtp: (identifier: string, code: string) =>
		call<
			| { user: Me; token: string; refreshToken: string }
			| { needsName: true; needsEmail: boolean }
		>('/api/v1/auth/otp/verify', {
			method: 'POST',
			body: JSON.stringify({ identifier, code })
		}),
	// Magic link juri tanpa OTP (3 Nov 2026): tautan desktop
	// posko.gobareng.app/?magic=<token> ditukar jadi sesi dashboard.
	// Dashboard hanya menyimpan access token seperti login OTP (tidak
	// ada rotasi refresh di web); tautan pakai-ulang, jadi juri cukup
	// membuka tautannya lagi bila sesi 15 menit habis.
	redeemMagicLink: (token: string) =>
		call<{ user: Me; token: string; refreshToken: string }>(
			'/api/v1/auth/magic-link',
			{
				method: 'POST',
				body: JSON.stringify({ token })
			}
		),
	me: () => call<{ user: Me }>('/api/v1/auth/me'),
	// Halaman publik INVITE + SHARE (2 Nov 2026). Resolve tanpa auth;
	// join via undangan butuh login (token dikirim call() bila ada).
	inviteResolve: (token: string) =>
		call<InviteResolve>(`/api/v1/invites/${token}`),
	joinViaInvite: (token: string) =>
		call<{ joined: boolean }>(`/api/v1/invites/${token}/join`, {
			method: 'POST'
		}),
	sharedTrip: (token: string) =>
		call<SharedTripView>(`/api/v1/shared-trips/${token}`),
	// Tab Ubah Kata Sandi dicopot (tindak lanjut #122): tidak ada lagi
	// klien ubah kata sandi — endpointnya 410 OTP_ONLY. Ganti email
	// tetap memakai gate kata sandi saat ini lewat updateMe di bawah.
	updateMe: (patch: { name?: string; email?: string; currentPassword?: string }) =>
		call<{ user: Me }>('/api/v1/auth/me', {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	// Upload multipart tidak bisa lewat call() JSON — fetch sendiri
	// dengan header Authorization yang sama, tanpa Content-Type manual
	// (browser mengisi boundary FormData).
	uploadAvatar: async (file: File): Promise<{ user: Me }> => {
		const form = new FormData();
		form.append('avatar', file);
		let res: Response;
		try {
			res = await fetch(`${base()}/api/v1/auth/me/avatar`, {
				method: 'POST',
				headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
				body: form
			});
		} catch {
			throw new ApiError('NETWORK');
		}
		const body = (await res.json().catch(() => ({}))) as {
			data?: { user: Me };
			error?: { code?: string };
		};
		if (!res.ok) throw new ApiError(body.error?.code ?? 'GENERIC');
		return body.data as { user: Me };
	},
	deleteAvatar: () =>
		call<{ user: Me }>('/api/v1/auth/me/avatar', { method: 'DELETE' }),
	uploadQris: async (file: File): Promise<{ settings: PlatformSettings }> => {
		const form = new FormData();
		form.append('qrisImage', file);
		let res: Response;
		try {
			res = await fetch(`${base()}/api/v1/admin/pro-qris`, {
				method: 'POST',
				headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
				body: form
			});
		} catch {
			throw new ApiError('NETWORK');
		}
		const body = (await res.json().catch(() => ({}))) as {
			data?: { settings: PlatformSettings };
			error?: { code?: string };
		};
		if (!res.ok) throw new ApiError(body.error?.code ?? 'GENERIC');
		return body.data as { settings: PlatformSettings };
	},
	deleteQris: () =>
		call<{ settings: PlatformSettings }>('/api/v1/admin/pro-qris', {
			method: 'DELETE'
		}),
	trips: () => call<{ trips: Trip[] }>('/api/v1/trip-groups'),
	// SET-4/5/6: toggle platform (GET: admin + command_center; PATCH: admin).
	platformSettings: () =>
		call<{ settings: PlatformSettings }>('/api/v1/admin/settings'),
	updatePlatformSettings: (patch: Partial<PlatformSettings>) =>
		call<{ settings: PlatformSettings }>('/api/v1/admin/settings', {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	staffList: () => call<{ staff: StaffAccount[] }>('/api/v1/admin/staff'),
	// Akun staff baru login lewat OTP ke emailnya — tidak ada password
	// yang dibuat/dikirim (API menyimpan hash unusable 'otp-only:').
	createStaff: (name: string, email: string, role: string) =>
		call<{ user: StaffAccount }>('/api/v1/admin/staff', {
			method: 'POST',
			body: JSON.stringify({ name, email, role })
		}),
	// Edit profil staff (popup Edit Profile): nama/email saja, tanpa
	// mengubah peran dan tanpa password.
	updateStaff: (id: string, patch: { name?: string; email?: string }) =>
		call<{ user: StaffAccount }>(`/api/v1/admin/staff/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	// Upload multipart tidak bisa lewat call() JSON — fetch sendiri
	// dengan header Authorization yang sama, tanpa Content-Type manual.
	uploadStaffAvatar: async (id: string, file: File): Promise<{ user: StaffAccount }> => {
		const form = new FormData();
		form.append('avatar', file);
		let res: Response;
		try {
			res = await fetch(`${base()}/api/v1/admin/staff/${id}/avatar`, {
				method: 'POST',
				headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
				body: form
			});
		} catch {
			throw new ApiError('NETWORK');
		}
		const body = (await res.json().catch(() => ({}))) as {
			data?: { user: StaffAccount };
			error?: { code?: string };
		};
		if (!res.ok) throw new ApiError(body.error?.code ?? 'GENERIC');
		return body.data as { user: StaffAccount };
	},
	deleteStaffAvatar: (id: string) =>
		call<{ user: StaffAccount }>(`/api/v1/admin/staff/${id}/avatar`, {
			method: 'DELETE'
		}),
	adminMembers: () =>
		call<{ members: AdminMember[]; proUserIds: string[] }>('/api/v1/admin/members'),
	pendingVerifications: () =>
		call<{ pending: OrganizerVerification[] }>('/api/v1/admin/verifications'),
	// Dokumen KTP bersifat privat (tidak lewat /uploads): diambil
	// sebagai blob bertoken, lalu dibuka sebagai object URL. call()
	// tidak bisa dipakai — ia mem-parsing JSON.
	verificationDocument: async (id: string): Promise<string> => {
		const res = await fetch(`${base()}/api/v1/admin/verifications/${id}/document`, {
			headers: { Authorization: `Bearer ${getToken()}` }
		});
		if (!res.ok) throw new ApiError('GENERIC');
		return URL.createObjectURL(await res.blob());
	},
	verifyMember: (id: string) =>
		call<{ user: AdminMember }>(`/api/v1/admin/members/${id}/verify`, { method: 'PATCH' }),
	rejectVerification: (id: string) =>
		call<{ user: AdminMember }>(`/api/v1/admin/members/${id}/reject-verification`, {
			method: 'PATCH'
		}),
	reports: (status?: string) =>
		call<{ reports: ModReport[] }>(
			`/api/v1/admin/reports${status ? `?status=${status}` : ''}`
		),
	closeReport: (id: string, action: 'ACTIONED' | 'DISMISSED') =>
		call<{ report: ModReport }>(`/api/v1/admin/reports/${id}/close`, {
			method: 'PATCH',
			body: JSON.stringify({ action })
		}),
	communities: () => call<{ communities: Community[] }>('/api/v1/communities'),
	deleteCommunity: (id: string) =>
		call<{ deleted: boolean }>(`/api/v1/communities/${id}`, { method: 'DELETE' }),
	notifications: () =>
		call<{ notifications: AppNotification[] }>('/api/v1/notifications'),
	// Antre persetujuan admin untuk usulan gunung & jalur buatan user.
	proposals: () =>
		call<{ mountains: MountainProposal[]; routes: RouteProposal[] }>('/api/v1/mountains/proposals'),
	approveProposal: (kind: 'mountain' | 'route', id: string) =>
		call<{ approved: unknown }>(`/api/v1/mountains/proposals/${id}/approve?kind=${kind}`, {
			method: 'POST'
		}),
	rejectProposal: (kind: 'mountain' | 'route', id: string, reason?: string) =>
		call<{ proposal: unknown }>(`/api/v1/mountains/proposals/${id}/reject?kind=${kind}`, {
			method: 'POST',
			body: JSON.stringify(reason ? { reason } : {})
		}),
	mountains: () => call<{ mountains: Mountain[] }>('/api/v1/mountains'),
	mountain: (id: string) =>
		call<{ mountain: MountainDetail }>(`/api/v1/mountains/${id}`),
	mountainRoutes: (id: string) =>
		call<{ routes: MountainRoute[] }>(`/api/v1/mountains/${id}/routes`),
	mountainRoute: (mountainId: string, routeId: string) =>
		call<{ route: MountainRoute }>(
			`/api/v1/mountains/${mountainId}/routes/${routeId}`
		),
	// Tabel Gunung (admin-only): edit, nonaktifkan/aktifkan (via isActive),
	// dan hapus. Klien lain tetap read-only.
	updateMountain: (id: string, patch: Partial<Mountain>) =>
		call<{ mountain: Mountain }>(`/api/v1/mountains/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	deleteMountain: (id: string) =>
		call<{ deleted: boolean }>(`/api/v1/mountains/${id}`, { method: 'DELETE' }),
	// Jalur (admin-only): tambah, edit, hapus.
	createMountainRoute: (mountainId: string, body: MountainRouteInput) =>
		call<{ route: MountainRoute }>(`/api/v1/mountains/${mountainId}/routes`, {
			method: 'POST',
			body: JSON.stringify(body)
		}),
	updateMountainRoute: (
		mountainId: string,
		routeId: string,
		patch: Partial<MountainRouteInput> & { isActive?: boolean }
	) =>
		call<{ route: MountainRoute }>(`/api/v1/mountains/${mountainId}/routes/${routeId}`, {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	deleteMountainRoute: (mountainId: string, routeId: string) =>
		call<{ deleted: boolean }>(`/api/v1/mountains/${mountainId}/routes/${routeId}`, {
			method: 'DELETE'
		}),
	uploadMountainImage: async (id: string, file: File) => {
		const fd = new FormData();
		fd.append('image', file);
		let res: Response;
		try {
			res = await fetch(`${base()}/api/v1/mountains/${id}/image`, {
				method: 'POST',
				headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
				body: fd
			});
		} catch {
			throw new ApiError('NETWORK');
		}
		const body = (await res.json().catch(() => ({}))) as {
			data?: { mountain: Mountain };
			error?: { code?: string };
		};
		if (!res.ok) throw new ApiError(body.error?.code ?? 'GENERIC');
		return body.data as { mountain: Mountain };
	},
	notificationsReadAll: () =>
		call<{ read: boolean }>('/api/v1/notifications/read-all', { method: 'PATCH' }),
	notificationRead: (id: string) =>
		call<{ notification: AppNotification }>(`/api/v1/notifications/${id}/read`, {
			method: 'PATCH'
		}),
	suspendMember: (id: string) =>
		call<{ user: StaffAccount }>(`/api/v1/admin/members/${id}/suspend`, {
			method: 'PATCH'
		}),
	unsuspendMember: (id: string) =>
		call<{ user: StaffAccount }>(`/api/v1/admin/members/${id}/unsuspend`, {
			method: 'PATCH'
		}),
	setMemberCountry: (id: string, country: string | null) =>
		call<{ user: StaffAccount }>(`/api/v1/admin/members/${id}/country`, {
			method: 'PATCH',
			body: JSON.stringify({ country })
		}),
	deleteMember: (id: string) =>
		call<{ deleted: boolean }>(`/api/v1/admin/members/${id}`, {
			method: 'DELETE'
		}),
	// Edit profil member (popup Edit Profil halaman Member): nama/email
	// saja, tanpa mengubah peran dan tanpa password. Di API, route ini
	// memakai ulang helper profilePatch/saveProfilePatch dengan gate
	// perannya sendiri (target member, bukan staff).
	updateMember: (id: string, patch: { name?: string; email?: string }) =>
		call<{ user: AdminMember }>(`/api/v1/admin/members/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(patch)
		}),
	tripMembers: (tripId: string) =>
		call<{ members: TripMember[] }>(`/api/v1/trip-groups/${tripId}/members`),
	tripLocations: (tripId: string) =>
		call<{ locations: Location[] }>(`/api/v1/trip-groups/${tripId}/locations`),
	tripSos: (tripId: string) =>
		call<{ sos: SosAlert[] }>(`/api/v1/trip-groups/${tripId}/sos`),
	acknowledgeSos: (tripId: string, sosId: string) =>
		call<{ sos: SosAlert }>(`/api/v1/trip-groups/${tripId}/sos/${sosId}/acknowledge`, {
			method: 'PATCH'
		}),
	resolveSos: (tripId: string, sosId: string) =>
		call<{ sos: SosAlert }>(`/api/v1/trip-groups/${tripId}/sos/${sosId}/resolve`, {
			method: 'PATCH'
		}),
	safetyScore: (tripId: string) =>
		call<{ score: number }>(`/api/v1/trip-groups/${tripId}/safety-score`),
	aiSummary: (tripId: string) =>
		call<{ summary: string; model: string; generatedAt: string }>(
			`/api/v1/trip-groups/${tripId}/ai-summary`
		),
	// AI-R: laporan pasca-trip tersimpan (hanya trip CLOSED; generate =
	// admin, baca = dashboard). 404 REPORT_NOT_FOUND = belum ada laporan.
	tripReport: (tripId: string) =>
		call<{ report: TripReport }>(`/api/v1/trip-groups/${tripId}/trip-report`),
	generateTripReport: (tripId: string) =>
		call<{ report: TripReport }>(`/api/v1/trip-groups/${tripId}/trip-report`, {
			method: 'POST'
		}),
	memberAlerts: (tripId: string) =>
		call<{ alerts: MemberAlert[] }>(`/api/v1/trip-groups/${tripId}/member-alerts`),
	// CC: members joined with their latest location, one call per trip.
	tripPositions: (tripId: string) =>
		call<{ positions: TripPosition[] }>(`/api/v1/trip-groups/${tripId}/positions`),
	// CC: every ACTIVE trip with positions + active SOS (dashboard roles only).
	commandCenterOverview: () =>
		call<{ trips: CommandCenterTripRow[] }>('/api/v1/command-center/overview'),
	// WX-1: cuaca + gempa (provider per keputusan 28 Okt: BMKG di
	// Indonesia, Open-Meteo di luar; gempa BMKG/USGS). Fail-soft di
	// server — weather bisa null, quakes bisa [].
	weatherCurrent: (lat: number, lon: number) =>
		call<{ provider: string; weather: CurrentWeather | null }>(
			`/api/v1/weather/current?lat=${lat}&lon=${lon}`
		),
	weatherQuakes: (lat: number, lon: number) =>
		call<{ provider: string; quakes: Quake[] }>(`/api/v1/weather/quakes?lat=${lat}&lon=${lon}`),
	socketUrl: () => base()
};
