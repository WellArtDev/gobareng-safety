// Shapes mirror the F2 API contract (docs/api-contract.md) and
// apps/api/src/store.ts. The web dashboard consumes them read-only
// except for SOS acknowledge/resolve (M3 AC).
export type TripType = 'HIKING' | 'TOURING';
export type TripRole = 'LEADER' | 'SWEEPER' | 'MEDIC' | 'MEMBER';
export type TripStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type SosLevel = 'EMERGENCY' | 'URGENT' | 'HELP';
export type SosStatus =
	| 'ACTIVE'
	| 'ACKNOWLEDGED'
	| 'IN_PROGRESS'
	| 'RESOLVED'
	| 'CANCELLED'
	| 'FALSE_ALARM';

export interface Trip {
	id: string;
	name: string;
	type: TripType;
	date: string;
	meetingPoint: string;
	meetingLat?: number | null;
	meetingLon?: number | null;
	// Tujuan touring (API trips.ts: both-or-neither; null = tak ada).
	// Dipakai fokus peta saat trip touring tak punya titik kumpul.
	// Nama tujuan + harga dikirim API list (mapTrip spread) juga.
	destination?: string | null;
	destinationLat?: number | null;
	destinationLon?: number | null;
	// Harga per peserta (rupiah); null = gratis.
	price?: number | null;
	quota?: number | null;
	prevJoined?: number | null;
	image?: string | null;
	note?: string | null;
	isOpenTrip: boolean;
	status: TripStatus;
	leaderId: string;
	createdAt: string;
}

// AI-R: one row of GET /trip-groups/:id/trip-report. facts mirrors
// apps/api/src/ai-report.ts ReportFacts (snapshot from real DB rows).
export interface TripReportFacts {
	tripName: string;
	tripType: string;
	tripDate: string;
	meetingPoint: string;
	memberCount: number;
	departedCount: number;
	notDepartedCount: number;
	attendance: {
		userId: string;
		name: string;
		role: string;
		attendance: string;
		checkInCount: number;
	}[];
	checkpointCount: number;
	checkInCount: number;
	checkpoints: { name: string; checkInCount: number }[];
	sosTotal: number;
	sosByReason: { reason: string; count: number }[];
}

export interface TripReport {
	id: string;
	tripId: string;
	generatedById: string;
	summary: string;
	model: string;
	facts: TripReportFacts;
	version: number;
	isRegenerated: boolean;
	createdAt: string;
	updatedAt: string;
}

// One row of GET /communities (Komunitas page, tab Komunitas Aktif).
export interface Community {
	id: string;
	name: string;
	memberCount: number;
	createdAt: string;
}

// One row of GET /admin/reports (Moderasi page).
export type ReportStatus = 'OPEN' | 'ACTIONED' | 'DISMISSED';

export interface ModReport {
	id: string;
	reporterId: string;
	reporterName: string;
	targetType: string;
	targetId: string | null;
	reason: string;
	status: ReportStatus;
	createdAt: string;
	closedAt: string | null;
}

export interface TripMember {
	tripId: string;
	userId: string;
	role: TripRole;
	attendance: string;
	/** Joined public user row from GET /trip-groups/:id/members. */
	user?: { id: string; email: string; name: string } | null;
}

// One row of GET /mountains (kontrak §10, A-5; tabel Gunung 1 Nov 2026).
export interface Mountain {
	id: string;
	name: string;
	elevationM: number;
	location: string;
	difficultyKey: string;
	province: string;
	imageUrl: string | null;
	volcanoActive: boolean;
	isActive: boolean;
	routeCount: number;
	description?: string | null;
	lat?: number | null;
	lon?: number | null;
}

// One row of GET /mountains/:id/routes (kontrak §10, A-5).
export interface MountainRoute {
	id: string;
	mountainId: string;
	name: string;
	meetingPoint: string;
	// Statistik null = tidak diketahui (impor katalog); jangan render 0.
	distanceKm: number | null;
	gainM: number | null;
	estHours: number | null;
	recommended: boolean;
	isActive: boolean;
	// Daftar pos berurutan dari basecamp sampai puncak (nama saja);
	// selalu diakhiri Puncak — dibuat otomatis oleh API saat simpan.
	posts: string[];
	// Detail jalur MDPL (hanya dari GET satu jalur): geometri track
	// shifted + checkpoint berkoordinat; daftar jalur tidak memuatnya.
	track?: number[][][] | null;
	checkpoints?: {
		name: string;
		order: number;
		lat: number;
		lon: number;
		elevationM: number | null;
		autoCheckpoint: boolean;
		isTarget: boolean;
		// Tags MDPL (Post/CampArea/Peak/dll.); [] = pos admin manual.
		tags: string[];
	}[];
}

// Body form Tambah/Edit Jalur (admin-only). posts boleh string polos
// (nama saja, koordinat lama dipertahankan per urutan) atau objek
// { name, lat, lon } (null eksplisit = hapus koordinat).
export interface MountainRouteInput {
	name: string;
	meetingPoint: string;
	distanceKm: number;
	gainM: number;
	estHours: number;
	recommended: boolean;
	posts: (string | { name: string; lat: number | null; lon: number | null })[];
}

// Usulan gunung & jalur buatan user — antre persetujuan admin.
// Usulan pending TIDAK masuk katalog publik; approve membuat entri
// Mountain/Route sungguhan (source 'USER', selamat dari seed MDPL).
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface MountainProposal {
	id: string;
	name: string;
	location: string;
	lat: number;
	lon: number;
	elevationM: number | null;
	status: ProposalStatus;
	rejectReason: string | null;
	createdAt: string;
	proposer?: { id: string; name: string; email: string } | null;
	// Peringatan duplikat dari GET admin (bukan dari /mine).
	duplicateName?: boolean;
	duplicateNearby?: boolean;
}

export interface RouteProposalCheckpoint {
	id: string;
	order: number;
	name: string;
	lat: number;
	lon: number;
	isGathering: boolean;
}

export interface RouteProposal {
	id: string;
	mountainId: string;
	mountainName?: string;
	name: string;
	status: ProposalStatus;
	rejectReason: string | null;
	createdAt: string;
	proposer?: { id: string; name: string; email: string } | null;
	posts: RouteProposalCheckpoint[];
	duplicateName?: boolean;
	duplicateNearby?: boolean;
}

// GET /mountains/:id — gunung beserta jalurnya.
export interface MountainDetail extends Mountain {
	routes: MountainRoute[];
}

export interface Location {
	id: string;
	tripId: string;
	userId: string;
	lat: number;
	lon: number;
	altitude?: number | null;
	batteryLevel?: number | null;
	ts: string;
}

// One row of GET /trip-groups/:id/positions (CC): member + latest
// location (null until the member reports a position).
export interface TripPosition {
	userId: string;
	role: TripRole;
	user: { id: string; name: string; slug: string };
	location: Location | null;
}

// One row of GET /command-center/overview: an ACTIVE trip with its
// member positions and not-yet-closed SOS alerts.
export interface CommandCenterTripRow {
	trip: Trip;
	positions: TripPosition[];
	sos: SosAlert[];
}

export interface SosAlert {
	id: string;
	tripId: string;
	senderId: string;
	/** Display name of the sender (API joins it); null when unknown. */
	senderName?: string | null;
	reason: string;
	level: SosLevel;
	lat: number;
	lon: number;
	status: SosStatus;
	createdAt: string;
	/** AI-P: condition photos + AI vision descriptions (absent for SOS
	 * without photos). `model` set = render the Muse Spark Open
	 * attribution; null model = show the "not available" note. */
	photos?: SosPhoto[];
}

// AI-P — foto SOS (bentuk respons GET /sos-photos + detail SOS yang
// diperkaya). aiDescription/model null = vision belum tersedia.
export interface SosPhoto {
	id: string;
	kind: 'TRIP' | 'GENERAL';
	sosId: string;
	senderId: string;
	photoUrl: string;
	aiDescription: string | null;
	model: string | null;
	aiStatus: 'PENDING' | 'AVAILABLE' | 'UNAVAILABLE';
	createdAt: string;
}

export type DashboardRole = 'admin' | 'command_center' | 'user';

export interface Me {
	id: string;
	email: string;
	/** Display name (publicUser always includes it; shown on the profile chip). */
	name: string;
	isAdmin: boolean;
	role: DashboardRole;
	/** Foto profil (/uploads/avatars/*) atau null bila belum diunggah. */
	avatarUrl: string | null;
}

// One row of GET /admin/staff (public user shape, no password hash).
export interface StaffAccount {
	id: string;
	email: string;
	name: string;
	phone: string | null;
	country: string | null;
	role: DashboardRole;
	isAdmin: boolean;
	isVerified: boolean;
	verificationRejectedAt?: string | null;
	suspendedAt: string | null;
	/** Foto profil (/uploads/avatars/*) atau null bila belum diunggah. */
	avatarUrl: string | null;
}

// Public user row from GET /admin/members / GET /admin/verifications
// (same shape as StaffAccount; separate alias for readability).
export type AdminMember = StaffAccount;

export interface OrganizerVerification {
	id: string;
	user: Pick<AdminMember, 'id' | 'name' | 'email'>;
	organizerType: TripType | null;
	region: string | null;
	avatarUrl: string | null;
	organizerName: string | null;
	address: string | null;
	hasIdentityDocument: boolean;
	identityDocumentComplete: boolean;
	profileComplete: boolean;
	trip: Pick<Trip, 'id' | 'name'> | null;
	status: 'PENDING';
	submittedAt: string;
}

// One row of GET /notifications (contract §9). `kind` is a code the
// client maps to an i18n key; actorName is data, not UI text.
export type NotificationKind =
	| 'SOS_TRIGGERED'
	| 'CHECKPOINT_CHECKIN'
	| 'VERIFICATION_REQUEST';

export interface AppNotification {
	id: string;
	userId: string;
	kind: NotificationKind;
	tripId: string | null;
	refId: string | null;
	actorName: string | null;
	createdAt: string;
	readAt: string | null;
}

// Shape returned by GET /trip-groups/:id/member-alerts (apps/api
// routes/trips.ts): members whose last position is stale (> signal-loss
// window) or whose battery is low (< 20%).
export interface MemberAlert {
	userId: string;
	/** Display name of the alert owner (API joins it); null when unknown. */
	userName?: string | null;
	lastSeen: string;
	batteryLevel?: number;
}

// WX-1: cuaca + gempa (keputusan 28 Okt 2026 — BMKG di Indonesia,
// Open-Meteo di luar; gempa BMKG/USGS; OpenWeather dicoret).
export interface CurrentWeather {
	provider: 'bmkg' | 'open-meteo';
	temperatureC: number | null;
	weatherCode: number | null;
	windSpeedKmh: number | null;
	description: string | null;
	fetchedAt: string;
}

export interface Quake {
	provider: 'bmkg' | 'usgs';
	magnitude: number | null;
	depthKm: number | null;
	lat: number | null;
	lon: number | null;
	region: string | null;
	time: string | null;
	tsunamiPotential: string | null;
}

// SET-4/5/6: toggle platform dari halaman Pengaturan dashboard.
export interface PlatformSettings {
	signupOpen: boolean;
	publicMapTrips: boolean;
	maintenanceMode: boolean;
	// SET-2: notif pengajuan verifikasi organizer ke staf dashboard.
	notifVerify: boolean;
	// SET-3: notif check-in peserta ke leader trip.
	notifCheckin: boolean;
	// Matriks notifikasi Brevo: per event x per channel.
	// SOS hanya SMS + WhatsApp (Wella 1 Nov 2026); notifSosEmail
	// dipertahankan di tipe/API demi kompatibilitas tapi tidak
	// dirender dan tidak dipakai pengiriman SOS.
	notifRegistEmail: boolean;
	notifRegistWhatsapp: boolean;
	notifRegistSms: boolean;
	notifSosEmail: boolean;
	notifSosWhatsapp: boolean;
	notifSosSms: boolean;
	// Kanal OTP register/login yang dipilih admin (Wella 1 Nov 2026).
	otpEmail: boolean;
	otpSms: boolean;
	otpWhatsapp: boolean;
	notifVerifyEmail: boolean;
	notifVerifyWhatsapp: boolean;
	notifVerifySms: boolean;
	notifCheckinEmail: boolean;
	notifCheckinWhatsapp: boolean;
	notifCheckinSms: boolean;
	// Setting Brevo dari dashboard (bukan rahasia); kosong = env VPS.
	brevoSenderEmail: string;
	brevoSmsSender: string;
	brevoWhatsappSenderNumber: string;
	brevoWhatsappTemplateId: string;
	// Keamanan & Batas tersimpan (Wella 1 Nov 2026). Baris verifikasi
	// manual Cartensz & Kerinci dihapus atas koreksi Wella.
	// Batas kuota default dashboard (bukan prefill 10 form mobile SET-8).
	defaultQuota: number;
	currency: string;
	timezone: string;
	// URL QRIS Pro aktif ("" = belum diunggah).
	proQrisUrl: string;
	// Modul AI (Wella 2 Nov 2026): kill-switch per modul, default nyala.
	// Penegakan di API (ai-modules.ts); kartu ini hanya toggle-nya.
	aiV: boolean;
	aiP: boolean;
	aiL: boolean;
	aiQ: boolean;
	aiR: boolean;
	aiG: boolean;
	// Penyedia WhatsApp (Wella 3 Nov 2026): "official" (Meta Cloud
	// API, default) atau "dikontak" (Dikontak WABA Shared). Menentukan
	// jalur SEMUA pengiriman WA OTP + SOS; kanal notifikasi Brevo
	// tidak ikut setting ini.
	whatsappProvider: 'official' | 'dikontak';
}
