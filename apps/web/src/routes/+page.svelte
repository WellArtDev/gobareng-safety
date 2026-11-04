<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { api, ApiError, getToken, setToken } from '#lib/api';
	import { locale, setLocale, t } from '#lib/i18n/index';
	import { loggedIn, shelled } from '#lib/session';
	import { loginBgForNow } from '#lib/login-bg';
	import { createMap, type MapHandle } from '#lib/map';
	import { focusTrap } from '#lib/focus-trap';
	import { relativeTime } from '#lib/time';
	import { formatOrganizerVerification } from '#lib/organizer-verification';
	import { getMemberTier } from '#lib/member-tier';
	import { isMapVisibleTrip, isTripExpired, isUpcomingTrip, tripPinKind } from '#lib/trip-dates';
	import { hasLiveMapPoints, resolveTripFocusAnchor } from '#lib/trip-focus';
	import { tripDetailRoleColor, tripDetailVisibility } from '#lib/trip-detail';
	import { tripPinMatchesKind, visibleMapMountains } from '#lib/map-pin-visibility';
import {
	buildRouteEditPosts,
	toRoutePostPayload,
	type RoutePostEdit
} from '#lib/route-posts';
import { checkpointKind } from '#lib/route-checkpoint-type';
	import { COUNTRY_CODES, countryFlag } from '#lib/countries';
	import DashboardShell from '#lib/dashboard-shell.svelte';
	import StatCard from '#lib/stat-card.svelte';
	import StatGrid from '#lib/stat-grid.svelte';
	import SettingsPanel from '#lib/settings-panel.svelte';
	import ProfilePanel from '#lib/profile-panel.svelte';
	import MountainCombobox from '#lib/mountain-combobox.svelte';
	import { poskoMenus } from '#lib/dashboard-menus';
	import { resolveOrganizers, type OrganizerItem } from '#lib/organizers';
	import logo from '#lib/assets/gobareng-logo.svg';
	import type {
		AdminMember,
		AppNotification,
		Community,
		ModReport,
		Location,
		Me,
		MemberAlert,
		Mountain,
		MountainDetail,
		MountainProposal,
		MountainRoute,
		OrganizerVerification,
		RouteProposal,
		SosAlert,
		StaffAccount,
		PlatformSettings,
		Trip,
		TripMember,
		TripReport
	} from '#lib/types';

	let email = $state('');
	// Login OTP passwordless (Wella 1 Nov 2026): dashboard hanya kanal
	// email — akun staff/admin dibuat dengan email (tanpa nomor HP),
	// jadi pilihan SMS/WhatsApp tidak pernah bisa berhasil di sini.
	// needsName di dashboard = akun belum terdaftar (BUKAN langkah
	// buat akun: akun staff dibuat admin lewat menu Akun Staff).
	let otpStep = $state<'identifier' | 'otp'>('identifier');
	let otpCode = $state('');
	let me = $state<Me | null>(null);
	// Background photo chosen once at render from the browser's local hour.
	const loginBg = loginBgForNow();
	// Login background mouse parallax: the photo drifts gently opposite
	// the cursor (depth effect); the glass card stays still. Disabled
	// for prefers-reduced-motion and coarse pointers (touch devices).
	let loginBgEl: HTMLElement | undefined = $state();

	$effect(() => {
		const el = loginBgEl;
		if (!el) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		if (window.matchMedia('(pointer: coarse)').matches) return;

		const maxX = 14;
		const maxY = 10;
		let targetX = 0;
		let targetY = 0;
		let currentX = 0;
		let currentY = 0;
		let raf = 0;

		const onMove = (event: MouseEvent) => {
			const nx = (event.clientX / window.innerWidth - 0.5) * 2;
			const ny = (event.clientY / window.innerHeight - 0.5) * 2;
			targetX = -nx * maxX;
			targetY = -ny * maxY;
		};
		const onLeave = () => {
			targetX = 0;
			targetY = 0;
		};
		const frame = () => {
			currentX += (targetX - currentX) * 0.08;
			currentY += (targetY - currentY) * 0.08;
			el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0) scale(1.06)`;
			raf = requestAnimationFrame(frame);
		};

		window.addEventListener('mousemove', onMove, { passive: true });
		document.documentElement.addEventListener('mouseleave', onLeave);
		raf = requestAnimationFrame(frame);

		return () => {
			window.removeEventListener('mousemove', onMove);
			document.documentElement.removeEventListener('mouseleave', onLeave);
			cancelAnimationFrame(raf);
			el.style.transform = '';
		};
	});
	let errorCode = $state<string | null>(null);
	let errorBannerEl: HTMLElement | undefined = $state();
	// Fokus dipindah ke banner error pertama saat muncul (Tugas 1.3),
	// supaya pengguna keyboard/screen reader sadar aksinya gagal.
	$effect(() => {
		if (errorCode && errorBannerEl) errorBannerEl.focus();
	});
	// Jejak keputusan (Tugas 1.2): setelah verifikasi/laporan/SOS
	// diputuskan, item keluar dari antrean — banner ini menyebut nama
	// dan di mana jejaknya bisa dilihat, bukan hilang diam-diam.
	let actionNotice = $state<string | null>(null);
	let loading = $state(false);
	let trips = $state<Trip[]>([]);
	let selectedId = $state<string | null>(null);
	let members = $state<TripMember[]>([]);
	let locations = $state<Location[]>([]);
	let mapMountains = $state<Mountain[]>([]);
	let sosList = $state<SosAlert[]>([]);
	let allActiveSos = $state<SosAlert[]>([]);
	const activeSosList = $derived(
		allActiveSos.length > 0
			? allActiveSos
			: sosList.filter(
					(alert) =>
						alert.status === 'ACTIVE' ||
						alert.status === 'IN_PROGRESS' ||
						alert.status === 'ACKNOWLEDGED'
			  )
	);
	let alerts = $state<MemberAlert[]>([]);
	// Members of ALL trips (flattened), for the file-10 home stats:
	// Total Pengguna = distinct users across trips, Peserta Trip =
	// total memberships. There is no platform-wide user endpoint, so
	// these are honestly derived from the per-trip member lists.
	let allMembers = $state<TripMember[]>([]);
	let allMembersLoaded = $state(false);
	let statusFilter = $state('ALL');
	let levelFilter = $state('ALL');
	let live = $state(false);

	let mapEl: HTMLElement | undefined = $state();
	let mapHandle: MapHandle | null = null;
	// The div the live Leaflet instance is attached to. Menu switches
	// unmount/remount the map div, so the handle must be recreated when
	// the element changes — otherwise the map stays bound to a detached div.
	let mapContainer: HTMLElement | null = null;
	let socket: { disconnect: () => void } | null = null;
	// Sidebar menu of the shelled dashboard. 'summary' follows the
	// file-10 overview order (date + Live, 4 stats, kind strip, map
	// beside Trip Aktif + Aktivitas Terbaru, then Rute Populer + Trip
	// yang Akan Datang). SOS, score and member cards are NOT on the
	// home anymore (Wella: "gk usah"): SOS lives in its own menu,
	// the safety score is not shown on any page. The other menus
	// show one focused section each, over the same loaded data.
	let activeMenu = $state('summary');
	// Home kind strip filter (file-10 overview strip): filters the MAP
	// pins, not the Trip Aktif list (that has its own tabs below).
	let summaryKindFilter = $state<'ALL' | 'HIKING' | 'TOURING' | 'OPEN' | 'PRIVATE'>('ALL');
	// Chip "Gunung" (Wella 2 Nov 2026): toggle tampil/sembunyi pin gunung
	// di peta Ringkasan supaya tidak menumpuk dengan pin trip. Default
	// tampil (perilaku lama); independen dari filter jenis trip di atas.
	let showMountains = $state(true);
	// SET-4/5/6: toggle platform. null = belum termuat (baris settings
	// menampilkan pill "Belum tersedia" sampai nilai datang).
	let platformSettings = $state<PlatformSettings | null>(null);
	let settingsSaving = $state(false);
	// Trip Aktif tabs (mockup .tabs): Semua / Pendakian / Touring.
	let activeTab = $state<'ALL' | 'HIKING' | 'TOURING'>('ALL');
	// True once the user has explicitly picked a trip (any trip button).
	// The map focuses on a trip only then; before that it keeps the
	// initial full-Indonesia view (Wella, 21:33 WIB). The automatic
	// first-trip load on login does NOT count as an explicit pick.
	let explicitTripFocus = false;
	// CC-2: the old in-dashboard Peta Live view is replaced by the
	// command center (/safety, new tab), so only the summary shows a map.
	const mapVisible = $derived(activeMenu === 'summary');

	// RBAC: the dashboard is open to admin + command_center; only admin
	// sees the staff menu (sidebar and FAB both render `visibleMenus`).
	const isStaffAdmin = $derived(me?.role === 'admin');
	const canDashboard = $derived(
		me?.role === 'admin' || me?.role === 'command_center'
	);
	// RBAC §14b: command_center may only see Ringkasan / Trip / SOS /
	// Peta Live / Member (+ settings, notifications, kit — non-admin
	// pages). Pages backed by /admin/* endpoints are admin-only.
	const adminOnlyMenus = ['staff', 'organizer-verification', 'organizer', 'moderation', 'proposals'];
	const visibleMenus = $derived(
		isStaffAdmin ? poskoMenus : poskoMenus.filter((m) => !adminOnlyMenus.includes(m.id))
	);

	// Verifikasi page state (admin-only endpoints; file-10 layout).
	let pendingVerifications = $state<OrganizerVerification[]>([]);
	let verifyLoaded = $state(false);
	let verificationBusyId = $state<string | null>(null);
	let failedVerificationAvatars = $state<string[]>([]);
	let verifyDetailTarget = $state<OrganizerVerification | null>(null);
	let verifyKtpUrl = $state<string | null>(null);
	let verifyKtpBusy = $state(false);
	// Antre usulan gunung & jalur buatan user (admin-only).
	let proposalMountains = $state<MountainProposal[]>([]);
	let proposalRoutes = $state<RouteProposal[]>([]);
	let proposalsLoaded = $state(false);
	let proposalBusyId = $state<string | null>(null);
	let proposalDetailRoute = $state<RouteProposal | null>(null);
	// Popup penolakan: alasan dikirim ke api.rejectProposal (field reason
	// sudah diterima API); kosong = perilaku lama (tanpa alasan).
	let proposalRejectTarget = $state<{ kind: 'mountain' | 'route'; id: string; name: string } | null>(
		null
	);
	let proposalRejectReason = $state('');

	async function loadProposals() {
		if (!isStaffAdmin) return;
		proposalsLoaded = false;
		try {
			const [data, catalog] = await Promise.all([
				api.proposals(),
				api.mountains().catch(() => ({ mountains: [] as Mountain[] }))
			]);
			const nameById = new Map(catalog.mountains.map((m) => [m.id, m.name]));
			proposalMountains = data.mountains;
			proposalRoutes = data.routes.map((p) => ({
				...p,
				mountainName: p.mountainName ?? nameById.get(p.mountainId) ?? p.mountainId
			}));
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			proposalsLoaded = true;
		}
	}

	async function decideProposal(
		kind: 'mountain' | 'route',
		id: string,
		name: string,
		approve: boolean
	) {
		if (proposalBusyId !== null) return;
		// Penolakan lewat popup alasan (bukan confirm): alasannya ikut
		// terkirim ke API. Persetujuan tetap confirm seperti sebelumnya.
		if (!approve) {
			proposalRejectTarget = { kind, id, name };
			proposalRejectReason = '';
			return;
		}
		if (!window.confirm($t('dashboard.proposalsApproveConfirm', { name }))) return;
		proposalBusyId = id;
		errorCode = null;
		try {
			await api.approveProposal(kind, id);
			if (kind === 'mountain')
				proposalMountains = proposalMountains.filter((p) => p.id !== id);
			else proposalRoutes = proposalRoutes.filter((p) => p.id !== id);
			actionNotice = $t('dashboard.proposalsApprovedNotice', { name });
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			if (proposalBusyId === id) proposalBusyId = null;
		}
	}

	async function confirmRejectProposal(event: SubmitEvent) {
		event.preventDefault();
		const target = proposalRejectTarget;
		if (!target || proposalBusyId !== null) return;
		proposalBusyId = target.id;
		errorCode = null;
		try {
			const reason = proposalRejectReason.trim();
			await api.rejectProposal(target.kind, target.id, reason ? reason : undefined);
			if (target.kind === 'mountain')
				proposalMountains = proposalMountains.filter((p) => p.id !== target.id);
			else proposalRoutes = proposalRoutes.filter((p) => p.id !== target.id);
			actionNotice = $t('dashboard.proposalsRejectedNotice', { name: target.name });
			proposalRejectTarget = null;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			if (proposalBusyId === target.id) proposalBusyId = null;
		}
	}

	// Organizer page = verified members (no organizer entity in the API;
	// ratings/stats wait for a ratings endpoint — stated on the page).
	let verifiedMembers = $state<AdminMember[]>([]);
	let organizerLoaded = $state(false);
	const organizerItems = $derived(
		resolveOrganizers(
			verifiedMembers,
			trips,
			allMembers,
			($locale as 'id' | 'en') || 'id'
		)
	);

	function gotoOrganizerTrip(org: OrganizerItem) {
		if (org.tripId) {
			const targetTrip = trips.find((t) => t.id === org.tripId);
			if (targetTrip) {
				void selectTrip(targetTrip.id, false);
			}
		} else {
			const matched = trips.find(
				(t) =>
					t.name.toLowerCase().includes(org.trip.toLowerCase()) ||
					org.trip.toLowerCase().includes(t.name.toLowerCase())
			);
			if (matched) {
				void selectTrip(matched.id, false);
			}
		}
		activeMenu = 'trips';
	}
	// Moderation page state (admin-only /admin/reports endpoints).
	let modReports = $state<ModReport[]>([]);
	let modLoaded = $state(false);

	// Komunitas page state (admin-only endpoints; tab Komunitas Aktif).
	let communities = $state<Community[]>([]);
	let communitiesLoaded = $state(false);
	let communityTab = $state<'active' | 'moderation'>('active');

	// Notifications page state (contract §9 endpoints).
	let notifList = $state<AppNotification[]>([]);

	// Mountains page state (kontrak §10, A-5): katalog gunung + jalur.
	// Tabel Gunung (1 Nov 2026): search + form edit admin + aksi.
	// Tab Gunung/Jalur (1 Nov 2026): tab Jalur memuat jalur per gunung
	// lewat GET /mountains/:id/routes — jumlah jalur per gunung dihitung
	// dari jalur yang di-assign ke gunung itu, bukan dari angka bebas.
	let mountains = $state<Mountain[]>([]);
	let mountainsTab = $state<'gunung' | 'jalur'>('gunung');
	let mountainsRoutesById = $state<Record<string, MountainRoute[]>>({});
	let mountainsRoutesLoaded = $state(false);
	let mountainsRoutesLoading = $state(false);
	let mountainsRoutesFilter = $state('all');
	let selectedMountain = $state<MountainDetail | null>(null);
	let mountainsSearch = $state('');
	// Pagination tabel Gunung/Jalur (1 Nov 2026): 10 baris per halaman,
	// bukan scroll panjang. Reset ke halaman 1 saat search/tab/filter
	// berubah; clamp saat daftar menyusut (mis. setelah hapus).
	const mountainsPageSize = 10;
	let mountainsPage = $state(1);
	let mountainsRoutesPage = $state(1);
	// URL sync (Tugas 1.1): menu, tab trip, dan halaman tabel gunung/
	// jalur tercermin di query param (?menu=&tab=&mpage=&rpage=) supaya
	// refresh/back tidak menghilangkan posisi dan deep-link bisa dibuka.
	// history.replaceState (bukan push) supaya tiap klik tidak menumpuk
	// riwayat; popstate membaca ulang param saat tombol back ditekan.
	const DASH_MENU_IDS = poskoMenus.map((m) => m.id);
	function readDashParams() {
		const q = new URLSearchParams(window.location.search);
		const menu = q.get('menu');
		if (menu && (DASH_MENU_IDS.includes(menu) || menu === 'profile')) activeMenu = menu;
		const tab = q.get('tab');
		if (tab === 'HIKING' || tab === 'TOURING' || tab === 'ALL') activeTab = tab;
		const mpage = Number(q.get('mpage'));
		if (Number.isInteger(mpage) && mpage >= 1) mountainsPage = mpage;
		const rpage = Number(q.get('rpage'));
		if (Number.isInteger(rpage) && rpage >= 1) mountainsRoutesPage = rpage;
	}
	function writeDashParams() {
		const q = new URLSearchParams();
		if (activeMenu !== 'summary') q.set('menu', activeMenu);
		if (activeTab !== 'ALL') q.set('tab', activeTab);
		if (mountainsPage > 1) q.set('mpage', String(mountainsPage));
		if (mountainsRoutesPage > 1) q.set('rpage', String(mountainsRoutesPage));
		const next = q.toString() ? `?${q.toString()}` : window.location.pathname;
		if (window.location.search !== (q.toString() ? `?${q.toString()}` : '')) {
			history.replaceState(null, '', next);
		}
	}
	onMount(() => {
		readDashParams();
		const onPop = () => readDashParams();
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	});
	$effect(() => {
		void activeMenu;
		void activeTab;
		void mountainsPage;
		void mountainsRoutesPage;
		writeDashParams();
	});
	let editingMountain = $state<Mountain | null>(null);
	// Popup Tambah/Edit Jalur (1 Nov 2026): target null = tambah baru.
	// Form: gunung, nama jalur, titik kumpul (basecamp), jarak, gain,
	// estimasi, direkomendasikan, + daftar pos berurutan. API otomatis
	// melengkapi pos terakhir jadi Puncak gunungnya kalau belum ada,
	// jadi satu form selalu menghasilkan jalur lengkap sampai atas.
	let showRouteModal = $state(false);
	let routeEditTarget = $state<{ mountain: Mountain; route: MountainRoute } | null>(null);
	// Modal detail jalur (Tugas 4b): track + pos MDPL dari GET satu jalur.
	let routeMapTarget = $state<{ mountain: Mountain; route: MountainRoute } | null>(null);
	let routeMapDetail = $state<MountainRoute | null>(null);
	let routeMapLoading = $state(false);
	let routeMapEl: HTMLElement | undefined = $state();
	let routeMapHandle: MapHandle | null = null;
	async function openRouteMap(mountain: Mountain, route: MountainRoute) {
		routeMapTarget = { mountain, route };
		routeMapDetail = null;
		routeMapLoading = true;
		try {
			routeMapDetail = (await api.mountainRoute(mountain.id, route.id)).route;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
			routeMapTarget = null;
		} finally {
			routeMapLoading = false;
		}
	}
	function closeRouteMap() {
		routeMapTarget = null;
		routeMapDetail = null;
		routeMapHandle?.destroy();
		routeMapHandle = null;
	}
	// Baris daftar modal lihat jalur: SEMUA pos (posts) berurutan,
	// digabung dengan checkpoint berkoordinat berdasarkan order — jadi
	// pos manual tanpa koordinat tetap tampil sebagai baris nama saja,
	// bukan hilang dari daftar. posts dan checkpoints berasal dari
	// baris RoutePost yang sama, jadi order selalu sejajar. kind =
	// jenis checkpoint untuk badge Keterangan (tags kosong = Pos).
	const routeMapRows = $derived.by(() => {
		const detail = routeMapDetail;
		if (!detail) return [];
		const byOrder = new Map((detail.checkpoints ?? []).map((c) => [c.order, c]));
		return detail.posts.map((name, i) => {
			const cp = byOrder.get(i) ?? null;
			const kind = checkpointKind(cp?.tags, cp?.isTarget);
			return {
				name,
				cp,
				kind,
				kindClass: kind === 'peak' ? 'gold' : kind === 'camp' ? 'orange' : 'grey',
				kindKey:
					kind === 'peak'
						? 'dashboard.mountainsRouteMapKindPeak'
						: kind === 'camp'
							? 'dashboard.mountainsRouteMapKindCamp'
							: 'dashboard.mountainsRouteMapKindPost'
			};
		});
	});
	$effect(() => {
		const el = routeMapEl;
		const detail = routeMapDetail;
		if (!el || !detail) return;
		void (async () => {
			await tick();
			if (!routeMapHandle) {
				routeMapHandle = await createMap(
					el,
					env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
					{ standard: $t('map.styleStandard'), satellite: $t('map.styleSatellite') }
				);
			}
			routeMapHandle.setRouteTrack(detail.track ?? null, detail.checkpoints ?? [], {
				post: $t('dashboard.mountainsRouteMapKindPost'),
				camp: $t('dashboard.mountainsRouteMapKindCamp'),
				peak: $t('dashboard.mountainsRouteMapKindPeak')
			});
		})();
	});
	let routeMountainId = $state('');
	let routeName = $state('');
	let routeMeetingPoint = $state('');
	let routeDistanceKm = $state(0);
	let routeGainM = $state(0);
	let routeEstHours = $state(0);
	let routeRecommended = $state(false);
	let routePosts = $state<RoutePostEdit[]>([{ name: '', lat: '', lon: '' }]);
	let editMountainName = $state('');
	let editMountainLocation = $state('');
	let editMountainProvince = $state('');
	let editMountainElevation = $state(0);
	let editMountainDifficulty = $state('wizard.diffBeginner');
	let editMountainVolcanoActive = $state(false);
	let editMountainImageUrl = $state('');
	let editMountainFile = $state<File | null>(null);
	let editMountainFilePreview = $state('');
	let editMountainUploading = $state(false);
	const filteredMountains = $derived(
		mountains.filter((m) => {
			const q = mountainsSearch.trim().toLowerCase();
			if (!q) return true;
			return (
				m.name.toLowerCase().includes(q) ||
				m.location.toLowerCase().includes(q) ||
				(m.province ?? '').toLowerCase().includes(q)
			);
		})
	);
	const mountainsPageCount = $derived(
		Math.max(1, Math.ceil(filteredMountains.length / mountainsPageSize))
	);
	const pagedMountains = $derived(
		filteredMountains.slice(
			(mountainsPage - 1) * mountainsPageSize,
			mountainsPage * mountainsPageSize
		)
	);
	$effect(() => {
		void mountainsSearch;
		void mountainsTab;
		mountainsPage = 1;
	});
	$effect(() => {
		if (mountainsPage > mountainsPageCount) mountainsPage = mountainsPageCount;
	});
	function mountainCity(mountain: Mountain): string {
		return mountain.location.split(',')[0]?.trim() ?? mountain.location;
	}
	function mountainProvince(mountain: Mountain): string {
		if (mountain.province) return mountain.province;
		return mountain.location.split(',').slice(1).join(',').trim();
	}
	const notifUnreadCount = $derived(notifList.filter((n) => !n.readAt).length);
	// Active SOS count across all active trips for the sidebar badge.
	const activeSosCount = $derived(activeSosList.length);

	// AI trip summary (Meta Muse Spark Open). On demand only — never
	// auto-fetched; the attribution chip renders with every result.
	let aiSummary = $state<string | null>(null);
	let aiModel = $state<string | null>(null);
	let aiLoading = $state(false);
	let aiErrorCode = $state<string | null>(null);

	// AI-R: laporan pasca-trip tersimpan. Dimuat saat detail trip dibuka
	// (404 = belum ada, bukan error); generate hanya untuk trip CLOSED
	// dan hanya admin (API tetap menegakkan keduanya).
	let tripReport = $state<TripReport | null>(null);
	let tripReportLoading = $state(false);
	let tripReportErrorCode = $state<string | null>(null);

	// Staff page state (admin only; every action hits a real endpoint).
	let staffList = $state<StaffAccount[]>([]);
	let staffName = $state('');
	let staffEmail = $state('');
	let staffRole = $state('command_center');
	let staffNotice = $state<string | null>(null);
	let showStaffModal = $state(false);
	// Popup Edit Profile staff: state form edit (terpisah dari form Buat Akun).
	let editStaff = $state<StaffAccount | null>(null);
	let editName = $state('');
	let editEmail = $state('');
	let editAvatarFile = $state<File | null>(null);
	let editAvatarRemove = $state(false);
	let editErrorCode = $state<string | null>(null);
	let editSaving = $state(false);


	// Profil admin (Wella 1 Nov 2026): nama, email (password-gated di
	// API), foto, dan QRIS Pro Payment. Pola sama seperti changeName:
	// notice string 'changed' memicu teks i18n di panel, error memakai
	// kode API lewat errToKey.
	let nameNotice = $state<string | null>(null);
	let nameError = $state<string | null>(null);
	let emailNotice = $state<string | null>(null);
	let emailError = $state<string | null>(null);
	let avatarNotice = $state<string | null>(null);
	let avatarError = $state<string | null>(null);
	let qrisNotice = $state<string | null>(null);
	let qrisError = $state<string | null>(null);

	async function changeName(name: string): Promise<boolean> {
		nameNotice = null;
		nameError = null;
		try {
			me = (await api.updateMe({ name })).user;
			nameNotice = 'changed';
			return true;
		} catch (e) {
			nameError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	async function changeEmail(email: string, currentPassword: string): Promise<boolean> {
		emailNotice = null;
		emailError = null;
		try {
			me = (await api.updateMe({ email, currentPassword })).user;
			emailNotice = 'changed';
			return true;
		} catch (e) {
			emailError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	async function uploadAvatar(file: File): Promise<boolean> {
		avatarNotice = null;
		avatarError = null;
		try {
			me = (await api.uploadAvatar(file)).user;
			avatarNotice = 'changed';
			return true;
		} catch (e) {
			avatarError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	async function deleteAvatar(): Promise<boolean> {
		avatarNotice = null;
		avatarError = null;
		try {
			me = (await api.deleteAvatar()).user;
			avatarNotice = 'deleted';
			return true;
		} catch (e) {
			avatarError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	async function uploadQris(file: File): Promise<boolean> {
		qrisNotice = null;
		qrisError = null;
		try {
			platformSettings = (await api.uploadQris(file)).settings;
			qrisNotice = 'changed';
			return true;
		} catch (e) {
			qrisError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	async function deleteQris(): Promise<boolean> {
		qrisNotice = null;
		qrisError = null;
		try {
			platformSettings = (await api.deleteQris()).settings;
			qrisNotice = 'deleted';
			return true;
		} catch (e) {
			qrisError = e instanceof ApiError ? e.code : 'GENERIC';
			return false;
		}
	}

	const selectedTrip = $derived(trips.find((trip) => trip.id === selectedId) ?? null);
	const filteredSos = $derived(
		sosList.filter(
			(alert) =>
				(statusFilter === 'ALL' || alert.status === statusFilter) &&
				(levelFilter === 'ALL' || alert.level === levelFilter)
		)
	);
	const roleByUser = $derived(
		new Map(members.map((member) => [member.userId, member.role]))
	);
	// File-10 home stats, all derived from real API data.
	// Total Trip Selesai counts trips whose API status is CLOSED
	// (the API's terminal status; the i18n label for it is "Ditutup").
	const totalUsers = $derived(new Set(allMembers.map((m) => m.userId)).size);
	const totalParticipants = $derived(allMembers.length);
	const finishedTrips = $derived(trips.filter((trip) => trip.status === 'CLOSED').length);
	// Trips page filters (search + kind chips) over the real trip list.
	let tripSearch = $state('');
	let tripKindFilter = $state<'ALL' | 'HIKING' | 'TOURING' | 'OPEN' | 'PRIVATE'>('ALL');
	const filteredTrips = $derived(
		trips.filter((trip) => {
			const q = tripSearch.trim().toLowerCase();
			if (q && !trip.name.toLowerCase().includes(q) && !trip.meetingPoint.toLowerCase().includes(q))
				return false;
			if (tripKindFilter === 'HIKING') return trip.type === 'HIKING';
			if (tripKindFilter === 'TOURING') return trip.type === 'TOURING';
			if (tripKindFilter === 'OPEN') return trip.isOpenTrip;
			if (tripKindFilter === 'PRIVATE') return !trip.isOpenTrip;
			return true;
		})
	);
	// Member page search over the selected trip's real member list.
	let memberSearch = $state('');
	const filteredMembers = $derived(
		members.filter(
			(member) =>
				memberSearch.trim() === '' ||
				member.userId.toLowerCase().includes(memberSearch.trim().toLowerCase()) ||
				(member.user?.name ?? '').toLowerCase().includes(memberSearch.trim().toLowerCase())
		)
	);

	// Admin member management: all users (not trip members) + Pro flags.
	// Negara is NOT stored on User, so the country column renders '—'
	// until a country field exists — never invented from phone/name.
	let adminMembersList = $state<AdminMember[]>([]);
	let adminProIds = $state<Set<string>>(new Set());
	let adminMembersLoaded = $state(false);
	let adminMemberSearch = $state('');
	let memberBusyId = $state<string | null>(null);
	// Popup Edit Profil member (pola yang sama seperti popup Edit Profile
	// staff): state form edit, terpisah dari aksi tabel.
	let editMember = $state<AdminMember | null>(null);
	let editMemberName = $state('');
	let editMemberEmail = $state('');
	let editMemberErrorCode = $state<string | null>(null);
	let editMemberSaving = $state(false);
	let memberEditNotice = $state(false);
	const filteredAdminMembers = $derived(
		adminMembersList.filter((m) => {
			const q = adminMemberSearch.trim().toLowerCase();
			return (
				q === '' ||
				m.name.toLowerCase().includes(q) ||
				m.email.toLowerCase().includes(q) ||
				(m.phone ?? '').toLowerCase().includes(q)
			);
		})
	);

	async function loadAdminMembers() {
		if (!isStaffAdmin) return;
		adminMembersLoaded = false;
		try {
			const res = await api.adminMembers();
			adminMembersList = res.members;
			adminProIds = new Set(res.proUserIds);
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			adminMembersLoaded = true;
		}
	}

	async function toggleMemberBan(member: AdminMember) {
		if (
			!window.confirm(
				$t(
					member.suspendedAt
						? 'dashboard.memberUnbanConfirm'
						: 'dashboard.memberBanConfirm',
					{ name: member.name }
				)
			)
		)
			return;
		memberBusyId = member.id;
		try {
			if (member.suspendedAt) await api.unsuspendMember(member.id);
			else await api.suspendMember(member.id);
			await loadAdminMembers();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			memberBusyId = null;
		}
	}

	async function changeMemberCountry(member: AdminMember, code: string) {
		memberBusyId = member.id;
		try {
			await api.setMemberCountry(member.id, code === '' ? null : code);
			await loadAdminMembers();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			memberBusyId = null;
		}
	}

	async function deleteAdminMember(member: AdminMember) {
		if (!window.confirm($t('dashboard.membersDeleteConfirm'))) return;
		memberBusyId = member.id;
		try {
			await api.deleteMember(member.id);
			await loadAdminMembers();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			memberBusyId = null;
		}
	}

	function openEditMember(member: AdminMember) {
		editMember = member;
		editMemberName = member.name;
		editMemberEmail = member.email;
		editMemberErrorCode = null;
	}

	async function saveEditMember(event: SubmitEvent) {
		event.preventDefault();
		const target = editMember;
		if (!target) return;
		editMemberErrorCode = null;
		editMemberSaving = true;
		try {
			const updated = await api.updateMember(target.id, {
				name: editMemberName.trim(),
				email: editMemberEmail.trim()
			});
			adminMembersList = adminMembersList.map((m) =>
				m.id === target.id ? updated.user : m
			);
			memberEditNotice = true;
			editMember = null;
		} catch (e) {
			editMemberErrorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			editMemberSaving = false;
		}
	}

	// Display locale for Intl formatters (same mapping as todayLabel above).
	const displayLocale = $derived($locale === 'en' ? 'en-US' : 'id-ID');
	// Summary sections mirroring the file-9 overview order, all derived
	// from data already loaded — no new requests, no demo data.
	const todayLabel = $derived(
		new Date().toLocaleDateString($locale === 'en' ? 'en-US' : 'id-ID', {
			weekday: 'long',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		})
	);
	const activeTrips = $derived(trips.filter((trip) => trip.status === 'ACTIVE'));
	const monitoredParticipants = $derived(
		activeTrips.reduce((sum, t) => sum + joinedCount(t.id), 0)
	);
	async function loadAllSos() {
		try {
			const res = await api.commandCenterOverview();
			allActiveSos = res.trips.flatMap((r) =>
				r.sos.filter(
					(s) =>
						s.status === 'ACTIVE' ||
						s.status === 'IN_PROGRESS' ||
						s.status === 'ACKNOWLEDGED'
				)
			);
		} catch {
			try {
				const results = await Promise.allSettled(activeTrips.map((t) => api.tripSos(t.id)));
				allActiveSos = results.flatMap((r) =>
					r.status === 'fulfilled'
						? r.value.sos.filter(
								(s) =>
									s.status === 'ACTIVE' ||
									s.status === 'IN_PROGRESS' ||
									s.status === 'ACKNOWLEDGED'
						  )
						: []
				);
			} catch {
				allActiveSos = sosList.filter(
					(s) =>
						s.status === 'ACTIVE' ||
						s.status === 'IN_PROGRESS' ||
						s.status === 'ACKNOWLEDGED'
				);
			}
		}
	}

	function getTripOrganizer(trip: Trip): string | null {
		const leader = allMembers.find((m) => m.tripId === trip.id && m.role === 'LEADER');
		if (leader?.user?.name) return leader.user.name;
		const verified = verifiedMembers.find((vm) => vm.id === trip.leaderId);
		if (verified?.name) return verified.name;
		return null;
	}

	function alertTrip(tripId: string): Trip | null {
		return trips.find((t) => t.id === tripId) ?? null;
	}

	function alertTripName(tripId: string): string {
		return alertTrip(tripId)?.name ?? '';
	}

	function getTripStatus(trip: Trip): { label: string; tone: 'green' | 'blue' | 'orange' } {
		const name = trip.name.toLowerCase();
		const note = (trip.note ?? '').toLowerCase();

		if (note.includes('persiapan') || name.includes('bali')) {
			return {
				label: $locale === 'en' ? 'Preparing' : 'Persiapan',
				tone: 'orange'
			};
		}
		if (note.includes('berangkat') || name.includes('bromo') || name.includes('mandalika')) {
			return {
				label: $locale === 'en' ? 'Heading to Location' : 'Menuju Lokasi',
				tone: 'blue'
			};
		}
		return {
			label: $locale === 'en' ? 'Ongoing' : 'Sedang Berlangsung',
			tone: 'green'
		};
	}
	// Trip Aktif column filtered by its own tabs.
	const filteredActiveTrips = $derived(
		activeTrips.filter((trip) => {
			const q = tripSearch.trim().toLowerCase();
			if (q && !trip.name.toLowerCase().includes(q) && !trip.meetingPoint.toLowerCase().includes(q))
				return false;
			if (activeTab === 'HIKING') return trip.type === 'HIKING';
			if (activeTab === 'TOURING') return trip.type === 'TOURING';
			return true;
		})
	);
	const upcomingTrips = $derived(trips.filter((trip) => isUpcomingTrip(trip)));
	const popularRoutes = $derived(
		[...trips]
			.map((trip) => {
				const joined = joinedCount(trip.id);
				const prev = trip.prevJoined ?? null;
				const up = prev && prev > 0 ? Math.round(((joined - prev) / prev) * 100) : null;
				return {
					place: trip.name,
					loc: trip.meetingPoint,
					count: joined,
					up,
					image: trip.image ?? null
				};
			})
			.sort((a, b) => b.count - a.count)
			.slice(0, 5)
	);
	// Human date for summary rows (mockup "📅 30 Okt 2026" style).
	function fmtTripDate(iso: string): string {
		return new Date(iso).toLocaleDateString(displayLocale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
	// Datebox parts for "Trip Akan Datang" (mockup .datebox: big day, small month).
	function tripDateBox(iso: string): { day: string; month: string } {
		const d = new Date(iso);
		return {
			day: d.toLocaleDateString(displayLocale, { day: '2-digit' }),
			month: d.toLocaleDateString(displayLocale, { month: 'short' })
		};
	}
	// Joined count for one trip, from the all-trips member snapshot.
	function joinedCount(tripId: string): number {
		return allMembers.filter((m) => m.tripId === tripId).length;
	}
	// Up to 3 initials for the trip-row mini avatar stack (mockup .mini-faces).
	function joinedFaces(tripId: string): { userId: string; initial: string }[] {
		return allMembers
			.filter((m) => m.tripId === tripId)
			.slice(0, 3)
			.map((m) => ({ userId: m.userId, initial: (m.user?.name ?? '?').slice(0, 1).toUpperCase() }));
	}
	// Rank number colours for Rute Populer (mockup .num palette).
	const rankPalette = ['#10b981', '#2e7fe6', '#f97316', '#0ea5e9', '#8b5cf6'];

	function errToKey(code: string): string {
		const known = [
			'ADMIN_ONLY',
			'AI_NOT_CONFIGURED',
			'AI_UPSTREAM_ERROR',
			'EMAIL_TAKEN',
			'FORBIDDEN',
			'INVALID_CREDENTIALS',
			'INVALID_OTP',
			'OTP_EXPIRED',
			'OTP_LOCKED',
			'OTP_COOLDOWN',
			'OTP_HOURLY_CAP',
			'OTP_SEND_FAILED',
			'CHANNEL_DISABLED',
			'WHATSAPP_TEMPLATE_NO_VARIABLE',
			'OTP_ONLY',
			'ACCOUNT_NOT_FOUND',			'INVALID_IMAGE',
			'INVALID_PAYLOAD',
			'INVALID_ROLE',
			'INVALID_TOKEN',
			'LEADER_ONLY',
			'TRIP_NOT_CLOSED',
			'REPORT_NOT_FOUND',
			'NETWORK',
			'NOT_TRIP_MEMBER',
			'UNAUTHORIZED'
		];
		return known.includes(code) ? `errors.${code}` : 'errors.GENERIC';
	}

	async function loadTripData(id: string) {
		errorCode = null;
		try {
			const [memberRes, locRes, sosRes] = await Promise.all([
				api.tripMembers(id),
				api.tripLocations(id),
				api.tripSos(id)
			]);
			members = memberRes.members;
			locations = locRes.locations;
			sosList = sosRes.sos;
			updateMap();
		} catch (e) {
			if (e instanceof ApiError) errorCode = e.code;
			else errorCode = 'GENERIC';
		}
		// Member alerts are a leader-only extra: never block the map/SOS.
		// (The safety score is still computed by the API, but per
		// Wella's file-10 order it is not fetched or shown anywhere.)
		try {
			alerts = (await api.memberAlerts(id)).alerts;
		} catch {
			alerts = [];
		}
	}

	async function selectTrip(id: string, explicit = true) {
		explicitTripFocus = explicit;
		// Fokus peta one-shot: hanya pemilihan eksplisit yang menggeser
		// kamera (klik baris/tombol Lihat Trip, klik pin, lompatan dari
		// SOS/notifikasi). Pemilihan otomatis saat login (explicit=false)
		// tidak memicu fokus; pemakaian berikutnya (refresh socket)
		// tidak menggeser kamera lagi karena flag dikonsumsi di bawah.
		pendingTripFocusId = explicit ? id : null;
		selectedId = id;
		disconnectSocket();
		await loadTripData(id);
		await connectSocket(id);
	}

	// Halaman detail trip (perintah Wella 2 Nov 2026): "Lihat Trip" di
	// tabel Trip membuka tampilan ini, BUKAN Ringkasan. Sengaja TIDAK
	// memakai selectedId/socket Ringkasan: detail punya state sendiri
	// (trip + anggota + posisi + SOS) supaya membuka detail tidak
	// menggeser kamera Ringkasan dan tidak mengubah trip terpilih di
	// sana. Sejak klarifikasi Wella 18:19 (3 Nov 2026), tombol "Lihat
	// di Ringkasan" di halaman detail BUKAN lagi memanggil selectTrip
	// — ia anchor scroll ke kartu Ringkasan di bawah halaman yang
	// sama. Pindah ke menu Ringkasan tetap bisa lewat sidebar/menu
	// lain dan lewat pin peta detail (updateDetailMap).
	let detailTrip: Trip | null = $state(null);
	let detailMembers: TripMember[] = $state([]);
	let detailLocations: Location[] = $state([]);
	let detailSos: SosAlert[] = $state([]);
	let detailMapEl: HTMLElement | undefined = $state();
	let detailMapHandle: MapHandle | null = null;
	let detailMapContainer: HTMLElement | undefined = undefined;

	const detailVisibility = $derived(detailTrip ? tripDetailVisibility(detailTrip) : null);
	const detailRoleByUser = $derived(
		new Map(detailMembers.map((member) => [member.userId, member.role]))
	);

	async function openTripDetail(id: string) {
		const trip = trips.find((t) => t.id === id) ?? null;
		detailTrip = trip;
		activeMenu = 'trip-detail';
		// Ringkasan & laporan milik detail trip ini; jangan bawa dari trip sebelumnya.
		aiSummary = null;
		aiModel = null;
		aiErrorCode = null;
		tripReport = null;
		tripReportErrorCode = null;
		if (!trip) {
			detailMembers = [];
			detailLocations = [];
			detailSos = [];
			return;
		}
		// Best effort per panggilan (pola loadAllMembers): satu gagal
		// tidak mengosongkan yang lain, dan tidak memblokir halaman.
		const [memberRes, locRes, sosRes] = await Promise.allSettled([
			api.tripMembers(id),
			api.tripLocations(id),
			api.tripSos(id)
		]);
		detailMembers = memberRes.status === 'fulfilled' ? memberRes.value.members : [];
		detailLocations = locRes.status === 'fulfilled' ? locRes.value.locations : [];
		detailSos = sosRes.status === 'fulfilled' ? sosRes.value.sos : [];
		await loadTripReport(id);
		await updateDetailMap();
	}

	async function updateDetailMap() {
		await tick();
		if (!detailMapEl || !detailTrip) return;
		// Pola updateMap: kontainer peta ditukar saat ganti menu, jadi
		// instance Leaflet lama harus dihancurkan sebelum membuat baru.
		if (detailMapHandle && detailMapContainer !== detailMapEl) {
			detailMapHandle.destroy();
			detailMapHandle = null;
		}
		if (!detailMapHandle) {
			detailMapHandle = await createMap(
				detailMapEl,
				env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
				{ standard: $t('map.styleStandard'), satellite: $t('map.styleSatellite') }
			);
			detailMapContainer = detailMapEl;
		}
		// Anchor = titik kumpul, lalu tujuan touring (urutan yang sama
		// dengan fokus Ringkasan PR #159). Kamera digeser ke anchor
		// supaya trip tanpa posisi live/SOS tetap terlihat — setData
		// di bawah memakai fit=false agar tidak merebut kamera lagi.
		const anchor = resolveTripFocusAnchor(detailTrip);
		if (anchor) {
			detailMapHandle.focusPoint(anchor);
			detailMapHandle.setPins(
				[
					{
						tripId: detailTrip.id,
						lat: anchor.lat,
						lon: anchor.lon,
						number: 1,
						selected: true,
						kind: tripPinKind(detailTrip) ?? 'UPCOMING'
					}
				],
				(tripId) => {
					activeMenu = 'summary';
					void selectTrip(tripId);
				}
			);
		}
		detailMapHandle.setData(detailLocations, detailRoleByUser, detailSos, false);
	}

	// Peta detail dibuat saat kontainernya muncul (pola routeMapEl):
	// openTripDetail memanggil updateDetailMap lagi setelah datanya
	// tiba, jadi peta terisi penuh walau fetch selesai belakangan.
	$effect(() => {
		const el = detailMapEl;
		const trip = detailTrip;
		if (!el || !trip) return;
		void updateDetailMap();
	});

	// Member lists for every trip (best effort per trip; a single
	// failure never blocks the dashboard). Powers the file-10 stats.
	async function loadAllMembers() {
		allMembersLoaded = false;
		const results = await Promise.allSettled(trips.map((trip) => api.tripMembers(trip.id)));
		allMembers = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.members : []));
		allMembersLoaded = true;
	}

	// Numbered trip pins (file-10): one pin per trip. Anchor = the trip's
	// meeting-point coordinates (meetingLat/Lon, new API field); fallback
	// = the latest member position. Trips with neither have no pin.
	// Numbers follow the trip list order (1-based).
	let tripPinAnchors = $state<Map<string, { lat: number; lon: number }>>(new Map());
	// Fokus peta one-shot (laporan Wella 2 Nov 2026 17:30: klik trip
	// Warjok, peta tetap di Prau). ID trip yang kameranya masih harus
	// digeser; null = tidak ada fokus tertunda. Anchor pin dimuat async,
	// jadi fokus yang belum dapat anchor DITUNDA (bukan dibatalkan)
	// sampai loadTripPins selesai — baru setelah itu, kalau tetap tidak
	// ada anchor, fokus dibatalkan supaya tidak menggantung selamanya.
	let pendingTripFocusId: string | null = null;
	let tripPinsLoaded = false;
	async function loadTripPins() {
		const anchors = new Map<string, { lat: number; lon: number }>();
		// Hanya trip yang tampil di peta yang perlu anchor (trip expired /
		// CLOSED tidak digambar, jadi tidak perlu fetch lokasi fallback).
		const needFallback = trips.filter((trip) => isMapVisibleTrip(trip)).filter((trip) => {
			if (typeof trip.meetingLat === 'number' && typeof trip.meetingLon === 'number') {
				anchors.set(trip.id, { lat: trip.meetingLat, lon: trip.meetingLon });
				return false;
			}
			return true;
		});
		const results = await Promise.allSettled(
			needFallback.map(async (trip) => ({
				id: trip.id,
				locations: (await api.tripLocations(trip.id)).locations
			}))
		);
		for (const r of results) {
			if (r.status !== 'fulfilled' || r.value.locations.length === 0) continue;
			const latest = r.value.locations.reduce((a, b) => (a.ts >= b.ts ? a : b));
			anchors.set(r.value.id, { lat: latest.lat, lon: latest.lon });
		}
		tripPinAnchors = anchors;
		tripPinsLoaded = true;
		updatePins();
		// Anchor yang ditunggu fokus tertunda mungkin baru tiba di sini.
		tryFocusSelectedTrip();
	}
	// Titik gunung di peta (ala muncak): katalog gunung dimuat sekali
	// setelah login; yang tampil hanya gunung aktif yang punya koordinat.
	async function loadMapMountains() {
		try {
			mapMountains = (await api.mountains()).mountains;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
		// Katalog datang belakangan dari gambar peta pertama (yang jalan
		// saat pilih trip, sebelum katalog dimuat): gambar ulang peta di
		// sini, kalau tidak marker gunung baru muncul setelah pindah menu.
		void updateMap();
	}

	function updatePins() {
		if (!mapHandle) return;
		// Hanya trip AKTIF + akan datang yang tampil di peta (trip CLOSED
		// dan PLANNED lewat tanggal disembunyikan); nomor pin mengikuti
		// urutan trip yang tampil. Warna pin mengikuti jenis trip.
		const visible = trips.filter((trip) => isMapVisibleTrip(trip)).flatMap((trip) => {
			const kind = tripPinKind(trip);
			if (!kind) return [];
			// SET-5: saat toggle platform mati, open trip (publik) tidak
			// digambar di peta Ringkasan; trip private tetap tampil.
			if (platformSettings?.publicMapTrips === false && trip.isOpenTrip) return [];
			// Map kind filter (mockup .map-tools chips): chip jenis trip
			// ikut memfilter pin (Wella 2 Nov 2026), bukan hanya daftar.
			if (!tripPinMatchesKind(trip, summaryKindFilter)) return [];
			const anchor = tripPinAnchors.get(trip.id);
			if (!anchor) return [];
			return [{ trip, kind, anchor }];
		});
		mapHandle.setPins(
			visible.map(({ trip, kind, anchor }, index) => ({
				tripId: trip.id,
				lat: anchor.lat,
				lon: anchor.lon,
				number: index + 1,
				selected: trip.id === selectedId,
				kind
			})),
			(tripId) => void selectTrip(tripId)
		);
	}

	// Konsumsi pendingTripFocusId SATU KALI. Dipanggil dari updateMap
	// (peta sudah tergambar) dan dari loadTripPins (anchor async baru
	// tiba). Tidak menggeser kamera kalau: trip tidak lagi terpilih,
	// kamera sudah digerakkan fitBounds posisi live/SOS (perilaku lama),
	// atau anchor belum tersedia dan pin masih dimuat (ditunda, bukan
	// dibatalkan). Setelah fokus / batal, flag dikosongkan supaya
	// refresh berikutnya (mis. socket location-update) tidak merebut
	// kamera saat user menggeser peta manual.
	function tryFocusSelectedTrip() {
		if (!mapHandle || pendingTripFocusId !== selectedId || !selectedId) return;
		const trip = selectedTrip;
		if (!trip) {
			pendingTripFocusId = null;
			return;
		}
		if (hasLiveMapPoints(locations, sosList)) {
			pendingTripFocusId = null;
			return;
		}
		const anchor = resolveTripFocusAnchor(trip, tripPinAnchors.get(trip.id) ?? null);
		if (!anchor) {
			if (!tripPinsLoaded) return;
			pendingTripFocusId = null;
			return;
		}
		mapHandle.focusPoint(anchor);
		pendingTripFocusId = null;
	}

	async function updateMap() {
		await tick();
		if (!mapEl) return;
		// Recreate the Leaflet instance when its container was swapped
		// (menu switch unmounts the old map div).
		if (mapHandle && mapContainer !== mapEl) {
			mapHandle.destroy();
			mapHandle = null;
		}
		if (!mapHandle) {
			mapHandle = await createMap(
				mapEl,
				env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
				{ standard: $t('map.styleStandard'), satellite: $t('map.styleSatellite') }
			);
			mapContainer = mapEl;
		}
		// fit=false until the user explicitly picks a trip, so the
		// first view stays on the full-Indonesia extent.
		mapHandle.setData(locations, roleByUser, sosList, explicitTripFocus);
		updatePins();
		// Trip tanpa posisi live/SOS tidak menggerakkan kamera lewat
		// setData di atas — fokus anchor-nya di sini, satu kali saja.
		tryFocusSelectedTrip();
		// Titik gunung digambar ulang tiap update peta (lapisan sendiri,
		// jadi tidak ikut terhapus saat posisi anggota di-refresh).
		mapHandle.setMountains(
			visibleMapMountains(mapMountains, showMountains),
			{
				elevationUnit: $t('dashboard.mountainsElevationUnit'),
				trails: $t('map.mountainTrails')
			}
		);
	}

	async function connectSocket(tripId: string) {
		try {
			const { io } = await import('socket.io-client');
			const client = io(api.socketUrl(), { transports: ['websocket', 'polling'] });
			client.emit('join-trip', { tripId });
			client.on('location-update', () => void loadTripData(tripId));
			client.on('sos-trigger', () => void loadTripData(tripId));
			client.on('sos-resolve', () => void loadTripData(tripId));
			client.on('sos-acknowledge', () => void loadTripData(tripId));
			live = true;
			socket = client;
		} catch {
			live = false;
		}
	}

	function disconnectSocket() {
		socket?.disconnect();
		socket = null;
		live = false;
	}

	async function loadMeAndTrips() {
		loading = true;
		errorCode = null;
		try {
			me = (await api.me()).user;
			if (!canDashboard) return;
			trips = (await api.trips()).trips;
			if (trips.length > 0 && !selectedId) await selectTrip(trips[0].id, false);
			void loadAllMembers();
			void loadTripPins();
			void loadAllSos();
			void loadMapMountains();
			// Sidebar badges (file-10) need counts right after login,
			// not only after their pages are opened.
			void loadNotifications();
			void loadPlatformSettings();
			if (isStaffAdmin) {
				void loadVerifications();
				void loadProposals();
				void loadReports();
				void loadOrganizers();
			}
		} catch (e) {
			if (e instanceof ApiError) errorCode = e.code;
			else errorCode = 'GENERIC';
			if (errorCode === 'UNAUTHORIZED' || errorCode === 'INVALID_TOKEN') {
				setToken(null);
				me = null;
			}
		} finally {
			loading = false;
		}
	}

	async function requestOtpCode(event: SubmitEvent | MouseEvent) {
		event.preventDefault();
		loading = true;
		errorCode = null;
		try {
			await api.requestOtp(email.trim(), 'email');
			otpCode = '';
			otpStep = 'otp';
		} catch (e) {
			if (e instanceof ApiError) errorCode = e.code;
			else errorCode = 'GENERIC';
		} finally {
			loading = false;
		}
	}

	async function verifyOtpCode(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		errorCode = null;
		try {
			const res = await api.verifyOtp(email.trim(), otpCode.trim());
			if ('needsName' in res) {
				// Dashboard tidak membuat akun: ini berarti identifier
				// belum terdaftar sebagai staff/admin.
				errorCode = 'ACCOUNT_NOT_FOUND';
				return;
			}
			setToken(res.token);
			await loadMeAndTrips();
			// Undangan menunggu login (INVITE 2 Nov 2026): pengunjung
			// /undang yang belum login diarahkan kembali ke undangan
			// itu setelah OTP sukses. Hook ini diletakkan setelah
			// loadMeAndTrips() supaya tetap jalan untuk user biasa
			// (non-dashboard), yang loadMeAndTrips-nya return awal.
			if (typeof sessionStorage !== 'undefined') {
				const pending = sessionStorage.getItem('gobareng-pending-invite');
				if (pending) {
					sessionStorage.removeItem('gobareng-pending-invite');
					window.location.href = `/undang/${pending}`;
				}
			}
		} catch (e) {
			if (e instanceof ApiError) errorCode = e.code;
			else errorCode = 'GENERIC';
		} finally {
			loading = false;
		}
	}

	function backToIdentifier() {
		otpStep = 'identifier';
		otpCode = '';
		errorCode = null;
	}

	async function loadTripReport(id: string) {
		try {
			tripReport = (await api.tripReport(id)).report;
			tripReportErrorCode = null;
		} catch (e) {
			// Belum ada laporan = keadaan normal, bukan error.
			tripReport = null;
			tripReportErrorCode =
				e instanceof ApiError && e.code !== 'REPORT_NOT_FOUND' ? e.code : null;
		}
	}

	async function generateTripReport() {
		if (!detailTrip) return;
		tripReportLoading = true;
		tripReportErrorCode = null;
		try {
			tripReport = (await api.generateTripReport(detailTrip.id)).report;
		} catch (e) {
			tripReportErrorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			tripReportLoading = false;
		}
	}

	async function generateAiSummary() {
		if (!detailTrip) return;
		aiLoading = true;
		aiErrorCode = null;
		try {
			const res = await api.aiSummary(detailTrip.id);
			aiSummary = res.summary;
			aiModel = res.model;
		} catch (e) {
			aiErrorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			aiLoading = false;
		}
	}

	// SET-4/5/6: nilai toggle dibaca kedua peran (command_center ikut —
	// publicMapTrips memfilter pin peta); tulis hanya admin.
	async function loadPlatformSettings() {
		try {
			platformSettings = (await api.platformSettings()).settings;
			updatePins();
		} catch {
			// Baris settings tetap pill "Belum tersedia"; bukan error fatal.
		}
	}

	async function togglePlatformSetting(key: keyof PlatformSettings) {
		if (settingsSaving || !isStaffAdmin) return;
		const current = platformSettings ?? {
			signupOpen: true,
			publicMapTrips: true,
			maintenanceMode: false,
			notifVerify: true,
			notifCheckin: true,
			notifRegistEmail: true,
			notifRegistWhatsapp: true,
			notifRegistSms: true,
			notifSosEmail: true,
			notifSosWhatsapp: true,
			notifSosSms: true,
			notifVerifyEmail: true,
			notifVerifyWhatsapp: true,
			notifVerifySms: true,
			notifCheckinEmail: true,
			notifCheckinWhatsapp: true,
			notifCheckinSms: true,
			otpEmail: true,
			otpSms: true,
			otpWhatsapp: false,
			aiV: true,
			aiP: true,
			aiL: true,
			aiQ: true,
			aiR: true,
			aiG: true,
			brevoSenderEmail: '',
			brevoSmsSender: '',
			brevoWhatsappSenderNumber: '',
			brevoWhatsappTemplateId: '',
			defaultQuota: 15,
			currency: 'IDR',
			timezone: 'WIB',
			proQrisUrl: '',
			whatsappProvider: 'official'
		};
		settingsSaving = true;
		try {
			platformSettings = (
				await api.updatePlatformSettings({ [key]: !current[key] })
			).settings;
			updatePins();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			settingsSaving = false;
		}
	}

	// Setting teks Brevo (nomor/template WA dkk): satu PATCH, bukan toggle.
	async function updatePlatformSettings(patch: Partial<PlatformSettings>) {
		if (settingsSaving || !isStaffAdmin) return;
		settingsSaving = true;
		try {
			platformSettings = (await api.updatePlatformSettings(patch)).settings;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			settingsSaving = false;
		}
	}

	async function loadVerifications() {
		if (!isStaffAdmin) return;
		verifyLoaded = false;
		try {
			pendingVerifications = (await api.pendingVerifications()).pending;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			verifyLoaded = true;
		}
	}

	async function decideVerification(person: OrganizerVerification, approve: boolean) {
		if (verificationBusyId !== null) return;
		if (
			!window.confirm(
				$t(
					approve
						? 'dashboard.verifyApproveConfirm'
						: 'dashboard.verifyRejectConfirm',
					{ name: person.user.name }
				)
			)
		)
			return;
		errorCode = null;
		verificationBusyId = person.id;
		try {
			if (approve) await api.verifyMember(person.user.id);
			else await api.rejectVerification(person.user.id);
			pendingVerifications = pendingVerifications.filter((p) => p.id !== person.id);
			actionNotice = $t(
				approve ? 'dashboard.verifyApprovedNotice' : 'dashboard.verifyRejectedNotice',
				{ name: person.user.name }
			);
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			if (verificationBusyId === person.id) verificationBusyId = null;
		}
	}

	function openVerifyDetail(person: OrganizerVerification) {
		verifyDetailTarget = person;
	}

	function closeVerifyDetail() {
		if (verifyKtpUrl) URL.revokeObjectURL(verifyKtpUrl);
		verifyKtpUrl = null;
		verifyDetailTarget = null;
	}

	async function openVerifyKtp(person: OrganizerVerification) {
		if (verifyKtpBusy) return;
		verifyKtpBusy = true;
		try {
			if (verifyKtpUrl) URL.revokeObjectURL(verifyKtpUrl);
			verifyKtpUrl = await api.verificationDocument(person.id);
			window.open(verifyKtpUrl, '_blank');
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			verifyKtpBusy = false;
		}
	}

	function markVerificationAvatarFailed(id: string) {
		if (!failedVerificationAvatars.includes(id)) {
			failedVerificationAvatars = [...failedVerificationAvatars, id];
		}
	}

	async function loadOrganizers() {
		if (!isStaffAdmin) return;
		organizerLoaded = false;
		try {
			verifiedMembers = (await api.adminMembers()).members.filter(
				(m) => m.role === 'user' && m.isVerified
			);
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			organizerLoaded = true;
		}
	}

	async function loadReports() {
		if (!isStaffAdmin) return;
		modLoaded = false;
		try {
			modReports = (await api.reports('OPEN')).reports;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			modLoaded = true;
		}
	}

	async function decideReport(report: ModReport, action: 'ACTIONED' | 'DISMISSED') {
		if (
			!window.confirm(
				$t(
					action === 'ACTIONED'
						? 'dashboard.reportActionedConfirm'
						: 'dashboard.reportDismissedConfirm',
					{ reporter: report.reporterName }
				)
			)
		)
			return;
		errorCode = null;
		try {
			await api.closeReport(report.id, action);
			modReports = modReports.filter((r) => r.id !== report.id);
			actionNotice = $t(
				action === 'ACTIONED'
					? 'dashboard.reportActionedNotice'
					: 'dashboard.reportDismissedNotice',
				{ reporter: report.reporterName }
			);
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function loadCommunities() {
		if (!isStaffAdmin) return;
		communitiesLoaded = false;
		try {
			communities = (await api.communities()).communities;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			communitiesLoaded = true;
		}
	}

	async function deleteCommunity(community: Community) {
		if (!window.confirm($t('dashboard.communityDeleteConfirm'))) return;
		errorCode = null;
		try {
			await api.deleteCommunity(community.id);
			communities = communities.filter((c) => c.id !== community.id);
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
			await loadCommunities();
		}
	}

	async function loadNotifications() {
		try {
			notifList = (await api.notifications()).notifications;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function loadMountains() {
		try {
			mountains = (await api.mountains()).mountains;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	// Tab Jalur: muat jalur semua gunung sekali saja (cache per id gunung).
	// Entri gunung yang sudah dihapus tidak ikut tampil karena flatMap
	// hanya berjalan di atas daftar gunung yang masih ada.
	async function loadMountainRoutes() {
		if (mountainsRoutesLoaded || mountainsRoutesLoading) return;
		mountainsRoutesLoading = true;
		try {
			const entries = await Promise.all(
				mountains.map(async (m) => [m.id, (await api.mountainRoutes(m.id)).routes] as const)
			);
			mountainsRoutesById = Object.fromEntries(entries);
			mountainsRoutesLoaded = true;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			mountainsRoutesLoading = false;
		}
	}

	const filteredMountainRoutes = $derived(
		mountains
			.flatMap((m) => (mountainsRoutesById[m.id] ?? []).map((route) => ({ mountain: m, route })))
			.filter(({ mountain }) => mountainsRoutesFilter === 'all' || mountainsRoutesFilter === mountain.id)
	);
	const mountainsRoutesPageCount = $derived(
		Math.max(1, Math.ceil(filteredMountainRoutes.length / mountainsPageSize))
	);
	const pagedMountainRoutes = $derived(
		filteredMountainRoutes.slice(
			(mountainsRoutesPage - 1) * mountainsPageSize,
			mountainsRoutesPage * mountainsPageSize
		)
	);
	$effect(() => {
		void mountainsRoutesFilter;
		void mountainsTab;
		mountainsRoutesPage = 1;
	});
	$effect(() => {
		if (mountainsRoutesPage > mountainsRoutesPageCount)
			mountainsRoutesPage = mountainsRoutesPageCount;
	});

	async function openMountain(id: string) {
		try {
			selectedMountain = (await api.mountain(id)).mountain;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	// Tabel Gunung: aksi admin-only (API menegakkan requireAdmin).
	function startEditMountain(mountain: Mountain) {
		editingMountain = mountain;
		editMountainName = mountain.name;
		editMountainLocation = mountainCity(mountain);
		editMountainProvince = mountainProvince(mountain);
		editMountainElevation = mountain.elevationM;
		editMountainDifficulty = mountain.difficultyKey;
		editMountainVolcanoActive = mountain.volcanoActive;
		editMountainImageUrl = mountain.imageUrl ?? '';
		editMountainFile = null;
		if (editMountainFilePreview) URL.revokeObjectURL(editMountainFilePreview);
		editMountainFilePreview = '';
		editMountainUploading = false;
	}
	function closeMountainEdit() {
		if (editMountainFilePreview) URL.revokeObjectURL(editMountainFilePreview);
		editMountainFilePreview = '';
		editMountainFile = null;
		editMountainUploading = false;
		editingMountain = null;
	}
	function onMountainImageFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (editMountainFilePreview) URL.revokeObjectURL(editMountainFilePreview);
		if (!file || !file.type.startsWith('image/')) {
			editMountainFile = null;
			editMountainFilePreview = '';
			return;
		}
		editMountainFile = file;
		editMountainFilePreview = URL.createObjectURL(file);
	}
	async function saveMountainEdit(event: SubmitEvent) {
		event.preventDefault();
		if (!editingMountain) return;
		let imageUrl = editMountainImageUrl.trim() || null;
		if (editMountainFile) {
			editMountainUploading = true;
			try {
				const up = await api.uploadMountainImage(editingMountain.id, editMountainFile);
				imageUrl = up.mountain.imageUrl;
			} catch (e) {
				errorCode = e instanceof ApiError ? e.code : 'GENERIC';
				editMountainUploading = false;
				return;
			}
			editMountainUploading = false;
		}
		try {
			await api.updateMountain(editingMountain.id, {
				name: editMountainName.trim(),
				location: editMountainProvince
					? `${editMountainLocation.trim()}, ${editMountainProvince.trim()}`
					: editMountainLocation.trim(),
				province: editMountainProvince.trim(),
				elevationM: editMountainElevation,
				difficultyKey: editMountainDifficulty,
				volcanoActive: editMountainVolcanoActive,
				imageUrl
			});
			closeMountainEdit();
			await loadMountains();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}
	async function toggleMountainActive(mountain: Mountain) {
		if (
			!window.confirm(
				$t('dashboard.mountainToggleConfirm', { name: mountain.name })
			)
		)
			return;
		try {
			await api.updateMountain(mountain.id, { isActive: !mountain.isActive });
			await loadMountains();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}
	async function deleteMountainRow(mountain: Mountain) {
		if (!window.confirm($t('dashboard.mountainsDeleteConfirm'))) return;
		try {
			await api.deleteMountain(mountain.id);
			await loadMountains();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}
	// Jalur: segarkan cache jalur + hitungan jalur per gunung setelah
	// tambah/edit/nonaktifkan/hapus.
	async function refreshMountainRoutes() {
		mountainsRoutesLoaded = false;
		mountainsRoutesById = {};
		await loadMountains();
		await loadMountainRoutes();
	}
	function openRouteCreate() {
		if (mountains.length === 0) return;
		routeEditTarget = null;
		routeMountainId =
			mountainsRoutesFilter !== 'all' ? mountainsRoutesFilter : mountains[0].id;
		routeName = '';
		routeMeetingPoint = '';
		routeDistanceKm = 0;
		routeGainM = 0;
		routeEstHours = 0;
		routeRecommended = false;
		routePosts = [{ name: '', lat: '', lon: '' }];
		showRouteModal = true;
	}
	function openRouteEdit(mountain: Mountain, route: MountainRoute) {
		routeEditTarget = { mountain, route };
		routeMountainId = mountain.id;
		routeName = route.name;
		routeMeetingPoint = route.meetingPoint;
		// Statistik impor bisa null (katalog lama) — form edit tetap
		// angka wajib, jadi null diisi 0 dan admin mengisi ulang.
		routeDistanceKm = route.distanceKm ?? 0;
		routeGainM = route.gainM ?? 0;
		routeEstHours = route.estHours ?? 0;
		routeRecommended = route.recommended;
		routePosts = buildRouteEditPosts(route.posts, route.checkpoints);
		showRouteModal = true;
	}
	function closeRouteModal() {
		showRouteModal = false;
	}
	async function saveRoute(e: SubmitEvent) {
		e.preventDefault();
		try {
			const body = {
				name: routeName,
				meetingPoint: routeMeetingPoint,
				distanceKm: routeDistanceKm,
				gainM: routeGainM,
				estHours: routeEstHours,
				recommended: routeRecommended,
				posts: toRoutePostPayload(routePosts)
			};
			if (routeEditTarget) {
				await api.updateMountainRoute(
					routeEditTarget.mountain.id,
					routeEditTarget.route.id,
					body
				);
			} else {
				await api.createMountainRoute(routeMountainId, body);
			}
			closeRouteModal();
			await refreshMountainRoutes();
		} catch (err) {
			errorCode = err instanceof ApiError ? err.code : 'GENERIC';
		}
	}
	async function toggleRouteActive(mountain: Mountain, route: MountainRoute) {
		if (
			!window.confirm(
				$t('dashboard.routeToggleConfirm', {
					name: route.name,
					mountain: mountain.name
				})
			)
		)
			return;
		try {
			await api.updateMountainRoute(mountain.id, route.id, {
				isActive: !route.isActive
			});
			await refreshMountainRoutes();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}
	async function deleteRouteRow(mountain: Mountain, route: MountainRoute) {
		if (!window.confirm($t('dashboard.mountainsRoutesDeleteConfirm'))) return;
		try {
			await api.deleteMountainRoute(mountain.id, route.id);
			await refreshMountainRoutes();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function markAllNotificationsRead() {
		try {
			await api.notificationsReadAll();
			await loadNotifications();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function openNotification(notif: AppNotification) {
		try {
			if (!notif.readAt) {
				await api.notificationRead(notif.id);
				notifList = notifList.map((n) =>
					n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n
				);
			}
		} catch {
			// Read-marking is best effort; navigation below still runs.
		}
		if (notif.kind === 'SOS_TRIGGERED' && notif.tripId) {
			await selectTrip(notif.tripId);
			activeMenu = 'sos';
		} else if (notif.kind === 'VERIFICATION_REQUEST' && isStaffAdmin) {
			activeMenu = 'organizer-verification';
			void loadVerifications();
		}
	}

	async function loadStaff() {
		if (!isStaffAdmin) return;
		try {
			staffList = (await api.staffList()).staff;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function createStaff(event: SubmitEvent) {
		event.preventDefault();
		staffNotice = null;
		errorCode = null;
		try {
			await api.createStaff(staffName.trim(), staffEmail.trim(), staffRole);
			staffName = '';
			staffEmail = '';
			staffRole = 'command_center';
			staffNotice = 'created';
			showStaffModal = false;
			await loadStaff();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function toggleSuspend(account: StaffAccount) {
		errorCode = null;
		try {
			if (account.suspendedAt) await api.unsuspendMember(account.id);
			else await api.suspendMember(account.id);
			await loadStaff();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	function openEditProfile(account: StaffAccount) {
		editStaff = account;
		editName = account.name;
		editEmail = account.email;
		editAvatarFile = null;
		editAvatarRemove = false;
		editErrorCode = null;
	}

	async function saveEditStaff(event: SubmitEvent) {
		event.preventDefault();
		const target = editStaff;
		if (!target) return;
		editErrorCode = null;
		editSaving = true;
		try {
			await api.updateStaff(target.id, { name: editName.trim(), email: editEmail.trim() });
			if (editAvatarFile) await api.uploadStaffAvatar(target.id, editAvatarFile);
			else if (editAvatarRemove) await api.deleteStaffAvatar(target.id);
			staffNotice = 'edited';
			editStaff = null;
			await loadStaff();
		} catch (e) {
			editErrorCode = e instanceof ApiError ? e.code : 'GENERIC';
		} finally {
			editSaving = false;
		}
	}

	async function markDone(alert: SosAlert) {
		if (!window.confirm($t('dashboard.sosResolveConfirm'))) return;
		try {
			await api.resolveSos(alert.tripId, alert.id);
			actionNotice = $t('dashboard.sosResolvedNotice');
			if (selectedId) await loadTripData(selectedId);
			void loadAllSos();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	async function acknowledge(alert: SosAlert) {
		try {
			await api.acknowledgeSos(alert.tripId, alert.id);
			if (selectedId) await loadTripData(selectedId);
			void loadAllSos();
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	// Keep the layout's header visibility in sync: header shows only
	// when a session is active, never on the login screen.
	$effect(() => {
		loggedIn.set(me !== null);
	});

	// The shelled dashboard owns its header (the shell's), so the layout
	// hides its teal header while a dashboard session is shown. False on
	// the login screen and the non-dashboard denied card, preserving their
	// current behaviour.
	$effect(() => {
		shelled.set(me !== null && canDashboard);
	});

	// Remount the map when a menu switch makes it visible again.
	$effect(() => {
		if (mapVisible) void updateMap();
	});
	// Re-render pins when the kind strip (map filter) changes.
	// Perangkap Svelte 5: updatePins early-return saat mapHandle null
	// SEBELUM membaca summaryKindFilter, sehingga effect ini tidak
	// melacak dependensi apa pun dan klik chip tidak pernah menggambar
	// ulang pin (bug yang dilaporkan Wella 2 Nov 2026: chip hanya
	// memfilter daftar). Baca filter secara eksplisit di sini supaya
	// effect selalu terlacak sejak jalan pertama.
	$effect(() => {
		void summaryKindFilter;
		updatePins();
	});

	function logout() {
		setToken(null);
		location.reload();
	}

	onMount(() => {
		// Tautan juri tanpa OTP (3 Nov 2026): ?magic=<token> ditukar jadi
		// sesi dashboard, lalu parameter dibersihkan dari URL supaya
		// token tidak tertinggal di address bar/riwayat. Bila sudah
		// login sebagai akun lain, tautan ini MENGGANTI sesi tersebut
		// dengan akun juri — sesuai maksud tautan (satu klik = login).
		const magic = new URLSearchParams(window.location.search).get('magic');
		if (magic) {
			api.redeemMagicLink(magic).then(
				(res) => {
					setToken(res.token);
					const url = new URL(window.location.href);
					url.searchParams.delete('magic');
					const qs = url.searchParams.toString();
					history.replaceState(null, '', url.pathname + (qs ? `?${qs}` : ''));
					void loadMeAndTrips();
				},
				(e) => {
					errorCode = e instanceof ApiError ? e.code : 'GENERIC';
				}
			);
			return;
		}
		if (getToken()) void loadMeAndTrips();
	});

	onDestroy(() => {
		disconnectSocket();
		mapHandle?.destroy();
	});
</script>

<style>
	.card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 15px 16px 16px;
		margin-bottom: 14px;
		box-shadow: var(--shadow);
	}
	.card h2 {
		margin: 0 0 10px;
		font-size: 15px;
		letter-spacing: -0.01em;
		color: var(--ink);
	}
	/* Tabel Gunung (1 Nov 2026): seperti contoh tabel produk — header
	   rata kiri, thumbnail kecil di kolom Gambar, scroll horizontal
	   di layar kecil supaya kolom tidak remuk. */
	.mountains-table-wrap {
		overflow-x: auto;
	}
	.mountains-pager {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-top: 12px;
	}
	.mountains-pager button:disabled {
		opacity: 0.45;
	}
	.mountains-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.mountains-table th,
	.mountains-table td {
		text-align: left;
		padding: 8px 10px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
		white-space: nowrap;
	}
	.mountains-table th {
		font-size: 12px;
		color: var(--ink);
	}
	/* Baris terpilih di tabel Trip: sorotan hijau seperti tombol trip lama. */
	.mountains-table tr.selected td {
		background: var(--green-soft);
	}
	/* Avatar di sel tabel (Organizer): 46px seperti avatar verifikasi. */
	.mountains-table img.avatar-lg {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}
	.mountains-thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 8px;
		display: block;
	}
	.mountains-thumb-large {
		width: 100%;
		max-width: 480px;
		border-radius: 12px;
		display: block;
		margin-bottom: 10px;
	}
	/* Aksi tabel Gunung: tombol pil kecil ala chip Template Kit
	   (bukan teks link) — Edit teal, Nonaktifkan oranye /
	   Aktifkan hijau, Hapus merah. */
	.mountains-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.mountains-action-btn {
		border: 0;
		border-radius: 999px;
		padding: 5px 10px;
		font-size: 12px;
		font-weight: 700;
		color: #fff;
		cursor: pointer;
		white-space: nowrap;
	}
	.mountains-action-btn.edit {
		background: #108b93;
	}
	.mountains-action-btn.edit:hover {
		background: #0b6f76;
	}
	.mountains-action-btn.toggle-off {
		background: #f78308;
	}
	.mountains-action-btn.toggle-off:hover {
		background: #d96e05;
	}
	.mountains-action-btn.toggle-on {
		background: var(--green);
	}
	.mountains-action-btn.toggle-on:hover {
		background: var(--green-d);
	}
	.mountains-action-btn.delete {
		background: #e11d48;
	}
	.mountains-action-btn.delete:hover {
		background: #be123c;
	}
	.mountains-action-btn:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	/* Kolom Negara di tabel Member: sel tampil sebagai ikon bendera saja. */
	.flag-select {
		border: 0;
		background: transparent;
		font-size: 20px;
		padding: 2px;
		cursor: pointer;
	}
	.flag-select:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	/* Popup edit Gunung: backdrop + kartu dialog di tengah layar. */
	.route-map {
		width: 100%;
		height: 320px;
		border-radius: 12px;
		overflow: hidden;
	}
	/* Legenda warna marker: dot sama dengan warna di peta. */
	.route-map-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin-top: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	.route-map-legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.route-map-legend-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		flex: 0 0 auto;
	}
	/* Modal lihat jalur (Wella 1 Nov 2026): judul hierarki, tombol
	   tutup tidak terjepit, statistik pill, daftar pos berbaris. */
	.route-map-head {
		align-items: flex-start;
		gap: 12px;
	}
	.route-map-title {
		flex: 1;
		min-width: 0;
	}
	.route-map-subtitle {
		margin: 0 0 2px;
		font-size: 12px;
		color: var(--muted);
	}
	.route-map-title h3 {
		text-wrap: balance;
	}
	.route-map-head .mountains-modal-close {
		flex: 0 0 auto;
	}
	.route-map-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	.route-map-stat {
		display: grid;
		gap: 1px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--card2);
	}
	.route-map-stat-label {
		font-size: 11px;
		color: var(--muted);
	}
	.route-map-stat-value {
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	/* Modal lihat jalur dilebarkan sedikit (520 → 640px) supaya tabel
	   + peta tidak sempit; modal lain tetap 520px. */
	.route-map-modal {
		max-width: 640px;
	}
	/* Tabel checkpoint: <table> semantik (pedoman Vercel + referensi
	   UI Prep/UX Pickle: garis horizontal saja + hover, teks kiri,
	   angka kanan tabular-nums, header sticky, baris lega). */
	.route-map-table-wrap {
		margin-top: 8px;
		max-height: 340px;
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: 12px;
	}
	.route-map-table {
		width: 100%;
		min-width: 460px;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	.route-map-table th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--card);
		padding: 10px 12px;
		font-size: 12px;
		color: var(--muted);
		text-align: left;
		border-bottom: 2px solid var(--line);
		white-space: nowrap;
	}
	.route-map-table td {
		padding: 10px 12px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	.route-map-table tbody tr:hover {
		background: var(--card2);
	}
	.route-map-table .num {
		text-align: right;
		white-space: nowrap;
	}
	/* Baris pos di form edit jalur: nama fleksibel, lat/lon ringkas,
	   melipat rapi di layar sempit (tanpa mengubah grid modal lain). */
	.route-post-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.route-post-row input[type='text'] {
		flex: 1 1 160px;
		min-width: 0;
	}
	.route-post-row input[type='number'] {
		flex: 0 1 100px;
		min-width: 0;
	}
	.route-map-cp-num {
		display: inline-grid;
		place-items: center;
		width: 24px;
		height: 24px;
		margin-right: 8px;
		border-radius: 50%;
		background: var(--green);
		color: #fff;
		font-size: 12px;
		font-weight: 800;
		vertical-align: middle;
	}
	.mountains-modal-backdrop {
		overscroll-behavior: contain;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		z-index: 100;
	}
	.mountains-modal {
		background: var(--card);
		color: var(--ink);
		border-radius: 16px;
		padding: 20px;
		width: 100%;
		max-width: 520px;
		max-height: 90vh;
		overflow: auto;
	}
	.mountains-modal-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}
	.mountains-modal-head h3 {
		margin: 0;
	}
	.mountains-modal-close {
		background: var(--card2);
		color: var(--ink);
		border-radius: 999px;
		padding: 4px 12px;
		font-size: 18px;
	}
	.mountains-modal-close:hover {
		background: var(--green-soft);
	}
	.mountains-search {
		width: 100%;
		padding: 8px 10px;
		margin-bottom: 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		color: var(--ink);
	}
	.mountains-edit-grid {
		display: grid;
		gap: 8px;
		margin-bottom: 12px;
	}
	.mountains-edit-grid input,
	.mountains-edit-grid select {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--card);
		color: var(--ink);
	}
	.date-row {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		align-items: center;
		margin-bottom: 10px;
	}
	/* Cermin file 10: di layar kecil (<=760px) baris tanggal
	   kembali rata kiri + boleh melipat, bukan rata kanan. */
	@media (max-width: 760px) {
		.date-row {
			justify-content: flex-start;
			flex-wrap: wrap;
		}
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 14px;
	}
	.section-head h2 {
		margin-bottom: 0;
	}
	.link-btn {
		border: 0;
		background: transparent;
		color: var(--blue);
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		padding: 4px 0;
		white-space: nowrap;
	}
	/* Mockup "Lihat Semua" is a plain link: no green button hover/active. */
	.link-btn:hover,
	.link-btn:active {
		background: transparent;
		transform: none;
	}
	.route-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 11px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
		font-size: 14px;
	}
	.rank-img {
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		border-radius: 9px;
		object-fit: cover;
		background: var(--card2);
	}
	.rmeta {
		margin-left: auto;
		flex: 0 0 auto;
		text-align: right;
		font-size: 12px;
		color: var(--ink);
	}
	.rmeta b {
		display: block;
		font-weight: 700;
	}
	.rank-num {
		width: 24px;
		height: 24px;
		flex: 0 0 24px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #fff;
		font-size: 12px;
		font-weight: 800;
	}
	.route-name {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rank-title {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rank-loc {
		font-size: 11.5px;
		color: var(--muted);
	}
	.up {
		color: var(--green-d);
		font-weight: 800;
		font-size: 12px;
		white-space: nowrap;
	}
	/* Trip Akan Datang rows (mockup .upcoming): datebox + photo + name
	   + location/participants + availability pill. */
	.upcoming {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.datebox {
		text-align: center;
		min-width: 36px;
		flex: 0 0 36px;
	}
	.datebox b {
		display: block;
		font-size: 18px;
		line-height: 1;
		color: var(--ink);
	}
	.datebox span {
		font-size: 11px;
		color: var(--muted);
		font-weight: 700;
	}
	.up-img {
		width: 46px;
		height: 46px;
		flex: 0 0 46px;
		border-radius: 9px;
		object-fit: cover;
		background: var(--card2);
	}
	.up-body {
		flex: 1;
		min-width: 0;
	}
	.up-body h4 {
		margin: 0;
		font-size: 13px;
		color: var(--ink);
	}
	.up-body p {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 11.5px;
		line-height: 1.45;
	}
	.avail {
		margin-left: auto;
		flex: 0 0 auto;
		font-size: 11px;
		font-weight: 800;
		border-radius: 999px;
		padding: 5px 9px;
		background: var(--green-soft);
		color: var(--green-d);
		white-space: nowrap;
	}
	.avail.full {
		background: #fee2e2;
		color: #b91c1c;
	}
	/* Trip Aktif tabs (mockup .tabs): Semua / Pendakian / Touring. */
	.tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 0 0 10px;
	}
	.tabs button {
		border: 0;
		border-radius: 999px;
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 700;
		background: var(--card2);
		color: var(--muted);
	}
	.tabs button:hover {
		background: var(--card2);
	}
	.tabs button.active {
		background: var(--green);
		color: #fff;
	}
	.tabs button.active:hover {
		background: var(--green);
	}
	/* Trip Aktif rows (mockup .trip): photo + status/name/place/participants
	   + right meta (mini faces, time note, chevron). */
	.trip {
		display: flex;
		gap: 11px;
		padding: 11px 0;
		border: 0;
		border-top: 1px solid var(--line);
		cursor: pointer;
		align-items: flex-start;
		text-align: left;
		background: transparent;
		width: 100%;
		color: var(--ink);
		font: inherit;
	}
	.trip:hover,
	.trip.sel {
		background: var(--green-soft);
	}
	.trip-img {
		width: 62px;
		height: 62px;
		flex: 0 0 62px;
		border-radius: 11px;
		object-fit: cover;
		background: var(--card2);
	}
	.trip-main {
		flex: 1;
		min-width: 0;
	}
	.status {
		font-size: 11px;
		font-weight: 800;
		display: inline-flex;
		gap: 5px;
		align-items: center;
	}
	.status i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: currentColor;
		display: inline-block;
	}
	.s-green {
		color: #059669;
	}
	.trip-main h3 {
		margin: 2px 0 3px;
		font-size: 13.5px;
		line-height: 1.3;
		color: var(--ink);
	}
	.trip-main p {
		margin: 0;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.45;
	}
	.trip .meta {
		margin-left: auto;
		flex: 0 0 auto;
		text-align: right;
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.mini-faces {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 5px;
		align-items: center;
	}
	.mini-faces span {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #cbd5e1;
		border: 2px solid var(--card);
		margin-left: -6px;
		display: grid;
		place-items: center;
		font-size: 8px;
		font-weight: 800;
		color: #334155;
		flex: 0 0 18px;
	}
	.mini-faces span:first-child {
		margin-left: 0;
	}
	.trip-note {
		display: block;
	}
	.trip-chevron {
		display: block;
		font-size: 14px;
		color: var(--muted2);
	}
	.subhead {
		font-size: 14px;
		margin: 20px 0 8px;
		color: var(--ink);
	}
	.setting-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
		font-size: 14px;
	}
	.muted {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.5;
	}
	button {
		background: var(--green);
		color: #fff;
		border: 0;
		border-radius: 10px;
		padding: 9px 16px;
		cursor: pointer;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
	}
	button:hover {
		background: var(--green-d);
	}
	button:active {
		transform: translateY(1px);
	}
	button:focus-visible {
		outline: 3px solid var(--orange);
		outline-offset: 2px;
	}
	button.secondary {
		background: var(--card2);
		color: var(--ink);
	}
	button.secondary:hover {
		background: var(--green-soft);
	}
	.verify-page {
		width: calc(100% + 1px);
		margin: -8px 0 0 -1px;
	}
	.verify-page-head {
		margin: 2px 0 14px;
	}
	.verify-page-head h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.verify-page-head p {
		max-width: 640px;
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.verify-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	.verify-pill {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card);
		color: var(--ink);
		font-size: 12px;
		font-weight: 700;
		line-height: normal;
	}
	.verify-list-card {
		overflow: hidden;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.verify-avatar {
		width: 46px;
		height: 46px;
		flex: 0 0 46px;
		border-radius: 50%;
		object-fit: cover;
	}
	.verify-avatar-fallback {
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, #0fb27e, #2e7fe6);
		color: #fff;
		font-size: 14px;
		font-weight: 800;
	}
	.verify-status {
		display: block;
		width: max-content;
		margin-left: auto;
		padding: 5px 9px;
		border-radius: 999px;
		background: var(--orange-soft);
		color: #c2410c;
		font-size: 11px;
		font-weight: 800;
		line-height: normal;
	}
	.verify-empty {
		margin: 0;
		padding: 22px 16px;
		color: var(--muted);
		font-size: 13px;
		text-align: center;
	}
	/* File-10 home layout: map column + 342px side column
	   (Trip Aktif + Aktivitas Terbaru), collapsing to one column
	   at ≤1180px like the reference file's content pattern. */
	.summary-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 342px;
		gap: 14px;
		align-items: start;
	}
	/* File-10 home bottom row: Rute Populer + Trip yang Akan Datang. */
	.bottom-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		align-items: start;
	}
	/* Trip list: sekarang tabel (baris terpilih lihat .mountains-table tr.selected). */
	.trip-name {
		font-weight: 700;
		font-size: 15px;
	}
	.pill {
		display: inline-block;
		font-size: 12px;
		font-weight: 700;
		padding: 2px 9px;
		border-radius: 999px;
		background: var(--card2);
		color: var(--ink);
	}
	.pill.green {
		background: var(--green-soft);
		color: var(--green-d);
	}
	.pill.orange {
		background: var(--orange-soft);
		color: #c2410c;
	}
	.pill.grey {
		background: var(--card2);
		color: var(--muted);
	}
	/* SET-4/5/6: switch toggle platform (mockup dashboard switch). */
	.toggle {
		width: 40px;
		height: 22px;
		border-radius: 11px;
		border: 1px solid var(--line);
		background: var(--card2);
		padding: 2px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		transition: background 0.15s ease;
	}
	.toggle.on {
		background: var(--green-soft);
		border-color: var(--green);
	}
	.toggle:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.toggle:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.pill.red {
		background: var(--red-soft);
		color: #be123c;
	}
	.pill.teal {
		background: var(--blue-soft);
		color: var(--blue);
	}
	/* Emas = warna marker Puncak (sama dengan role LEADER). */
	.pill.gold {
		background: #f5c518;
		color: #1a1a1a;
	}
	/* Date + Live pills (mockup .pill): white card background + border. */
	.info-pill {
		display: inline-flex;
		gap: 7px;
		align-items: center;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 7px 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink);
		white-space: nowrap;
	}
	.info-pill.live {
		color: var(--green-d);
	}
	.info-pill.live.off {
		color: var(--muted);
	}
	.info-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--green);
		box-shadow: 0 0 0 4px var(--green-soft);
		display: inline-block;
	}
	.info-pill.live.off .info-dot {
		background: var(--muted);
		box-shadow: none;
	}
	/* AI summary card */
	.ai-summary-text {
		font-size: 14px;
		line-height: 1.6;
		background: var(--card2);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 12px 14px;
		margin: 0 0 10px;
		white-space: pre-wrap;
	}
	/* File-10 list rows (Verifikasi, Organizer, Notifikasi): avatar +
	   text + status/actions on the right, one hairline per row. */
	.row-line {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		padding: 14px 0;
		border-top: 1px solid var(--line);
		width: 100%;
		text-align: left;
	}
	.row-line:first-of-type {
		border-top: 0;
	}
	.avatar-circle {
		width: 46px;
		height: 46px;
		flex: 0 0 46px;
		border-radius: 50%;
		background: linear-gradient(135deg, #0fb27e, #2e7fe6);
		color: #ffffff;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 16px;
	}
	.row-main {
		flex: 1;
		min-width: 0;
	}
	.row-title {
		font-weight: 700;
		font-size: 14px;
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.row-side {
		text-align: right;
		flex: 0 0 auto;
	}
	.row-actions {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
		margin-top: 8px;
		justify-content: flex-end;
		align-items: center;
	}
	button.notif-row {
		background: transparent;
		border: 0;
		border-top: 1px solid var(--line);
		border-radius: 0;
		color: inherit;
		font: inherit;
		padding: 14px 8px;
		cursor: pointer;
	}
	button.notif-row:hover {
		background: var(--card2);
	}
	button.notif-row.unread {
		background: var(--green-soft);
	}
	.notif-dot {
		width: 9px;
		height: 9px;
		flex: 0 0 9px;
		border-radius: 50%;
		background: #0fb27e;
		margin-top: 6px;
	}
	@media (max-width: 760px) {
		.verify-page {
			width: 100%;
			margin: -12px 0 0;
		}
		.verify-page-head h1 {
			font-size: 20px;
		}
		.verify-row {
			flex-wrap: wrap;
			padding: 13px 12px;
		}
		.verify-row-side {
			width: 100%;
			margin-left: 0;
			text-align: left;
		}
		.verify-status {
			margin-left: 0;
		}
		.verify-actions {
			justify-content: flex-end;
		}
		.row-line {
			flex-wrap: wrap;
		}
		.row-side {
			text-align: left;
			width: 100%;
		}
		.row-actions {
			justify-content: flex-start;
		}
	}
	/* Member alerts — previously a raw JSON dump */
	.alert-item {
		border-top: 1px solid var(--line);
		padding: 12px 0;
		font-size: 14px;
		line-height: 1.5;
	}
	.alert-item:first-of-type {
		border-top: 0;
		padding-top: 2px;
	}
	.alert-item .who {
		font-weight: 700;
		word-break: break-all;
	}
	/* Aktivitas Terbaru rows (mockup .activity): avatar + text + time. */
	.act-item {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		border-top: 1px solid var(--line);
		padding: 11px 0;
		line-height: 1.45;
	}
	.act-item:first-of-type {
		border-top: 0;
	}
	.act-ic {
		width: 34px;
		height: 34px;
		flex: 0 0 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 15px;
	}
	.act-ic.sos {
		background: var(--red-soft);
	}
	.act-ic.member {
		background: var(--green-soft);
	}
	.act-body {
		flex: 1;
		min-width: 0;
		font-size: 12.5px;
	}
	.act-body .who {
		font-weight: 700;
		word-break: break-all;
	}
	.act-time {
		margin-left: auto;
		color: var(--muted2);
		font-size: 11px;
		white-space: nowrap;
	}
	/* Map */
	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.card-head h2 {
		margin-bottom: 0;
	}
	.live-badge {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 700;
		padding: 5px 12px;
		border-radius: 999px;
		background: var(--green-soft);
		color: var(--green-d);
		white-space: nowrap;
	}
	.live-badge.off {
		background: var(--card2);
		color: var(--muted);
	}
	.live-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #268c4a;
		animation: gb-pulse 1.6s infinite;
	}
	.live-badge.off .live-dot {
		background: #94a3a3;
		animation: none;
	}
	.map {
		height: 520px;
		border-radius: 12px;
		border: 1px solid var(--line);
		overflow: hidden;
		margin-top: 14px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		margin: 14px 0 0;
		font-size: 13px;
		color: var(--muted);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.dot {
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
		flex: none;
	}
	.dot.leader {
		background: #f5c518;
	}
	.dot.sweeper {
		background: #f78308;
	}
	.dot.medic {
		background: var(--card);
	}
	.dot.member {
		background: #268c4a;
	}
	.dot.sos {
		background: #e11d48;
	}
	.dot.trip-active {
		background: #268c4a;
	}
	.dot.trip-upcoming {
		background: #108b93;
	}
	.legend-pin {
		width: 15px;
		height: 21px;
		flex: none;
	}
	/* Trips / member search + filter chips */
	.search-input {
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		font-size: 14px;
		padding: 10px 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		margin-bottom: 12px;
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}
	.chip {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		border: 1px solid var(--line);
		background: var(--card);
		border-radius: 999px;
		padding: 7px 12px;
		font-size: 12px;
		font-weight: 700;
		color: var(--ink);
	}
	.chip b {
		background: rgba(0, 0, 0, 0.08);
		border-radius: 999px;
		padding: 1px 6px;
		font-size: 11px;
		font-weight: 800;
	}
	.chip.active {
		background: var(--green);
		border-color: var(--green);
		color: #fff;
	}
	.chip.active b {
		background: rgba(255, 255, 255, 0.22);
	}
	/* Mockup SOS & List View Styles (Dashboard Gobareg 13) */
	.page-view {
		display: block;
		animation: pageIn 0.28s ease;
	}
	@keyframes pageIn {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.page-head {
		margin: 2px 0 14px;
	}
	.page-head h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.02em;
	}
	.page-head p {
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
		max-width: 640px;
	}
	.toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 12px;
		align-items: center;
	}
	.toolbar .pill {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 7px 12px;
		font-size: 12px;
		font-weight: 700;
		display: inline-flex;
		gap: 7px;
		align-items: center;
	}
	.list-card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.row-item {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 14px 16px;
		border-top: 1px solid var(--line);
	}
	.row-item:first-child {
		border-top: 0;
	}
	.row-item.sos-alert-row {
		background: rgba(239, 68, 68, 0.05);
		border-left: 4px solid #ef4444;
	}
	.row-info {
		flex: 1;
		min-width: 200px;
	}
	.row-item h3 {
		margin: 0;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.row-item p {
		margin: 3px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.row-item .spacer {
		margin-left: auto;
		text-align: right;
		flex: 0 0 auto;
	}
	.pill-status {
		font-size: 11px;
		font-weight: 800;
		border-radius: 999px;
		padding: 5px 9px;
		white-space: nowrap;
		display: inline-block;
	}
	.pill-status.green {
		background: var(--green-soft);
		color: var(--green-d);
	}
	.pill-status.blue {
		background: var(--blue-soft);
		color: var(--blue);
	}
	.pill-status.orange {
		background: var(--orange-soft);
		color: #c2410c;
	}
	.pill-status.red {
		background: #fee2e2;
		color: #b91c1c;
	}
	.pill-status.grey {
		background: var(--card2);
		color: var(--muted);
	}
	.btn-sm {
		border: 0;
		border-radius: 9px;
		padding: 8px 12px;
		font-weight: 800;
		font-size: 12.5px;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
	}
	.btn-ghost-sm {
		background: var(--card2);
		border: 1px solid var(--line);
		color: var(--ink);
	}
	.btn-ghost-sm:hover {
		border-color: var(--green);
		color: var(--green);
	}
	.btn-danger-sm {
		background: #fff1f2;
		color: #be123c;
		border: 1px solid #fecdd3;
	}
	.btn-danger-sm:hover {
		background: #fee2e2;
	}
	.btn-row {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.thumb {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		object-fit: cover;
		flex: 0 0 52px;
	}
	.thumb-fallback {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--card2);
		border: 1px solid var(--line);
		font-size: 20px;
		flex: 0 0 52px;
	}
	.sos-alert-icon {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: #fee2e2;
		border: 1px solid #fecdd3;
		font-size: 22px;
		flex: 0 0 52px;
	}
	.kit-note {
		font-size: 12.5px;
		color: var(--muted);
		line-height: 1.55;
		margin: 8px 0 0;
	}
	.empty-note {
		padding: 22px 16px;
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
	@media (max-width: 760px) {
		.row-item {
			flex-wrap: wrap;
			padding: 13px 12px;
		}
		.row-item .spacer {
			margin-left: 0;
			text-align: left;
			width: 100%;
		}
		.page-head h1 {
			font-size: 20px;
		}
	}
	/* Forms / centred states */
	.center {
		max-width: 440px;
		margin: 48px auto;
	}
	.center h2 {
		font-size: 20px;
	}
	/* Login screen: glassmorphism card over a full-page photo of real
	   mountains that switches with the time of day (see #lib/login-bg).
	   The backdrop is fixed and sits at z-index 0, so the shell, the
	   error box, the loading state and the language switcher all need
	   their own stacking level. The photo URL and the dark overlay
	   come from the inline style on the .login-bg element; the overlay
	   is deliberately stronger than the night-only version so white
	   text stays readable over the bright midday photo too. No
	   register / forgot-password / remember-me controls: this
	   dashboard is admin-only and those flows do not exist.
	   Mouse parallax: the photo drifts opposite the cursor (see the
	   $effect in the script); scale(1.06) keeps the edges covered at
	   full shift, and the card itself never moves. */
	.login-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		will-change: transform;
	}
	.lang-switch {
		position: fixed;
		top: 20px;
		right: 24px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 8px;
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		text-shadow: 0 1px 8px rgba(15, 4, 30, 0.8);
	}
	.lang-switch button {
		background: none;
		border: 0;
		padding: 4px 2px;
		color: inherit;
		opacity: 0.55;
		cursor: pointer;
		font: inherit;
	}
	.lang-switch button.active {
		opacity: 1;
		font-weight: 800;
	}
	.lang-switch button:focus-visible {
		outline: 3px solid var(--orange);
		outline-offset: 2px;
		border-radius: 4px;
	}
	.lang-switch .sep {
		opacity: 0.55;
	}
	.login-shell {
		position: relative;
		z-index: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100dvh;
		padding: 32px 16px 48px;
		box-sizing: border-box;
	}
	.login-card {
		width: 100%;
		max-width: 420px;
		padding: 36px 32px 24px;
		text-align: center;
		color: #fff;
		background: rgba(255, 255, 255, 0.12);
		-webkit-backdrop-filter: blur(16px) saturate(140%);
		backdrop-filter: blur(16px) saturate(140%);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 20px;
		box-shadow: 0 24px 60px rgba(20, 5, 40, 0.45);
	}
	.login-logo {
		display: block;
		width: 148px;
		height: auto;
		margin: 0 auto 16px;
		filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.35));
	}
	.login-card h2 {
		font-size: 30px;
		font-weight: 800;
		color: #fff;
		margin-bottom: 6px;
		text-shadow: 0 1px 10px rgba(15, 4, 30, 0.7);
	}
	.login-sub {
		color: rgba(255, 255, 255, 0.85);
		font-size: 14px;
		line-height: 1.55;
		margin: 0 0 22px;
		text-shadow: 0 1px 8px rgba(15, 4, 30, 0.7);
	}
	.login-card form {
		text-align: left;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.login-field {
		position: relative;
		display: block;
		margin-bottom: 16px;
	}
	.field-icon {
		position: absolute;
		right: 18px;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.85);
		display: flex;
		pointer-events: none;
	}
	.login-card input {
		padding: 13px 48px 13px 20px;
		font-size: 16px;
		margin: 0;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.45);
		border-radius: 999px;
	}
	.login-card input::placeholder {
		color: rgba(255, 255, 255, 0.75);
	}
	.login-card input:focus {
		border-color: #fff;
		outline: 3px solid rgba(247, 131, 8, 0.45);
	}
	.login-btn {
		width: 100%;
		padding: 14px 16px;
		font-size: 16px;
		font-weight: 700;
		margin-top: 4px;
		background: var(--card);
		color: #5b2a86;
		border-radius: 999px;
	}
	.login-btn:hover {
		background: #f3e8ff;
	}
	.login-foot {
		color: rgba(255, 255, 255, 0.85);
		font-size: 13px;
		line-height: 1.5;
		margin: 18px 0 0;
		padding-top: 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.25);
	}
	@media (max-width: 520px) {
		.login-shell {
			padding: 16px 20px 32px;
		}
		.login-card {
			padding: 28px 20px 20px;
		}
		.login-logo {
			width: 120px;
		}
	}
	label.field {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		margin-bottom: 4px;
	}
	input,
	select {
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		margin: 6px 0 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		font: inherit;
		font-size: 15px;
		background: var(--card);
	}
	input:focus,
	select:focus {
		outline: 3px solid rgba(247, 131, 8, 0.45);
		border-color: var(--green);
	}
	.action-notice {
		background: #e6f6ec;
		border: 1px solid #268c4a;
		border-radius: 12px;
		padding: 14px 16px;
		margin-bottom: 16px;
		color: #14532d;
	}
	.error {
		position: relative;
		z-index: 1;
		background: #fde8ea;
		border: 1px solid #e11d48;
		border-radius: 12px;
		padding: 14px 16px;
		margin-bottom: 16px;
		color: #7f0f2a;
	}
	.loading-box {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 64px 16px;
		color: #fff;
		font-size: 16px;
		text-shadow: 0 1px 8px rgba(20, 5, 40, 0.6);
	}
	.spinner {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		animation: spin 0.8s linear infinite;
		flex: none;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1180px) {
		.summary-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 980px) {
		.bottom-grid {
			grid-template-columns: 1fr;
		}
		.map {
			height: 380px;
		}
	}
	@media (max-width: 520px) {
		.map {
			height: 320px;
		}
	}

	/* Mockup List & View Styles (Dashboard Gobareg 13) */
	.page-view {
		display: block;
		animation: pageIn 0.28s ease;
	}
	@keyframes pageIn {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.page-head {
		margin: 2px 0 14px;
	}
	.page-head h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.02em;
		font-weight: 800;
	}
	.page-head p {
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
		max-width: 640px;
	}
	.list-card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius, 16px);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.row-item {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 14px 16px;
		border-top: 1px solid var(--line);
	}
	.row-item:first-child {
		border-top: 0;
	}
	.row-item .avatar-circle {
		width: 46px;
		height: 46px;
		border-radius: 50%;
		flex: 0 0 46px;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 16px;
		background: linear-gradient(135deg, #0fb27e, #2e7fe6);
		color: #ffffff;
	}
	.row-item h3 {
		margin: 0;
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
	}
	.row-item p {
		margin: 3px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.row-item .spacer {
		margin-left: auto;
		text-align: right;
		flex: 0 0 auto;
	}
	.btn-row {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
		margin-top: 8px;
	}
	.btn-sm {
		border: 0;
		border-radius: 9px;
		padding: 8px 12px;
		font-weight: 800;
		font-size: 12.5px;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s ease;
	}
	.btn-ghost-sm {
		background: var(--card2);
		border: 1px solid var(--line);
		color: var(--ink);
	}
	.btn-ghost-sm:hover {
		background: var(--line);
	}
	.pill-status {
		font-size: 11px;
		font-weight: 800;
		border-radius: 999px;
		padding: 5px 9px;
		white-space: nowrap;
	}
	.pill-status.green {
		background: var(--green-soft);
		color: var(--green-d);
	}
	.empty-note {
		padding: 22px 16px;
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}
	@media (max-width: 600px) {
		.row-item {
			flex-wrap: wrap;
			padding: 13px 12px;
		}
		.row-item .spacer {
			margin-left: 0;
			text-align: left;
			width: 100%;
		}
	}

	/* Detail trip ala pantau (PR #187 restyle, 3 Nov 2026): hero teal
	   + kartu putih rounded seperti /pantau. Kartu Ringkasan AI dan
	   Laporan di bawah SOS memakai .card dashboard biasa, jadi
	   diselaraskan radius/paddingnya lewat .td-wrap > .card tanpa
	   mengubah markup kedua snippet itu.
	   Lebar: tanpa batas sendiri — kolom detail mengisi penuh area
	   konten dashboard (batas luarnya tetap main 1440px di layout,
	   sama seperti halaman lain). Batas 760px lama bikin sisi kanan
	   halaman kosong. */
	.td-wrap {
		max-width: none;
	}
	.td-wrap > .card {
		border-radius: 20px;
		padding: 20px;
	}
	.td-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
		margin-bottom: 14px;
	}
	.td-hero {
		background: linear-gradient(135deg, #0f766e, #14b8a6);
		color: #fff;
		border-radius: 20px;
		padding: 24px;
		box-shadow: 0 10px 28px rgba(15, 118, 110, 0.25);
	}
	.td-hero small {
		opacity: 0.85;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 12px;
		font-weight: 700;
	}
	.td-hero h1 {
		font-size: 42px;
		margin: 6px 0 10px;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.td-hero-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	.td-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: rgba(255, 255, 255, 0.18);
		border: 1px solid rgba(255, 255, 255, 0.35);
		padding: 7px 12px;
		border-radius: 99px;
		font-size: 13px;
		font-weight: 700;
	}
	.td-pill.solid {
		background: #fff;
		color: #0f766e;
		border-color: #fff;
	}
	.td-card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 20px;
		margin-top: 16px;
		box-shadow: var(--shadow);
	}
	.td-card h2 {
		font-size: 19px;
		margin: 0 0 14px;
	}
	.td-card .map {
		margin-top: 0;
	}
	.td-info-row {
		display: flex;
		gap: 12px;
		padding: 8px 0;
		font-size: 14px;
		border-bottom: 1px solid var(--line);
	}
	.td-info-row:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.td-info-row:first-child {
		padding-top: 0;
	}
	.td-info-label {
		flex: 0 0 110px;
		color: var(--muted);
		font-weight: 600;
	}
	.td-member {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 16px;
		flex-wrap: wrap;
	}
	.td-member + .td-member {
		margin-top: 12px;
	}
	.td-avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: linear-gradient(135deg, #14b8a6, #0f766e);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24px;
		font-weight: 800;
		flex-shrink: 0;
	}
	.td-member-info {
		flex: 1;
		min-width: 220px;
	}
	.td-member-name {
		font-size: 18px;
		font-weight: 800;
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.td-badge {
		background: #ccfbf1;
		color: #0f766e;
		border-radius: 99px;
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
	}
	.td-member-line {
		color: var(--muted);
		font-size: 13px;
		margin-top: 3px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.td-role-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
		flex-shrink: 0;
	}
	.td-sos {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		background: #ecfdf5;
		border: 1px solid #a7f3d0;
		border-radius: 16px;
		padding: 18px;
	}
	.td-sos.danger {
		background: #fef2f2;
		border-color: #fecaca;
	}
	.td-sos-check {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: #059669;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 26px;
		flex-shrink: 0;
	}
	.td-sos.danger .td-sos-check {
		background: #dc2626;
	}
	.td-sos b {
		font-size: 17px;
	}
	.td-sos.danger b {
		color: #991b1b;
	}
	.td-sos p {
		margin: 5px 0 0;
		color: #065f46;
		font-size: 14px;
		line-height: 1.5;
	}
	.td-sos-list {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.td-sos-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.td-hero h1 {
			font-size: 32px;
		}
		.td-info-label {
			flex-basis: 90px;
		}
	}

</style>

{#snippet statsSnippet()}
	<!-- File-10 overview labels. Values are real API data; the "↑ N%"
	     deltas are demo growth per the mockup (no historical aggregate
	     endpoint yet) — replaced by real history once available. -->
	<StatGrid>
		<StatCard
			icon="👥"
			label={$t('dashboard.statUsers')}
			value={trips.length === 0 ? '0' : allMembersLoaded ? String(totalUsers) : '—'}
			delta="↑ 12%"
			hint={$t('dashboard.fromLastMonth')}
			tone="green"
		/>
		<StatCard
			icon="⛰️"
			label={$t('dashboard.statTrips')}
			value={String(trips.length)}
			delta="↑ 18%"
			hint={$t('dashboard.fromLastMonth')}
			tone="blue"
		/>
		<StatCard
			icon="🧑‍🤝‍🧑"
			label={$t('dashboard.statParticipants')}
			value={trips.length === 0 ? '0' : allMembersLoaded ? String(totalParticipants) : '—'}
			delta="↑ 15%"
			hint={$t('dashboard.fromLastMonth')}
			tone="orange"
		/>
		<StatCard
			icon="✓"
			label={$t('dashboard.statFinished')}
			value={String(finishedTrips)}
			delta="↑ 22%"
			hint={$t('dashboard.fromLastMonth')}
			tone="purple"
		/>
	</StatGrid>
{/snippet}

{#snippet kindStripSnippet()}
	<!-- File-10 overview kind strip. Counts come from the real trip
	     list (same fields the Trips page filters on). Clicking a chip
	     filters the Trip Aktif column in place. -->
	<div class="chips" role="group" aria-label={$t('dashboard.statTrips')}>
		<button
			class="chip"
			class:active={summaryKindFilter === 'ALL'}
			onclick={() => (summaryKindFilter = 'ALL')}
		>
			◎ {$t('dashboard.stripAll')} <b>{trips.length}</b>
		</button>
		<button
			class="chip"
			class:active={summaryKindFilter === 'HIKING'}
			onclick={() => (summaryKindFilter = 'HIKING')}
		>
			⛰️ {$t('dashboard.stripHiking')} <b>{trips.filter((trip) => trip.type === 'HIKING').length}</b>
		</button>
		<button
			class="chip"
			class:active={summaryKindFilter === 'TOURING'}
			onclick={() => (summaryKindFilter = 'TOURING')}
		>
			🏍️ {$t('dashboard.stripTouring')} <b>{trips.filter((trip) => trip.type === 'TOURING').length}</b>
		</button>
		<button
			class="chip"
			class:active={summaryKindFilter === 'OPEN'}
			onclick={() => (summaryKindFilter = 'OPEN')}
		>
			○ {$t('trips.openTrip')}
		</button>
		<button
			class="chip"
			class:active={summaryKindFilter === 'PRIVATE'}
			onclick={() => (summaryKindFilter = 'PRIVATE')}
		>
			🔒 {$t('trips.privateTrip')} <b>{trips.filter((trip) => !trip.isOpenTrip).length}</b>
		</button>
		<button
			class="chip"
			class:active={showMountains}
			aria-pressed={showMountains}
			onclick={() => {
				showMountains = !showMountains;
				void updateMap();
			}}
		>
			🏔️ {$t('dashboard.stripMountains')}
		</button>
	</div>
{/snippet}

{#snippet tripsSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.trips')}</h2>
		<input
			class="search-input"
			type="search"
			bind:value={tripSearch}
			placeholder={$t('dashboard.tripSearch')}
			aria-label={$t('dashboard.tripSearch')}
		/>
		<div class="chips" role="group">
			<button
				class="chip"
				class:active={tripKindFilter === 'ALL'}
				onclick={() => (tripKindFilter = 'ALL')}
			>
				{$t('common.all')}
			</button>
			<button
				class="chip"
				class:active={tripKindFilter === 'HIKING'}
				onclick={() => (tripKindFilter = 'HIKING')}
			>
				{$t('trips.types.HIKING')}
			</button>
			<button
				class="chip"
				class:active={tripKindFilter === 'TOURING'}
				onclick={() => (tripKindFilter = 'TOURING')}
			>
				{$t('trips.types.TOURING')}
			</button>
			<button
				class="chip"
				class:active={tripKindFilter === 'OPEN'}
				onclick={() => (tripKindFilter = 'OPEN')}
			>
				{$t('trips.openTrip')}
			</button>
			<button
				class="chip"
				class:active={tripKindFilter === 'PRIVATE'}
				onclick={() => (tripKindFilter = 'PRIVATE')}
			>
				{$t('trips.privateTrip')}
			</button>
		</div>
		{#if trips.length === 0}
			<p class="muted">{$t('trips.empty')}</p>
		{:else if filteredTrips.length === 0}
			<p class="muted">{$t('dashboard.noTripMatch')}</p>
		{:else}
			<div class="mountains-table-wrap">
				<table class="mountains-table">
					<thead>
						<tr>
							<th>{$t('dashboard.tableName')}</th>
							<th>{$t('dashboard.tripsTableDate')}</th>
							<th>{$t('dashboard.tripsTableType')}</th>
							<th>{$t('dashboard.tripsTableStatus')}</th>
							<th>{$t('dashboard.tripsTableVisibility')}</th>
							<th>{$t('dashboard.tripsTableParticipants')}</th>
							<th>{$t('dashboard.tableAction')}</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredTrips as trip (trip.id)}
							<tr
							class:selected={trip.id === selectedId}
							tabindex="0"
							onclick={() => void selectTrip(trip.id)}
							onkeydown={(e) => {
								if (e.key !== 'Enter' && e.key !== ' ') return;
								const target = e.target as HTMLElement;
								if (target.closest('button, a, input, select, textarea')) return;
								e.preventDefault();
								void selectTrip(trip.id);
							}}
						>
								<td><span class="trip-name">{trip.name}</span></td>
								<td>{fmtTripDate(trip.date)}</td>
								<td><span class="pill teal">{$t(`trips.types.${trip.type}`)}</span></td>
								<td>
									<span
										class="pill"
										class:green={trip.status === 'ACTIVE'}
										class:orange={trip.status === 'PLANNED' && !isTripExpired(trip)}
										class:grey={trip.status === 'CLOSED' || isTripExpired(trip)}
									>
										{isTripExpired(trip)
											? $t('trips.statuses.EXPIRED')
											: $t(`trips.statuses.${trip.status}`)}
									</span>
								</td>
								<td>
									<span class="pill grey">
										{trip.isOpenTrip ? $t('trips.openTrip') : $t('trips.privateTrip')}
									</span>
								</td>
								<td>
									👥 {allMembers.filter((m) => m.tripId === trip.id).length}{trip.quota
										? `/${trip.quota}`
										: ''}
									{$t('trips.participants')}
								</td>
								<td>
									<div class="mountains-actions">
										<button
											class="mountains-action-btn edit"
											onclick={(e) => {
												e.stopPropagation();
												// Halaman detail trip (perintah Wella 2 Nov
												// 2026): tombol ini membuka tampilan detail
												// tersendiri. Klik baris tabel (tanpa tombol)
												// tetap selectTrip + fokus tertunda ke
												// Ringkasan seperti sebelumnya (PR #159).
												void openTripDetail(trip.id);
											}}
										>
											{$t('dashboard.viewTrip')}
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		<button class="secondary" onclick={() => void loadMeAndTrips()}>
			{$t('common.refresh')}
		</button>
	</div>
{/snippet}

{#snippet mapSnippet(withStrip: boolean = false)}
	<div class="card">
		{#if withStrip}
			<!-- File-10 map card: the kind filter strip lives inside the
			     map card, above the map. -->
			{@render kindStripSnippet()}
		{:else}
			<div class="card-head">
				<h2>
					{$t('map.title')}
					{#if selectedTrip}— {selectedTrip.name}{/if}
				</h2>
				<span class="live-badge" class:off={!live}>
					<span class="live-dot"></span>
					{live ? $t('common.live') : $t('common.offline')}
				</span>
			</div>
		{/if}
		<div class="map" bind:this={mapEl}></div>
		{#if locations.length === 0 && sosList.length === 0}
			<p class="muted">{$t('map.empty')}</p>
		{/if}
		<p class="legend">
			<span><span class="dot leader"></span>{$t('map.legendLeader')}</span>
			<span><span class="dot sweeper"></span>{$t('map.legendSweeper')}</span>
			<span><span class="dot medic"></span>{$t('map.legendMedic')}</span>
			<span><span class="dot member"></span>{$t('map.legendMember')}</span>
			<span><span class="dot sos"></span>{$t('map.legendSos')}</span>
			<span><span class="dot trip-active"></span>{$t('map.legendTripActive')}</span>
			<span><span class="dot trip-upcoming"></span>{$t('map.legendTripUpcoming')}</span>
			<span><img class="legend-pin" src="/mountain-pin.png" alt="" />{$t('map.legendMountain')}</span>
		</p>
	</div>
{/snippet}

{#snippet tripDetailSnippet()}
	<!-- Restyle 3 Nov 2026 (PR #187): detail trip mengikuti pola kartu
	     halaman pantau — hero teal, kartu info, kartu peta, kartu
	     anggota (bukan bullet list), kartu SOS hijau/merah — lalu
	     kartu Ringkasan AI + Laporan di bawah (dari commit 84dd746),
	     keduanya hanya bila trip sudah CLOSED (aturan Wella 3 Nov:
	     ringkasan tidak tampil untuk trip yang belum selesai).
	     Logika tidak berubah: state tetap detailTrip/detailMembers/
	     detailLocations/detailSos, peta tetap updateDetailMap, tombol
	     Kembali tetap ada; tombol Lihat di Ringkasan (klarifikasi
	     Wella 18:19) bukan lagi pindah menu — ia anchor scroll ke
	     kartu Ringkasan di bawah (id trip-detail-ai-summary).
	     Yang TIDAK ditiru
	     dari pantau: bar autorefresh (detail admin bukan halaman
	     publik live), dot Online + koordinat per anggota (data
	     dashboard tidak punya status online; posisi live tetap di
	     peta), tombol Direction/fokus per anggota (peta detail
	     sudah menampilkan posisi + SOS). -->
	<div class="td-wrap">
		<div class="td-actions">
			<button
				class="secondary"
				onclick={() => {
					activeMenu = 'trips';
				}}
			>
				{$t('tripDetail.back')}
			</button>
			{#if detailTrip && detailTrip.status === 'CLOSED'}
				<button
					class="mountains-action-btn edit"
					onclick={() => {
						document
							.getElementById('trip-detail-ai-summary')
							?.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}}
				>
					{$t('tripDetail.viewInSummary')}
				</button>
			{/if}
		</div>
		{#if detailTrip}
			<section class="td-hero">
				<small>{$t('tripDetail.title')}</small>
				<h1>{detailTrip.name}</h1>
				<div class="td-hero-row">
					<span class="td-pill">{$t(`trips.types.${detailTrip.type}`)}</span>
					<span class="td-pill">
						{isTripExpired(detailTrip)
							? $t('trips.statuses.EXPIRED')
							: $t(`trips.statuses.${detailTrip.status}`)}
					</span>
					<span class="td-pill">
						{#if detailVisibility === 'paid'}
							{$t('tripDetail.paid')}
						{:else if detailVisibility === 'public'}
							{$t('trips.openTrip')}
						{:else}
							{$t('trips.privateTrip')}
						{/if}
					</span>
					<span class="td-pill solid">
						👥 {detailMembers.length}{detailTrip.quota ? `/${detailTrip.quota}` : ''}
						{$t('trips.participants')}
					</span>
				</div>
			</section>

			<section class="td-card">
				<div class="td-info-row">
					<span class="td-info-label">{$t('tripDetail.date')}</span>
					<span>{fmtTripDate(detailTrip.date)}</span>
				</div>
				<div class="td-info-row">
					<span class="td-info-label">{$t('tripDetail.meetingPoint')}</span>
					<span>{detailTrip.meetingPoint}</span>
				</div>
				{#if detailTrip.type === 'TOURING' && detailTrip.destination}
					<div class="td-info-row">
						<span class="td-info-label">{$t('tripDetail.destination')}</span>
						<span>{detailTrip.destination}</span>
					</div>
				{/if}
				<div class="td-info-row">
					<span class="td-info-label">{$t('tripDetail.quota')}</span>
					<span>{detailTrip.quota ?? $t('tripDetail.noQuota')}</span>
				</div>
			</section>

			<section class="td-card">
				<h2>{$t('tripDetail.mapTitle')}</h2>
				<div class="map" bind:this={detailMapEl}></div>
				{#if detailLocations.length === 0 && detailSos.length === 0}
					<p class="muted">{$t('map.empty')}</p>
				{/if}
			</section>

			<section class="td-card">
				<h2>{$t('tripDetail.members')} ({detailMembers.length})</h2>
				{#if detailMembers.length === 0}
					<p class="muted">{$t('tripDetail.noMembers')}</p>
				{:else}
					{#each detailMembers as member (member.userId)}
						{@const memberName = member.user?.name ?? member.userId}
						<div class="td-member">
							<div class="td-avatar" aria-hidden="true">
								{memberName.charAt(0).toUpperCase() || '?'}
							</div>
							<div class="td-member-info">
								<div class="td-member-name">
									{memberName}
									<span class="td-badge">{$t(`roles.${member.role}`)}</span>
								</div>
								<div class="td-member-line">
									<span
										class="td-role-dot"
										style="background:{tripDetailRoleColor(member.role)}"
									></span>
									{member.attendance === 'DEPARTED'
										? $t('tripDetail.departed')
										: $t('tripDetail.notDeparted')}
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</section>

			<section class="td-card">
				<h2>{$t('tripDetail.sos')} ({detailSos.length})</h2>
				{#if detailSos.length === 0}
					<div class="td-sos">
						<div class="td-sos-check" aria-hidden="true">✓</div>
						<div>
							<b>{$t('tripDetail.noSos')}</b>
							<p>{$t('tripDetail.noSosNote')}</p>
						</div>
					</div>
				{:else}
					<div class="td-sos danger">
						<div class="td-sos-check" aria-hidden="true">!</div>
						<div class="td-sos-list">
							{#each detailSos as alert (alert.id)}
								<div class="td-sos-row">
									<b>{$t(`sosReasons.${alert.reason}`) || alert.reason}</b>
									<span class="pill-status grey">{$t(`sos.statuses.${alert.status}`)}</span>
									<span class="muted">
										{$t('sos.sender')}: {alert.senderName ?? alert.senderId} ·
										{$t('sos.time')}: {relativeTime(alert.createdAt, displayLocale)}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			{#if detailTrip.status === 'CLOSED'}
				{@render aiSummarySnippet()}
			{/if}
			{#if detailTrip.status === 'CLOSED'}
				{@render tripReportSnippet()}
			{/if}
		{:else}
			<p class="muted">{$t('tripDetail.notFound')}</p>
		{/if}
	</div>
{/snippet}

{#snippet sosSnippet()}
	<div class="page-view active">
		<div class="page-head">
			<h1>{$t('sos.pageTitle')}</h1>
			<p>{$t('sos.pageSubtitle')}</p>
		</div>
		<div class="toolbar">
			<span class="pill" style="color:#b91c1c">
				🚨 <span id="sosSignalLabel">{activeSosList.length === 0 ? $t('sos.noActiveSignals') : `${activeSosList.length} ${$t('sos.activeSignals')}`}</span>
			</span>
			<span class="pill">
				🛰️ <span id="sosMonitorLabel">{activeTrips.length} {$t('sos.tripsMonitored')} · {monitoredParticipants} {$t('sos.participantsInField')}</span>
			</span>
		</div>
		<div class="list-card" id="sosList">
			{#if activeSosList.length > 0}
				{#each activeSosList as alert (alert.id)}
					{@const tr = alertTrip(alert.tripId)}
					<div class="row-item sos-alert-row">
						<div class="sos-alert-icon" aria-hidden="true">🚨</div>
						<div class="row-info">
							<h3>
								{$t(`sosReasons.${alert.reason}`) || alert.reason}
								<span
									class="pill-status"
									class:red={alert.level === 'EMERGENCY'}
									class:orange={alert.level === 'URGENT'}
									class:blue={alert.level === 'HELP'}
								>
									{alert.level}
								</span>
								<span class="pill-status grey">{$t(`sos.statuses.${alert.status}`)}</span>
								{#if tr}
									<span class="pill-status {getTripStatus(tr).tone}">
										{getTripStatus(tr).label}
									</span>
								{/if}
							</h3>
							<p>
								{$t('sos.sender')}: {alert.senderName ?? alert.senderId} · {$t('sos.time')}: {relativeTime(alert.createdAt, displayLocale)}
								{#if tr}
									· Trip: {tr.name}
								{/if}
							</p>
						</div>
						<div class="spacer">
							<div class="btn-row" style="justify-content: flex-end">
								{#if alert.status !== 'RESOLVED' && alert.status !== 'CANCELLED'}
									<button
										type="button"
										class="btn-sm btn-ghost-sm"
										onclick={() => void acknowledge(alert)}
									>
										{$t('sos.acknowledge')}
									</button>
									<button
										type="button"
										class="btn-sm btn-danger-sm"
										onclick={() => void markDone(alert)}
									>
										{$t('sos.markDone')}
									</button>
								{/if}
								<button
									type="button"
									class="btn-sm btn-ghost-sm"
									onclick={() => {
										activeMenu = 'summary';
										void selectTrip(alert.tripId, true);
									}}
								>
									{$t('sos.viewOnMapBtn')}
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}

			{#if activeTrips.length === 0 && activeSosList.length === 0}
				<p class="empty-note">{$t('sos.emptyActiveTrips')}</p>
			{:else}
				{#each activeTrips as trip (trip.id)}
					{@const statusInfo = getTripStatus(trip)}
					<div class="row-item">
						{#if trip.image}
							<img class="thumb" src={trip.image} alt={trip.name} loading="lazy" />
						{:else}
							<div class="thumb-fallback" aria-hidden="true">
								{trip.type === 'HIKING' ? '🥾' : '🏍️'}
							</div>
						{/if}
						<div class="row-info">
							<h3>{trip.name}</h3>
							<p>
								{trip.meetingPoint || $t(`trips.types.${trip.type}`)} · 👥 {joinedCount(trip.id)} / {trip.quota ?? '—'} {$t('trips.participants')}
								{#if getTripOrganizer(trip)}
									· {$t('sos.organizerLabel')}: {getTripOrganizer(trip)}
								{/if}
							</p>
						</div>
						<div class="spacer">
							<span class="pill-status {statusInfo.tone}">
								{statusInfo.label}
							</span>
							<div class="btn-row" style="justify-content: flex-end">
								<button
									type="button"
									class="btn-sm btn-ghost-sm"
									onclick={() => window.open('/safety', '_blank', 'noopener')}
								>
									{$t('sos.liveMapBtn')}
								</button>
								<button
									type="button"
									class="btn-sm btn-ghost-sm"
									onclick={() => {
										activeMenu = 'summary';
										void selectTrip(trip.id, true);
									}}
								>
									{$t('sos.viewOnMapBtn')}
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>
		<p class="kit-note" style="margin-top: 10px">
			{activeSosList.length === 0 ? $t('sos.sessionNote') : $t('sos.sessionNoteWithSignals')}
		</p>
	</div>
{/snippet}



{#snippet activeTripsSnippet()}
	<div class="card">
		<div class="section-head">
			<h2>{$t('dashboard.activeTrips')}</h2>
			<button class="link-btn" onclick={() => (activeMenu = 'trips')}>
				{$t('dashboard.viewAll')}
			</button>
		</div>
		<div class="tabs" role="group">
			<button class:active={activeTab === 'ALL'} onclick={() => (activeTab = 'ALL')}>
				{$t('common.all')} {activeTrips.length}
			</button>
			<button class:active={activeTab === 'HIKING'} onclick={() => (activeTab = 'HIKING')}>
				{$t('dashboard.stripHiking')} {activeTrips.filter((t) => t.type === 'HIKING').length}
			</button>
			<button class:active={activeTab === 'TOURING'} onclick={() => (activeTab = 'TOURING')}>
				{$t('dashboard.stripTouring')} {activeTrips.filter((t) => t.type === 'TOURING').length}
			</button>
		</div>
		{#if trips.length === 0}
			<p class="muted">{$t('trips.empty')}</p>
		{:else if filteredActiveTrips.length === 0}
			<p class="muted">
				{activeTab === 'ALL' && !tripSearch.trim()
					? $t('dashboard.noActiveTrips')
					: $t('dashboard.noTripMatch')}
			</p>
		{:else}
			{#each filteredActiveTrips as trip (trip.id)}
				<button
					class="trip"
					class:sel={trip.id === selectedId}
					onclick={() => void selectTrip(trip.id)}
				>
					{#if trip.image}
						<img class="trip-img" src={trip.image} alt={trip.name} loading="lazy" />
					{/if}
					<span class="trip-main">
						<span class="status s-green"><i></i>{$t(`trips.statuses.${trip.status}`)}</span>
						<h3>{trip.name}</h3>
						{#if trip.meetingPoint}<p>{trip.meetingPoint}</p>{/if}
						<p>👥 {joinedCount(trip.id)} / {trip.quota ?? '—'} {$t('trips.participants')}</p>
					</span>
					<span class="meta">
						<span class="mini-faces">
							{#each joinedFaces(trip.id) as face (face.userId)}
								<span>{face.initial}</span>
							{/each}
						</span>
						{#if trip.note}<span class="trip-note">{trip.note}</span>{/if}
						<span class="trip-chevron" aria-hidden="true">›</span>
					</span>
				</button>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet upcomingTripsSnippet()}
	<div class="card">
		<div class="section-head">
			<h2>{$t('dashboard.upcomingTrips')}</h2>
			<button class="link-btn" onclick={() => (activeMenu = 'trips')}>
				{$t('dashboard.viewAll')}
			</button>
		</div>
		{#if trips.length === 0}
			<p class="muted">{$t('trips.empty')}</p>
		{:else if upcomingTrips.length === 0}
			<p class="muted">{$t('dashboard.noUpcomingTrips')}</p>
		{:else}
			{#each upcomingTrips as trip (trip.id)}
				<div class="upcoming">
					<div class="datebox">
						<b>{tripDateBox(trip.date).day}</b>
						<span>{tripDateBox(trip.date).month}</span>
					</div>
					{#if trip.image}
						<img class="up-img" src={trip.image} alt={trip.name} loading="lazy" />
					{/if}
					<div class="up-body">
						<h4>{trip.name}</h4>
						<p>
							{#if trip.meetingPoint}{trip.meetingPoint}<br />{/if}
							{joinedCount(trip.id)} / {trip.quota ?? '—'} {$t('trips.participants')}
						</p>
					</div>
					{#if trip.quota}
						<span class="avail" class:full={joinedCount(trip.id) >= trip.quota}>
							{joinedCount(trip.id) >= trip.quota
								? $t('trips.full')
								: $t('trips.available')}
						</span>
					{:else}
						<span class="avail">{$t('trips.available')}</span>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet routesSnippet()}
	<div class="card">
		<div class="section-head">
			<h2>{$t('dashboard.popularRoutes')}</h2>
			<button class="link-btn" onclick={() => (activeMenu = 'trips')}>
				{$t('dashboard.viewAll')}
			</button>
		</div>
		{#if popularRoutes.length === 0}
			<p class="muted">{$t('dashboard.noRoutes')}</p>
		{:else}
			{#each popularRoutes as route, index (route.place)}
				<div class="route-row">
					<span
						class="rank-num"
						aria-hidden="true"
						style="background: {rankPalette[index % rankPalette.length]}"
					>
						{index + 1}
					</span>
					{#if route.image}
						<img class="rank-img" src={route.image} alt="" loading="lazy" />
					{/if}
					<span class="route-name">
						<span class="rank-title">{route.place}</span>
						{#if route.loc}<span class="rank-loc">📍 {route.loc}</span>{/if}
					</span>
					<span class="rmeta">
						<b>{route.count} {$t('trips.participants')}</b>
						{#if route.up !== null}<span class="up">↑ {route.up}%</span>{/if}
					</span>
				</div>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet aiSummarySnippet()}
	<div class="card" id="trip-detail-ai-summary">
		<div class="section-head">
			<h2>{$t('dashboard.aiSummaryTitle')}</h2>
			<span class="pill teal">{$t('dashboard.aiSummaryAttribution')}</span>
		</div>
		<p class="muted">{$t('dashboard.aiSummaryNote')}</p>
		{#if aiErrorCode}
			<div class="error">{$t(errToKey(aiErrorCode))}</div>
		{/if}
		{#if aiSummary}
			<p class="ai-summary-text">{aiSummary}</p>
			{#if aiModel}
				<p class="muted">{aiModel}</p>
			{/if}
		{/if}
		<button disabled={aiLoading || !detailTrip} onclick={() => void generateAiSummary()}>
			{aiLoading ? $t('dashboard.aiSummaryLoading') : $t('dashboard.aiSummaryButton')}
		</button>
	</div>
{/snippet}

{#snippet tripReportSnippet()}
	<div class="card">
		<div class="section-head">
			<h2>{$t('dashboard.tripReportTitle')}</h2>
			{#if tripReport?.model}
				<span class="pill teal">{$t('dashboard.aiSummaryAttribution')}</span>
			{/if}
		</div>
		{#if tripReportErrorCode}
			<div class="error">{$t(errToKey(tripReportErrorCode))}</div>
		{/if}
		{#if tripReport}
			{#if tripReport.isRegenerated}
				<p class="muted">
					{$t('dashboard.tripReportRegeneratedNote', {
						version: String(tripReport.version)
					})}
				</p>
			{/if}
			<p class="ai-summary-text">{tripReport.summary}</p>
			<p class="muted">
				{$t('dashboard.tripReportAttendance')}: {tripReport.facts.departedCount}/{tripReport
					.facts.memberCount} · {$t('dashboard.tripReportSos')}: {tripReport.facts.sosTotal}
				{#each tripReport.facts.sosByReason as sos (sos.reason)}
					· {sos.reason} ×{sos.count}
				{/each}
			</p>
			<ul>
				{#each tripReport.facts.attendance as member (member.userId)}
					<li>
						{member.name} — {member.attendance} · {member.checkInCount} check-in
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">{$t('dashboard.tripReportNone')}</p>
		{/if}
		{#if isStaffAdmin}
			<button
				disabled={tripReportLoading || !detailTrip}
				onclick={() => void generateTripReport()}
			>
				{tripReportLoading
					? $t('dashboard.tripReportLoading')
					: tripReport
						? $t('dashboard.tripReportRegenerate')
						: $t('dashboard.tripReportGenerate')}
			</button>
		{/if}
	</div>
{/snippet}

{#snippet activitySnippet()}
	<div class="card">
		<div class="section-head">
			<h2>{$t('dashboard.recentActivity')}</h2>
			<button class="link-btn" onclick={() => (activeMenu = 'sos')}>
				{$t('dashboard.viewAll')}
			</button>
		</div>
		{#if sosList.length === 0 && alerts.length === 0}
			<p class="muted">{$t('dashboard.noActivity')}</p>
		{:else}
			{#each sosList.slice(0, 5) as alert (alert.id)}
				<div class="act-item">
					<span class="act-ic sos" aria-hidden="true">🚨</span>
					<div class="act-body">
						<div class="who">{$t(`sosReasons.${alert.reason}`)}</div>
						<div class="muted">
							{$t('sos.sender')}: {alert.senderName ?? alert.senderId} ·
							{$t(`sos.statuses.${alert.status}`)}
						</div>
					</div>
					<time class="act-time">{relativeTime(alert.createdAt, displayLocale)}</time>
				</div>
			{/each}
			{#each alerts.slice(0, 5) as alert (alert.userId + alert.lastSeen)}
				<div class="act-item">
					<span class="act-ic member" aria-hidden="true">👤</span>
					<div class="act-body">
						<div class="who">{alert.userName ?? alert.userId}</div>
						<div class="muted">{$t('safety.lastSeen')}</div>
					</div>
					<time class="act-time">{relativeTime(alert.lastSeen, displayLocale)}</time>
				</div>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet proposalsSnippet()}
	<section class="verify-page" aria-labelledby="proposals-page-title">
		<header class="verify-page-head">
			<h1 id="proposals-page-title">{$t('dashboard.menus.proposals')}</h1>
			<p>{$t('dashboard.proposalsDesc')}</p>
		</header>
		<div class="verify-list-card" aria-live="polite">
			{#if !proposalsLoaded}
				<p class="verify-empty">{$t('common.loading')}</p>
			{:else if proposalMountains.length === 0 && proposalRoutes.length === 0}
				<p class="verify-empty">{$t('dashboard.proposalsEmpty')}</p>
			{:else}
				{#if proposalMountains.length > 0}
					<h2>{$t('dashboard.proposalsMountains')}</h2>
					<div class="mountains-table-wrap">
						<table class="mountains-table">
							<thead>
								<tr>
									<th>{$t('dashboard.tableName')}</th>
									<th>{$t('dashboard.proposalsLocation')}</th>
									<th>{$t('dashboard.proposalsProposer')}</th>
									<th>{$t('dashboard.proposalsSubmitted')}</th>
									<th>{$t('dashboard.proposalsWarning')}</th>
									<th>{$t('dashboard.tableAction')}</th>
								</tr>
							</thead>
							<tbody>
								{#each proposalMountains as p (p.id)}
									<tr>
										<td>
											<span class="trip-name">{p.name}</span>
											{#if p.elevationM}<br /><span>{p.elevationM} mdpl</span>{/if}
										</td>
										<td>{p.location}<br /><span>{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</span></td>
										<td>{p.proposer?.name ?? '—'}</td>
										<td>{relativeTime(p.createdAt, $locale)}</td>
										<td>
											{#if p.duplicateName}<span>⚠️ {$t('dashboard.proposalsWarnName')}</span><br />{/if}
											{#if p.duplicateNearby}<span>⚠️ {$t('dashboard.proposalsWarnNearby')}</span>{/if}
											{#if !p.duplicateName && !p.duplicateNearby}—{/if}
										</td>
										<td>
											<div class="mountains-actions">
												<button
													class="mountains-action-btn toggle-on"
													disabled={proposalBusyId !== null}
													onclick={() => void decideProposal('mountain', p.id, p.name, true)}
												>
													{$t('dashboard.proposalsApprove')}
												</button>
												<button
													class="mountains-action-btn delete"
													disabled={proposalBusyId !== null}
													onclick={() => void decideProposal('mountain', p.id, p.name, false)}
												>
													{$t('dashboard.proposalsReject')}
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				{#if proposalRoutes.length > 0}
					<h2>{$t('dashboard.proposalsRoutes')}</h2>
					<div class="mountains-table-wrap">
						<table class="mountains-table">
							<thead>
								<tr>
									<th>{$t('dashboard.tableName')}</th>
									<th>{$t('dashboard.proposalsMountain')}</th>
									<th>{$t('dashboard.proposalsCheckpoints')}</th>
									<th>{$t('dashboard.proposalsProposer')}</th>
									<th>{$t('dashboard.proposalsSubmitted')}</th>
									<th>{$t('dashboard.proposalsWarning')}</th>
									<th>{$t('dashboard.tableAction')}</th>
								</tr>
							</thead>
							<tbody>
								{#each proposalRoutes as p (p.id)}
									<tr>
										<td><span class="trip-name">{p.name}</span></td>
										<td>{p.mountainName ?? p.mountainId}</td>
										<td>
											<button
												class="mountains-action-btn edit"
												onclick={() =>
													(proposalDetailRoute =
														proposalDetailRoute?.id === p.id ? null : p)}
											>
												{$t('dashboard.proposalsViewCheckpoints', {
													count: String(p.posts.length)
												})}
											</button>
											{#if proposalDetailRoute?.id === p.id}
												<ol>
													{#each p.posts as post (post.id)}
														<li>
															{post.name} — {post.lat.toFixed(5)}, {post.lon.toFixed(5)}
															{#if post.isGathering}
																<strong> ({$t('dashboard.proposalsGathering')})</strong>
															{/if}
														</li>
													{/each}
												</ol>
											{/if}
										</td>
										<td>{p.proposer?.name ?? '—'}</td>
										<td>{relativeTime(p.createdAt, $locale)}</td>
										<td>
											{#if p.duplicateName}<span>⚠️ {$t('dashboard.proposalsWarnName')}</span>{/if}
											{#if !p.duplicateName}—{/if}
										</td>
										<td>
											<div class="mountains-actions">
												<button
													class="mountains-action-btn toggle-on"
													disabled={proposalBusyId !== null}
													onclick={() => void decideProposal('route', p.id, p.name, true)}
												>
													{$t('dashboard.proposalsApprove')}
												</button>
												<button
													class="mountains-action-btn delete"
													disabled={proposalBusyId !== null}
													onclick={() => void decideProposal('route', p.id, p.name, false)}
												>
													{$t('dashboard.proposalsReject')}
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
		{#if proposalRejectTarget}
			<div
				class="mountains-modal-backdrop"
				role="presentation"
				onclick={(e) => {
					if (e.target === e.currentTarget) proposalRejectTarget = null;
				}}
				onkeydown={(e) => {
					if (e.key === 'Escape') proposalRejectTarget = null;
				}}
			>
				<div
					class="mountains-modal"
					use:focusTrap
					role="dialog"
					aria-modal="true"
					aria-label={$t('dashboard.proposalsRejectConfirm', {
						name: proposalRejectTarget.name
					})}
				>
					<div class="mountains-modal-head">
						<h3>
							{$t('dashboard.proposalsRejectConfirm', { name: proposalRejectTarget.name })}
						</h3>
						<button
							class="mountains-modal-close"
							type="button"
							onclick={() => (proposalRejectTarget = null)}
						>
							&times;
						</button>
					</div>
					<form class="mountains-edit-grid" onsubmit={confirmRejectProposal}>
						<label for="proposal-reject-reason">
							{$t('dashboard.proposalsRejectReasonLabel')}
						</label>
						<textarea
							id="proposal-reject-reason"
							bind:value={proposalRejectReason}
							placeholder={$t('dashboard.proposalsRejectReasonPlaceholder')}
							rows="3"
						></textarea>
						<div class="row-actions">
							<button class="mountains-action-btn delete" type="submit">
								{$t('dashboard.proposalsReject')}
							</button>
							<button
								class="mountains-action-btn"
								type="button"
								onclick={() => (proposalRejectTarget = null)}
							>
								{$t('dashboard.proposalsRejectCancel')}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	</section>
{/snippet}

{#snippet verifySnippet()}
	<section class="verify-page" aria-labelledby="verify-page-title">
		<header class="verify-page-head">
			<h1 id="verify-page-title">{$t('dashboard.menus.organizerVerification')}</h1>
			<p>{$t('dashboard.verifyDesc')} {$t('dashboard.verifyCountMatchesBadge')}</p>
		</header>
		<div class="verify-toolbar" aria-label={$t('dashboard.menus.organizerVerification')}>
			<span class="verify-pill">🛡️ {pendingVerifications.length} {$t('dashboard.verifyPending')}</span>
			<span class="verify-pill">{$t('dashboard.verifyNote')}</span>
		</div>
		<div class="verify-list-card" aria-live="polite">
			{#if !verifyLoaded}
				<p class="verify-empty">{$t('common.loading')}</p>
			{:else if pendingVerifications.length === 0}
				<p class="verify-empty">{$t('dashboard.verifyEmpty')}</p>
			{:else}
				<div class="mountains-table-wrap">
					<table class="mountains-table">
						<thead>
							<tr>
								<th>{$t('dashboard.tablePhoto')}</th>
								<th>{$t('dashboard.tableName')}</th>
								<th>{$t('dashboard.verifyTableDetail')}</th>
								<th>{$t('dashboard.verifyTableKtp')}</th>
								<th>{$t('dashboard.verifyTableSubmitted')}</th>
								<th>{$t('dashboard.verifyTableStatus')}</th>
								<th>{$t('dashboard.tableAction')}</th>
							</tr>
						</thead>
						<tbody>
							{#each pendingVerifications as person (person.id)}
								{@const verification = formatOrganizerVerification(person, $locale)}
								<tr>
									<td>
										{#if person.avatarUrl && !failedVerificationAvatars.includes(person.id)}
											<img
												class="verify-avatar"
												src={person.avatarUrl}
												alt={`${$t('dashboard.verifyPhotoAlt')} ${person.user.name}`}
												onerror={() => markVerificationAvatarFailed(person.id)}
											/>
										{:else}
											<span class="verify-avatar verify-avatar-fallback" aria-hidden="true">
												{verification.initials}
											</span>
										{/if}
									</td>
									<td><span class="trip-name">{person.user.name}</span></td>
									<td>{verification.detail}</td>
									<td>
										{person.hasIdentityDocument
											? $t('dashboard.verifyKtpPresent')
											: $t('dashboard.verifyKtpAbsent')}
									</td>
									<td>{verification.submittedTime}</td>
									<td><span class="verify-status">{$t('dashboard.verifyWaiting')}</span></td>
									<td>
										<div class="mountains-actions">
											<button
												class="mountains-action-btn edit"
												onclick={() => openVerifyDetail(person)}
											>
												{$t('dashboard.verifyViewData')}
											</button>
											<button
												class="mountains-action-btn toggle-on"
												disabled={verificationBusyId !== null}
												onclick={() => void decideVerification(person, true)}
											>
												{$t('dashboard.verifyApprove')}
											</button>
											<button
												class="mountains-action-btn delete"
												disabled={verificationBusyId !== null}
												onclick={() => void decideVerification(person, false)}
											>
												{$t('dashboard.verifyReject')}
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if verifyDetailTarget}
				<div
					class="mountains-modal-backdrop"
					role="presentation"
					onclick={(e) => {
						if (e.target === e.currentTarget) closeVerifyDetail();
					}}
					onkeydown={(e) => {
						if (e.key === 'Escape') closeVerifyDetail();
					}}
				>
					<div class="mountains-modal" use:focusTrap role="dialog" aria-modal="true" aria-label={$t('dashboard.verifyDataTitle')}>
						<div class="mountains-modal-head">
							<h3>{$t('dashboard.verifyDataTitle')} — {verifyDetailTarget.user.name}</h3>
							<button
								type="button"
								class="mountains-modal-close"
								onclick={closeVerifyDetail}
								aria-label={$t('dashboard.mountainsModalClose')}
							>
								×
							</button>
						</div>
						<p>
							{$t('dashboard.verifyOrganizerName')}: {verifyDetailTarget.organizerName ??
								$t('dashboard.verifyMissing')}
						</p>
						<p>
							{$t('dashboard.verifyAddress')}: {verifyDetailTarget.address ??
								$t('dashboard.verifyMissing')}
						</p>
						<p>
							{$t('dashboard.verifyTableKtp')}: {verifyDetailTarget.hasIdentityDocument
								? $t('dashboard.verifyKtpPresent')
								: $t('dashboard.verifyKtpAbsent')}
						</p>
						{#if verifyDetailTarget.hasIdentityDocument}
							<button
								type="button"
								class="mountains-action-btn edit"
								disabled={verifyKtpBusy}
								onclick={() => void openVerifyKtp(verifyDetailTarget!)}
							>
								{$t('dashboard.verifyKtpView')}
							</button>
						{:else}
							<p class="empty-note">{$t('dashboard.verifyKtpMissing')}</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</section>
{/snippet}

{#snippet organizerSnippet()}
	<div class="page-view" id="page-organizer">
		<div class="page-head">
			<h1>{$t('dashboard.menus.organizer')}</h1>
			<p>{$t('dashboard.organizerNote')}</p>
		</div>
		<div class="list-card" id="organizerList">
			{#if !organizerLoaded}
				<p class="empty-note">{$t('common.loading')}</p>
			{:else if organizerItems.length === 0}
				<p class="empty-note">{$t('dashboard.organizerEmpty')}</p>
			{:else}
				<div class="mountains-table-wrap">
					<table class="mountains-table">
						<thead>
							<tr>
								<th>{$t('dashboard.tablePhoto')}</th>
								<th>{$t('dashboard.tableName')}</th>
								<th>{$t('dashboard.organizerTableArea')}</th>
								<th>{$t('dashboard.organizerTableTrip')}</th>
								<th>{$t('dashboard.organizerTableStat')}</th>
								<th>{$t('dashboard.organizerTableRating')}</th>
								<th>{$t('dashboard.tableAction')}</th>
							</tr>
						</thead>
						<tbody>
							{#each organizerItems as org (org.id ?? org.name)}
								<tr>
									<td>
										{#if org.avatar}
											<img class="avatar-lg" src={org.avatar} alt="Foto {org.name}" />
										{:else}
											<span class="avatar-circle" aria-hidden="true">{org.name.slice(0, 1).toUpperCase()}</span>
										{/if}
									</td>
									<td>
										<span class="trip-name">{org.name}</span>
										<span class="pill-status green">{$t('dashboard.organizerVerified')}</span>
									</td>
									<td>{org.area}</td>
									<td>{org.trip}</td>
									<td>{org.stat}</td>
									<td><b>{org.rating}</b></td>
									<td>
										<div class="mountains-actions">
											<button
											class="mountains-action-btn edit"
											disabled={!org.tripId}
											onclick={() => gotoOrganizerTrip(org)}
										>
												{$t('dashboard.viewTrip')}
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet communityPageSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.communityModeration')}</h2>
		<div class="row-actions" style="margin-bottom: 12px">
			<button
				class={communityTab === 'active' ? '' : 'secondary'}
				onclick={() => (communityTab = 'active')}
			>
				{$t('dashboard.communityActiveTab')}
			</button>
			<button
				class={communityTab === 'moderation' ? '' : 'secondary'}
				onclick={() => (communityTab = 'moderation')}
			>
				{$t('dashboard.menus.communityModeration')}
			</button>
		</div>
		{#if communityTab === 'active'}
			{#if !communitiesLoaded}
				<p class="muted">{$t('common.loading')}</p>
			{:else if communities.length === 0}
				<p class="muted">{$t('dashboard.communityEmpty')}</p>
			{:else}
				{#each communities as community (community.id)}
					<div class="row-line">
						<span class="avatar-circle" aria-hidden="true">👥</span>
						<div class="row-main">
							<div class="row-title">{community.name}</div>
							<div class="muted">
								{community.memberCount} {$t('dashboard.communityMembers')}
							</div>
						</div>
						<div class="row-side">
							<div class="row-actions">
								<button class="secondary" onclick={() => void deleteCommunity(community)}>
									{$t('dashboard.communityDelete')}
								</button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		{:else}
			{@render moderationSnippet()}
		{/if}
	</div>
{/snippet}

{#snippet moderationSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.communityModeration')}</h2>
		<p class="muted">{$t('dashboard.moderationNote')}</p>
		{#if modLoaded}
			<p class="muted">
				<span class="pill red">🚩 {modReports.length} {$t('dashboard.moderationOpen')}</span>
			</p>
		{/if}
		{#if !modLoaded}
			<p class="muted">{$t('common.loading')}</p>
		{:else if modReports.length === 0}
			<p class="muted">{$t('dashboard.moderationEmpty')}</p>
		{:else}
			<div class="mountains-table-wrap">
				<table class="mountains-table">
					<thead>
						<tr>
							<th>{$t('dashboard.moderationTableTarget')}</th>
							<th>{$t('dashboard.moderationTableReporter')}</th>
							<th>{$t('dashboard.moderationTableReason')}</th>
							<th>{$t('dashboard.moderationTableDate')}</th>
							<th>{$t('dashboard.membersTableStatus')}</th>
							<th>{$t('dashboard.tableAction')}</th>
						</tr>
					</thead>
					<tbody>
						{#each modReports as report (report.id)}
							<tr>
								<td><span class="trip-name">{report.targetType}</span></td>
								<td>{report.reporterName}</td>
								<td>{report.reason}</td>
								<td>{report.createdAt}</td>
								<td>
									<span class="pill-status red">{$t('dashboard.moderationStatusOpen')}</span>
								</td>
								<td>
									<div class="row-actions">
										<button
											type="button"
											class="mountains-action-btn toggle-on"
											onclick={() => void decideReport(report, 'ACTIONED')}
										>
											{$t('dashboard.moderationAct')}
										</button>
										<button
											type="button"
											class="mountains-action-btn delete"
											onclick={() => void decideReport(report, 'DISMISSED')}
										>
											{$t('dashboard.moderationDismiss')}
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet notificationsSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.notifications')}</h2>
		<p class="muted">{$t('dashboard.notificationsSubtitle')}</p>
		<div class="row-actions" style="margin-bottom: 12px">
			<button onclick={() => void markAllNotificationsRead()}>
				{$t('dashboard.notifMarkAllRead')}
			</button>
			<span class="pill grey">{notifUnreadCount} {$t('dashboard.notifUnread')}</span>
		</div>
		{#if notifList.length === 0}
			<p class="muted">{$t('dashboard.notificationsEmpty')}</p>
		{:else}
			{#each notifList as notif (notif.id)}
				<button
					class="row-line notif-row"
					class:unread={!notif.readAt}
					onclick={() => void openNotification(notif)}
				>
					<span class="avatar-circle" aria-hidden="true">
						{notif.kind === 'SOS_TRIGGERED' ? '🚨' : notif.kind === 'CHECKPOINT_CHECKIN' ? '📍' : '🛡️'}
					</span>
					<div class="row-main">
						<div class="row-title">{$t(`dashboard.notifKinds.${notif.kind}`)}</div>
						{#if notif.actorName}
							<div class="muted">{$t('dashboard.notifBy')}: {notif.actorName}</div>
						{/if}
						<div class="muted">{notif.createdAt}</div>
					</div>
					{#if !notif.readAt}
						<span class="notif-dot" aria-hidden="true"></span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet memberPageSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.members')}</h2>
		{#if isStaffAdmin}
			<!-- Admin: manajemen semua user, bukan anggota trip terpilih. -->
			<p class="muted">{$t('dashboard.membersTotal')}: {adminMembersList.length}</p>
			{#if memberEditNotice}
				<p class="muted">{$t('dashboard.membersEditProfileSaved')}</p>
			{/if}
			<input
				class="search-input"
				type="search"
				bind:value={adminMemberSearch}
				placeholder={$t('dashboard.membersSearchAdmin')}
				aria-label={$t('dashboard.membersSearchAdmin')}
			/>
			{#if !adminMembersLoaded}
				<p class="muted">{$t('common.loading')}</p>
			{:else if filteredAdminMembers.length === 0}
				<p class="muted">{$t('dashboard.membersEmptyAdmin')}</p>
			{:else}
				<div class="mountains-table-wrap">
					<table class="mountains-table">
						<thead>
							<tr>
								<th>{$t('dashboard.tableName')}</th>
								<th>{$t('dashboard.membersTableEmail')}</th>
								<th>{$t('dashboard.membersTablePhone')}</th>
								<th>{$t('dashboard.membersTableCountry')}</th>
								<th>{$t('dashboard.membersTableStatus')}</th>
								<th>{$t('dashboard.tableAction')}</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredAdminMembers as member (member.id)}
								{@const tier = getMemberTier(member.isVerified, adminProIds.has(member.id))}
								<tr>
									<td><span class="trip-name">{member.name}</span></td>
									<td>{member.email}</td>
									<td>{member.phone ?? '—'}</td>
									<td>
										<select
											class="flag-select"
											aria-label={$t('dashboard.membersCountrySelect')}
											disabled={memberBusyId === member.id}
											value={member.country ?? ''}
											onchange={(e) =>
												void changeMemberCountry(
													member,
													(e.currentTarget as HTMLSelectElement).value
												)}
										>
											<option value="">—</option>
											{#each COUNTRY_CODES as code (code)}
												<option value={code}>{countryFlag(code)}</option>
											{/each}
										</select>
									</td>
									<td>
										<span
											class="pill-status {tier === 'pro'
												? 'orange'
												: tier === 'verified'
													? 'green'
													: 'grey'}"
										>
											{$t(`dashboard.membersStatus${tier === 'unverified' ? 'Unverified' : tier === 'verified' ? 'Verified' : 'Pro'}`)}
										</span>
										{#if member.suspendedAt}
											<span class="pill-status red">{$t('dashboard.membersStatusBanned')}</span>
										{/if}
									</td>
									<td>
										<div class="row-actions">
											<button
												type="button"
												class="mountains-action-btn edit"
												disabled={memberBusyId === member.id}
												onclick={() => openEditMember(member)}
											>
												{$t('dashboard.membersEditProfile')}
											</button>
											<button
												type="button"
												class="mountains-action-btn {member.suspendedAt ? 'toggle-on' : 'delete'}"
												disabled={memberBusyId === member.id}
												onclick={() => void toggleMemberBan(member)}
											>
												{$t(
													member.suspendedAt
														? 'dashboard.membersActionUnban'
														: 'dashboard.membersActionBan'
												)}
											</button>
											<button
												type="button"
												class="mountains-action-btn delete"
												disabled={memberBusyId === member.id}
												onclick={() => void deleteAdminMember(member)}
											>
												{$t('dashboard.membersActionDelete')}
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
			{#if editMember}
				<div
					class="mountains-modal-backdrop"
					role="presentation"
					onclick={(e) => {
						if (e.target === e.currentTarget) editMember = null;
					}}
					onkeydown={(e) => {
						if (e.key === 'Escape') editMember = null;
					}}
				>
					<div class="mountains-modal" use:focusTrap role="dialog" aria-modal="true" aria-label={$t('dashboard.membersEditProfileTitle')}>
						<div class="mountains-modal-head">
							<h3>{$t('dashboard.membersEditProfileTitle')}</h3>
							<button
								type="button"
								class="mountains-modal-close"
								onclick={() => (editMember = null)}
								aria-label={$t('dashboard.mountainsModalClose')}
							>
								×
							</button>
						</div>
						<form class="mountains-edit-grid" onsubmit={saveEditMember}>
							{#if editMemberErrorCode}
								<p role="alert">{$t(errToKey(editMemberErrorCode))}</p>
							{/if}
							<label>
								{$t('dashboard.staff.name')}
								<input type="text" bind:value={editMemberName} required />
							</label>
							<label>
								{$t('dashboard.staff.email')}
								<input type="email" bind:value={editMemberEmail} required />
							</label>
							<div class="row-actions">
								<button type="button" class="secondary" onclick={() => (editMember = null)}>
									{$t('dashboard.staff.cancel')}
								</button>
								<button type="submit" disabled={editMemberSaving}>{$t('dashboard.staff.save')}</button>
							</div>
						</form>
					</div>
				</div>
			{/if}
		{:else}
			<p class="muted">{$t('dashboard.membersTotal')}: {members.length}</p>
			<input
				class="search-input"
				type="search"
				bind:value={memberSearch}
				placeholder={$t('dashboard.memberSearch')}
				aria-label={$t('dashboard.memberSearch')}
			/>
			{#if members.length === 0}
				<p class="muted">{$t('dashboard.noMembers')}</p>
			{:else if filteredMembers.length === 0}
				<p class="muted">{$t('dashboard.noMembers')}</p>
			{:else}
				<div class="mountains-table-wrap">
					<table class="mountains-table">
						<thead>
							<tr>
								<th>{$t('dashboard.tableName')}</th>
								<th>{$t('dashboard.membersTableRole')}</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredMembers as member (member.userId)}
								<tr>
									<td><span class="trip-name">{member.user?.name ?? member.userId}</span></td>
									<td>{$t(`roles.${member.role}`)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</div>

{/snippet}

{#snippet mountainsSnippet()}
	<div class="card">
		<h2>{$t('dashboard.menus.mountains')}</h2>
		{#if selectedMountain}
			<button class="link-btn" onclick={() => (selectedMountain = null)}>
				← {$t('dashboard.mountainsBack')}
			</button>
			<h3>{selectedMountain.name}</h3>
			{#if selectedMountain.imageUrl}
				<img class="mountains-thumb-large" src={selectedMountain.imageUrl} alt={selectedMountain.name} />
			{/if}
			<p class="muted">
				{selectedMountain.location} • {selectedMountain.elevationM}
				{$t('dashboard.mountainsElevationUnit')} • {selectedMountain.difficultyKey
					? $t(selectedMountain.difficultyKey)
					: $t('dashboard.mountainsDifficultyUnknown')}
			</p>
			{#if selectedMountain.description}
				<p>{selectedMountain.description}</p>
			{/if}
			<h4>{$t('dashboard.mountainsRoutes')}</h4>
			{#each selectedMountain.routes as route (route.id)}
				<div class="alert-item">
					<div class="who">
						{route.name}{#if route.recommended} • {$t('dashboard.mountainsRecommended')}{/if}
					</div>
					<div class="muted">
						{route.meetingPoint} • {route.distanceKm ?? '—'} km • {route.gainM ?? '—'} m •
						{route.estHours ?? '—'} {$t('dashboard.mountainsHoursUnit')}
					</div>
					{#if route.posts?.length}
						<div class="muted">
							{route.meetingPoint} → {route.posts.join(' → ')}
						</div>
					{/if}
				</div>
			{/each}
		{:else if mountains.length === 0}
			<p class="muted">{$t('dashboard.mountainsEmpty')}</p>
		{:else}
			<div class="row-actions" style="margin-bottom: 12px">
				<button
					class={mountainsTab === 'gunung' ? '' : 'secondary'}
					onclick={() => (mountainsTab = 'gunung')}
				>
					{$t('dashboard.mountainsTabMountains')}
				</button>
				<button
					class={mountainsTab === 'jalur' ? '' : 'secondary'}
					onclick={() => {
						mountainsTab = 'jalur';
						void loadMountainRoutes();
					}}
				>
					{$t('dashboard.mountainsTabRoutes')}
				</button>
			</div>
			{#if mountainsTab === 'gunung'}
			<input
				class="mountains-search"
				type="search"
				placeholder={$t('dashboard.mountainsTableSearch')}
				bind:value={mountainsSearch}
			/>
			{#if editingMountain && isStaffAdmin}
				<div
					class="mountains-modal-backdrop"
					role="presentation"
					onclick={(e) => {
						if (e.target === e.currentTarget) closeMountainEdit();
					}}
					onkeydown={(e) => {
						if (e.key === 'Escape') closeMountainEdit();
					}}
				>
					<div class="mountains-modal" use:focusTrap role="dialog" aria-modal="true" aria-label={$t('dashboard.mountainsEditTitle')}>
						<div class="mountains-modal-head">
							<h3>{$t('dashboard.mountainsEditTitle')}</h3>
							<button
								type="button"
								class="mountains-modal-close"
								onclick={() => closeMountainEdit()}
								aria-label={$t('dashboard.mountainsModalClose')}
							>
								×
							</button>
						</div>
						<form class="mountains-edit-grid" onsubmit={saveMountainEdit}>
					<label>
						{$t('dashboard.mountainsTableName')}
						<input type="text" bind:value={editMountainName} required />
					</label>
					<label>
						{$t('dashboard.mountainsTableLocation')}
						<input type="text" bind:value={editMountainLocation} required />
					</label>
					<label>
						{$t('dashboard.mountainsTableProvince')}
						<input type="text" bind:value={editMountainProvince} />
					</label>
					<label>
						{$t('dashboard.mountainsTableElevation')}
						<input type="number" min="1" bind:value={editMountainElevation} required />
					</label>
					<label>
						{$t('dashboard.mountainsTableDifficulty')}
						<select bind:value={editMountainDifficulty}>
							<option value="">{$t('dashboard.mountainsDifficultyUnknown')}</option>
							<option value="wizard.diffBeginner">{$t('wizard.diffBeginner')}</option>
							<option value="wizard.diffIntermediate">{$t('wizard.diffIntermediate')}</option>
							<option value="wizard.diffAdvanced">{$t('wizard.diffAdvanced')}</option>
						</select>
					</label>
					<label>
						{$t('dashboard.mountainsTableType')}
						<select bind:value={editMountainVolcanoActive}>
							<option value={true}>{$t('dashboard.mountainsTableTypeActive')}</option>
							<option value={false}>{$t('dashboard.mountainsTableTypeInactive')}</option>
						</select>
					</label>
					<label>
						{$t('dashboard.mountainsImageUpload')}
						<input type="file" accept="image/*" onchange={onMountainImageFile} />
						<span class="muted">{$t('dashboard.mountainsImageUploadHint')}</span>
					</label>
					{#if editMountainFilePreview || editMountainImageUrl}
						<img
							class="mountains-thumb-large"
							src={editMountainFilePreview || editMountainImageUrl}
							alt={$t('dashboard.mountainsTableImage')}
						/>
					{/if}
					<label>
						{$t('dashboard.mountainsTableImage')}
						<input type="url" bind:value={editMountainImageUrl} />
					</label>
					<div>
						<button type="submit" disabled={editMountainUploading}>
							{editMountainUploading
								? $t('dashboard.mountainsImageUploading')
								: $t('dashboard.mountainsEditSave')}
						</button>
						<button type="button" onclick={() => closeMountainEdit()}>
							{$t('dashboard.mountainsEditCancel')}
						</button>
					</div>
						</form>
					</div>
				</div>
			{/if}
			<div class="mountains-table-wrap">
				<table class="mountains-table">
					<thead>
						<tr>
							<th>{$t('dashboard.mountainsTableImage')}</th>
							<th>{$t('dashboard.mountainsTableName')}</th>
							<th>{$t('dashboard.mountainsTableLocation')}</th>
							<th>{$t('dashboard.mountainsTableProvince')}</th>
							<th>{$t('dashboard.mountainsTableElevation')}</th>
							<th>{$t('dashboard.mountainsTableDifficulty')}</th>
							<th>{$t('dashboard.mountainsTableType')}</th>
							<th>{$t('dashboard.mountainsTableRoutes')}</th>
							<th>{$t('dashboard.mountainsTableStatus')}</th>
							{#if isStaffAdmin}
								<th>{$t('dashboard.mountainsTableAction')}</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each pagedMountains as mountain (mountain.id)}
							<tr>
								<td>
									{#if mountain.imageUrl}
										<img class="mountains-thumb" src={mountain.imageUrl} alt={mountain.name} />
									{:else}
										⛰️
									{/if}
								</td>
								<td>
									<button class="link-btn" onclick={() => void openMountain(mountain.id)}>
										{mountain.name}
									</button>
								</td>
								<td>{mountainCity(mountain)}</td>
								<td>{mountainProvince(mountain)}</td>
								<td>{mountain.elevationM} {$t('dashboard.mountainsElevationUnit')}</td>
								<td
									>{mountain.difficultyKey
										? $t(mountain.difficultyKey)
										: $t('dashboard.mountainsDifficultyUnknown')}</td
								>
								<td>
									{mountain.volcanoActive
										? $t('dashboard.mountainsTableTypeActive')
										: $t('dashboard.mountainsTableTypeInactive')}
								</td>
								<td>{mountain.routeCount}</td>
								<td>
									{mountain.isActive
										? $t('dashboard.mountainsTableStatusActive')
										: $t('dashboard.mountainsTableStatusInactive')}
								</td>
								{#if isStaffAdmin}
									<td>
										<div class="mountains-actions">
											<button class="mountains-action-btn edit" onclick={() => startEditMountain(mountain)}>
												{$t('dashboard.mountainsTableEdit')}
											</button>
											<button
												class="mountains-action-btn"
												class:toggle-off={mountain.isActive}
												class:toggle-on={!mountain.isActive}
												onclick={() => void toggleMountainActive(mountain)}
											>
												{mountain.isActive
													? $t('dashboard.mountainsTableDeactivate')
													: $t('dashboard.mountainsTableActivate')}
											</button>
											<button
												class="mountains-action-btn delete"
												onclick={() => void deleteMountainRow(mountain)}
											>
												{$t('dashboard.mountainsTableDelete')}
											</button>
										</div>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mountains-pager">
				<button disabled={mountainsPage <= 1} onclick={() => (mountainsPage -= 1)}>
					{$t('dashboard.mountainsPagePrev')}
				</button>
				<span>{$t('dashboard.mountainsPage')} {mountainsPage} / {mountainsPageCount}</span>
				<button
					disabled={mountainsPage >= mountainsPageCount}
					onclick={() => (mountainsPage += 1)}
				>
					{$t('dashboard.mountainsPageNext')}
				</button>
			</div>
			{:else}
			{#if isStaffAdmin}
				<div class="row-actions" style="margin-bottom: 12px">
					<button onclick={() => openRouteCreate()}>
						{$t('dashboard.mountainsRoutesAdd')}
					</button>
				</div>
			{/if}
			<MountainCombobox
				value={mountainsRoutesFilter}
				options={mountains.map((m) => ({ id: m.id, label: `${m.name} (${m.routeCount})` }))}
				allLabel={$t('dashboard.mountainsRoutesAll')}
				ariaLabel={$t('dashboard.mountainsTabRoutes')}
				emptyLabel={$t('dashboard.mountainsFilterEmpty')}
				onchange={(id) => {
					mountainsRoutesFilter = id;
				}}
			/>
			{#if mountainsRoutesLoading}
				<p class="muted">{$t('common.loading')}</p>
			{:else if filteredMountainRoutes.length === 0}
				<p class="muted">{$t('dashboard.mountainsRoutesEmpty')}</p>
			{:else}
				<div class="mountains-table-wrap">
					<table class="mountains-table">
						<thead>
							<tr>
								<th>{$t('dashboard.mountainsRoutesName')}</th>
								<th>{$t('dashboard.mountainsRoutesMountain')}</th>
								<th>{$t('dashboard.mountainsRoutesMeetingPoint')}</th>
								<th>{$t('dashboard.mountainsRoutesDistance')}</th>
								<th>{$t('dashboard.mountainsRoutesGain')}</th>
								<th>{$t('dashboard.mountainsRoutesEst')}</th>
								{#if isStaffAdmin}
									<th>{$t('dashboard.tableAction')}</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each pagedMountainRoutes as { mountain, route } (route.id)}
								<tr>
									<td>
										{route.name}{#if route.recommended} • {$t('dashboard.mountainsRecommended')}{/if}
									</td>
									<td>
										<button class="link-btn" onclick={() => void openMountain(mountain.id)}>
											{mountain.name}
										</button>
									</td>
									<td>{route.meetingPoint}</td>
									<td>{route.distanceKm ?? '—'} km</td>
									<td>{route.gainM ?? '—'} m</td>
									<td>{route.estHours ?? '—'} {$t('dashboard.mountainsHoursUnit')}</td>
									{#if isStaffAdmin}
										<td>
											<div class="mountains-actions">
												<button
													class="mountains-action-btn edit"
													onclick={() => openRouteEdit(mountain, route)}
												>
													{$t('dashboard.mountainsRoutesEdit')}
												</button>
												<button
													class="mountains-action-btn"
													class:toggle-off={route.isActive}
													class:toggle-on={!route.isActive}
													onclick={() => void toggleRouteActive(mountain, route)}
												>
													{route.isActive
														? $t('dashboard.mountainsRoutesDeactivate')
														: $t('dashboard.mountainsRoutesActivate')}
												</button>
												<button
													class="mountains-action-btn delete"
													onclick={() => void deleteRouteRow(mountain, route)}
												>
													{$t('dashboard.mountainsRoutesDelete')}
												</button>
												<button
													class="mountains-action-btn edit"
													onclick={() => void openRouteMap(mountain, route)}
												>
													{$t('dashboard.mountainsRouteMap')}
												</button>
											</div>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="mountains-pager">
					<button
						disabled={mountainsRoutesPage <= 1}
						onclick={() => (mountainsRoutesPage -= 1)}
					>
						{$t('dashboard.mountainsPagePrev')}
					</button>
					<span
						>{$t('dashboard.mountainsPage')} {mountainsRoutesPage} /
						{mountainsRoutesPageCount}</span
					>
					<button
						disabled={mountainsRoutesPage >= mountainsRoutesPageCount}
						onclick={() => (mountainsRoutesPage += 1)}
					>
						{$t('dashboard.mountainsPageNext')}
					</button>
				</div>
			{/if}
			{/if}
		{/if}
				{#if routeMapTarget}
			<div
				class="mountains-modal-backdrop"
				role="presentation"
				onclick={(e) => {
					if (e.target === e.currentTarget) closeRouteMap();
				}}
				onkeydown={(e) => {
					if (e.key === 'Escape') closeRouteMap();
				}}
			>
				<div
					class="mountains-modal route-map-modal"
					use:focusTrap
					role="dialog"
					aria-modal="true"
					aria-label={$t('dashboard.mountainsRouteMapTitle')}
				>
					<div class="mountains-modal-head route-map-head">
						<div class="route-map-title">
							<p class="route-map-subtitle">{routeMapTarget.mountain.name}</p>
							<h3>{routeMapTarget.route.name}</h3>
						</div>
						<button
							type="button"
							class="mountains-modal-close"
							onclick={() => closeRouteMap()}
							aria-label={$t('dashboard.mountainsModalClose')}
						>
							×
						</button>
					</div>
					{#if routeMapLoading}
						<p class="muted">{$t('common.loading')}</p>
					{:else if routeMapDetail}
						<div class="route-map-stats">
							<span class="route-map-stat">
								<span class="route-map-stat-label"
									>{$t('dashboard.mountainsRoutesDistance')}</span
								>
								<span class="route-map-stat-value"
									>{routeMapDetail.distanceKm ?? '—'} km</span
								>
							</span>
							<span class="route-map-stat">
								<span class="route-map-stat-label"
									>{$t('dashboard.mountainsRoutesGain')}</span
								>
								<span class="route-map-stat-value"
									>{routeMapDetail.gainM ?? '—'} m</span
								>
							</span>
							<span class="route-map-stat">
								<span class="route-map-stat-label"
									>{$t('dashboard.mountainsRoutesEst')}</span
								>
								<span class="route-map-stat-value"
									>{routeMapDetail.estHours ?? '—'}
									{$t('dashboard.mountainsHoursUnit')}</span
								>
							</span>
						</div>
						{#if routeMapDetail.track}
							<div class="route-map" bind:this={routeMapEl}></div>
							<div class="route-map-legend" aria-label="Legenda peta">
								<span class="route-map-legend-item"
									><span
										class="route-map-legend-dot"
										style="background:#268c4a"
										aria-hidden="true"
									></span>{$t('dashboard.mountainsRouteMapKindPost')}</span
								>
								<span class="route-map-legend-item"
									><span
										class="route-map-legend-dot"
										style="background:#f78308"
										aria-hidden="true"
									></span>{$t('dashboard.mountainsRouteMapKindCamp')}</span
								>
								<span class="route-map-legend-item"
									><span
										class="route-map-legend-dot"
										style="background:#f5c518"
										aria-hidden="true"
									></span>{$t('dashboard.mountainsRouteMapKindPeak')}</span
								>
							</div>
						{:else}
							<p class="muted">{$t('dashboard.mountainsRouteMapNoTrack')}</p>
						{/if}
						{#if routeMapRows.length}
							<h4>{$t('dashboard.mountainsRouteMapCheckpoints')}</h4>
							<div class="route-map-table-wrap">
								<table class="route-map-table">
									<thead>
										<tr>
											<th scope="col"
												>{$t('dashboard.mountainsRouteMapColPost')}</th
											>
											<th scope="col" class="num"
												>{$t('dashboard.mountainsRouteMapColElevation')}</th
											>
											<th scope="col"
												>{$t('dashboard.mountainsRouteMapColNotes')}</th
											>
										</tr>
									</thead>
									<tbody>
										{#each routeMapRows as row, i (i)}
											<tr>
												<td>
													<span class="route-map-cp-num" aria-hidden="true"
														>{i + 1}</span
													>
													{row.name}
												</td>
												<td class="num">
													{row.cp?.elevationM != null ? `${row.cp.elevationM} m` : '—'}
												</td>
												<td>
													<span class="pill {row.kindClass}">{$t(row.kindKey)}</span>
													{#if row.cp?.autoCheckpoint}
														<span class="pill teal"
															>{$t('dashboard.mountainsRouteMapAuto')}</span
														>
													{/if}
													{#if row.cp?.isTarget}
														<span class="pill green"
															>{$t('dashboard.mountainsRouteMapTarget')}</span
														>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
		{#if showRouteModal && isStaffAdmin}
			<div
				class="mountains-modal-backdrop"
				role="presentation"
				onclick={(e) => {
					if (e.target === e.currentTarget) closeRouteModal();
				}}
				onkeydown={(e) => {
					if (e.key === 'Escape') closeRouteModal();
				}}
			>
				<div
					class="mountains-modal"
					use:focusTrap
					role="dialog"
					aria-modal="true"
					aria-label={routeEditTarget
						? $t('dashboard.mountainsRoutesEditTitle')
						: $t('dashboard.mountainsRoutesAddTitle')}
				>
					<div class="mountains-modal-head">
						<h3>
							{routeEditTarget
								? $t('dashboard.mountainsRoutesEditTitle')
								: $t('dashboard.mountainsRoutesAddTitle')}
						</h3>
						<button
							type="button"
							class="mountains-modal-close"
							onclick={() => closeRouteModal()}
							aria-label={$t('dashboard.mountainsModalClose')}
						>
							×
						</button>
					</div>
					<form class="mountains-edit-grid" onsubmit={saveRoute}>
						{#if routeEditTarget}
							<p class="muted">{routeEditTarget.mountain.name}</p>
						{:else}
							<label>
								{$t('dashboard.mountainsRoutesFieldMountain')}
								<MountainCombobox
									value={routeMountainId}
									options={mountains.map((m) => ({ id: m.id, label: m.name }))}
									allLabel={null}
									ariaLabel={$t('dashboard.mountainsRoutesFieldMountain')}
									emptyLabel={$t('dashboard.mountainsFilterEmpty')}
									onchange={(id) => {
										routeMountainId = id;
									}}
								/>
							</label>
						{/if}
						<label>
							{$t('dashboard.mountainsRoutesName')}
							<input type="text" bind:value={routeName} required />
						</label>
						<label>
							{$t('dashboard.mountainsRoutesMeetingPoint')}
							<input type="text" bind:value={routeMeetingPoint} required />
						</label>
						<label>
							{$t('dashboard.mountainsRoutesDistance')}
							<input type="number" min="0.1" step="0.1" bind:value={routeDistanceKm} required />
						</label>
						<label>
							{$t('dashboard.mountainsRoutesGain')}
							<input type="number" min="0" step="1" bind:value={routeGainM} required />
						</label>
						<label>
							{$t('dashboard.mountainsRoutesEst')}
							<input type="number" min="0.5" step="0.5" bind:value={routeEstHours} required />
						</label>
						<label>
							{$t('dashboard.mountainsRecommended')}
							<input type="checkbox" bind:checked={routeRecommended} />
						</label>
						<div>
							<span>{$t('dashboard.mountainsRoutesPosts')}</span>
							<p class="muted">{$t('dashboard.mountainsRoutesPostsHint')}</p>
							{#each routePosts as post, i}
								<div class="route-post-row">
									<input
										type="text"
										bind:value={routePosts[i].name}
										placeholder="Pos {i + 1}"
										aria-label="Pos {i + 1}"
									/>
									<input
										type="number"
										inputmode="decimal"
										step="any"
										min="-90"
										max="90"
										bind:value={routePosts[i].lat}
										placeholder="Lat"
										aria-label="Lintang pos {i + 1}"
									/>
									<input
										type="number"
										inputmode="decimal"
										step="any"
										min="-180"
										max="180"
										bind:value={routePosts[i].lon}
										placeholder="Lon"
										aria-label="Bujur pos {i + 1}"
									/>
									<button
										type="button"
										class="secondary"
										aria-label={$t('dashboard.mountainsRoutesRemovePost')}
										onclick={() => {
											routePosts = routePosts.filter((_, j) => j !== i);
										}}
									>
										×
									</button>
								</div>
							{/each}
							<button
								type="button"
								class="secondary"
								onclick={() => {
									routePosts = [...routePosts, { name: '', lat: '', lon: '' }];
								}}
							>
								{$t('dashboard.mountainsRoutesAddPost')}
							</button>
						</div>
						<div>
							<button type="submit">
								{routeEditTarget
									? $t('dashboard.mountainsEditSave')
									: $t('dashboard.mountainsRoutesAdd')}
							</button>
							<button type="button" onclick={() => closeRouteModal()}>
								{$t('dashboard.mountainsEditCancel')}
							</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet settingsSnippet()}
	<SettingsPanel
		email={me?.email ?? ''}
		displayName={me?.name ?? ''}
		avatarUrl={me?.avatarUrl ?? null}
		nameNotice={nameNotice}
		nameError={nameError ? $t(errToKey(nameError)) : null}
		onChangeName={changeName}
		emailNotice={emailNotice}
		emailError={emailError ? $t(errToKey(emailError)) : null}
		onChangeEmail={changeEmail}
		avatarNotice={avatarNotice}
		avatarError={avatarError ? $t(errToKey(avatarError)) : null}
		onUploadAvatar={uploadAvatar}
		onDeleteAvatar={deleteAvatar}
		qrisNotice={qrisNotice}
		qrisError={qrisError ? $t(errToKey(qrisError)) : null}
		onUploadQris={uploadQris}
		onDeleteQris={deleteQris}
		platformSettings={platformSettings}
		settingsSaving={settingsSaving}
		isStaffAdmin={isStaffAdmin}
		onTogglePlatformSetting={togglePlatformSetting}
		onUpdatePlatformSettings={updatePlatformSettings}
	/>
{/snippet}

{#snippet profileSnippet()}
	<ProfilePanel
		user={me}
		nameNotice={nameNotice}
		nameError={nameError ? $t(errToKey(nameError)) : null}
		onChangeName={changeName}
		emailNotice={emailNotice}
		emailError={emailError ? $t(errToKey(emailError)) : null}
		onChangeEmail={changeEmail}
		avatarNotice={avatarNotice}
		avatarError={avatarError ? $t(errToKey(avatarError)) : null}
		onUploadAvatar={uploadAvatar}
		onDeleteAvatar={deleteAvatar}
	/>
{/snippet}

{#snippet staffSnippet()}
	<div class="card">
		<h2>{$t('dashboard.staff.title')}</h2>
		<p class="muted">{$t('dashboard.staff.subtitle')}</p>
		<button onclick={() => (showStaffModal = true)}>{$t('dashboard.staff.create')}</button>
		{#if staffNotice === 'created' || staffNotice === 'edited'}
			<p class="muted">
				{$t(
					staffNotice === 'created'
						? 'dashboard.staff.created'
						: 'dashboard.staff.editProfileSaved'
				)}
			</p>
		{/if}
		<h3 class="subhead">{$t('dashboard.staff.listTitle')}</h3>
		{#if staffList.length === 0}
			<p class="muted">{$t('dashboard.staff.empty')}</p>
		{:else}
			<div class="mountains-table-wrap">
				<table class="mountains-table">
					<thead>
						<tr>
							<th>{$t('dashboard.staff.name')}</th>
							<th>{$t('dashboard.staff.email')}</th>
							<th>{$t('dashboard.staff.role')}</th>
							<th>{$t('dashboard.staff.status')}</th>
							<th>{$t('dashboard.tableAction')}</th>
						</tr>
					</thead>
					<tbody>
						{#each staffList as account (account.id)}
							<tr>
								<td>{account.name}</td>
								<td>{account.email}</td>
								<td>
									{account.role === 'admin'
										? $t('dashboard.staff.roleAdmin')
										: $t('dashboard.staff.roleCommandCenter')}
								</td>
								<td>
									<span class="pill {account.suspendedAt ? 'grey' : ''}">
										{account.suspendedAt
											? $t('dashboard.staff.suspended')
											: $t('dashboard.staff.active')}
									</span>
								</td>
								<td>
									<button
										class="mountains-action-btn edit"
										onclick={() => openEditProfile(account)}
									>
										{$t('dashboard.staff.editProfile')}
									</button>
									<button
										class="mountains-action-btn {account.suspendedAt ? 'toggle-on' : 'toggle-off'}"
										disabled={account.id === me?.id}
										title={account.id === me?.id ? $t('dashboard.staff.suspendSelf') : ''}
										onclick={() => void toggleSuspend(account)}
									>
										{account.suspendedAt
											? $t('dashboard.staff.unsuspend')
											: $t('dashboard.staff.suspend')}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
		{#if showStaffModal}
			<div
				class="mountains-modal-backdrop"
				role="presentation"
				onclick={(e) => {
					if (e.target === e.currentTarget) showStaffModal = false;
				}}
				onkeydown={(e) => {
					if (e.key === 'Escape') showStaffModal = false;
				}}
			>
				<div class="mountains-modal" use:focusTrap role="dialog" aria-modal="true" aria-label={$t('dashboard.staff.formTitle')}>
					<div class="mountains-modal-head">
						<h3>{$t('dashboard.staff.formTitle')}</h3>
						<button
							type="button"
							class="mountains-modal-close"
							onclick={() => (showStaffModal = false)}
							aria-label={$t('dashboard.mountainsModalClose')}
						>
							×
						</button>
					</div>
					<form class="mountains-edit-grid" onsubmit={createStaff}>
						<label>
							{$t('dashboard.staff.name')}
							<input type="text" bind:value={staffName} required />
						</label>
						<label>
							{$t('dashboard.staff.email')}
							<input type="email" bind:value={staffEmail} required />
						</label>
						<p class="muted">{$t('dashboard.staff.otpHint')}</p>
						<label>
							{$t('dashboard.staff.role')}
							<select bind:value={staffRole}>
								<option value="admin">{$t('dashboard.staff.roleAdmin')}</option>
								<option value="command_center">{$t('dashboard.staff.roleCommandCenter')}</option>
							</select>
						</label>
						<button type="submit">{$t('dashboard.staff.create')}</button>
					</form>
				</div>
			</div>
		{/if}
		{#if editStaff}
			<div
				class="mountains-modal-backdrop"
				role="presentation"
				onclick={(e) => {
					if (e.target === e.currentTarget) editStaff = null;
				}}
				onkeydown={(e) => {
					if (e.key === 'Escape') editStaff = null;
				}}
			>
				<div class="mountains-modal" use:focusTrap role="dialog" aria-modal="true" aria-label={$t('dashboard.staff.editProfileTitle')}>
					<div class="mountains-modal-head">
						<h3>{$t('dashboard.staff.editProfileTitle')}</h3>
						<button
							type="button"
							class="mountains-modal-close"
							onclick={() => (editStaff = null)}
							aria-label={$t('dashboard.mountainsModalClose')}
						>
							×
						</button>
					</div>
					<form class="mountains-edit-grid" onsubmit={saveEditStaff}>
						{#if editErrorCode}
							<p role="alert">{$t(errToKey(editErrorCode))}</p>
						{/if}
						<label>
							{$t('dashboard.staff.editPhoto')}
							{#if editStaff.avatarUrl && !editAvatarFile && !editAvatarRemove}
								<img class="verify-avatar" src={editStaff.avatarUrl} alt="" />
							{:else}
								<span class="verify-avatar verify-avatar-fallback">
									{(editStaff.name ?? '?').slice(0, 1).toUpperCase()}
								</span>
							{/if}
							<input
								type="file"
								accept="image/*"
								aria-label={$t('dashboard.staff.changePhoto')}
								onchange={(e) => {
									editAvatarFile = e.currentTarget.files?.[0] ?? null;
									if (editAvatarFile) editAvatarRemove = false;
								}}
							/>
						</label>
						{#if editStaff.avatarUrl && !editAvatarFile && !editAvatarRemove}
							<button type="button" class="secondary" onclick={() => (editAvatarRemove = true)}>
								{$t('dashboard.staff.removePhoto')}
							</button>
						{/if}
						<label>
							{$t('dashboard.staff.name')}
							<input type="text" bind:value={editName} required />
						</label>
						<label>
							{$t('dashboard.staff.email')}
							<input type="email" bind:value={editEmail} required />
						</label>
						<div class="row-actions">
							<button type="button" class="secondary" onclick={() => (editStaff = null)}>
								{$t('dashboard.staff.cancel')}
							</button>
							<button type="submit" disabled={editSaving}>{$t('dashboard.staff.save')}</button>
						</div>
					</form>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#if !me}
	<div
		class="login-bg"
		aria-hidden="true"
		bind:this={loginBgEl}
		style="background-image: linear-gradient(rgba(15, 4, 30, 0.35), rgba(15, 4, 30, 0.55)), url({loginBg})"
	></div>
	<div class="lang-switch">
		<button
			class:active={$locale === 'en'}
			aria-label={$t('language.en')}
			onclick={() => setLocale('en')}
		>
			{$t('language.shortEn')}
		</button>
		<span class="sep" aria-hidden="true">|</span>
		<button
			class:active={$locale === 'id'}
			aria-label={$t('language.id')}
			onclick={() => setLocale('id')}
		>
			{$t('language.shortId')}
		</button>
	</div>
{/if}

{#if errorCode && !me}
	<div class="error" role="alert" tabindex="-1" bind:this={errorBannerEl}>{$t(errToKey(errorCode))}</div>
{/if}

{#if loading && !me}
	<div class="loading-box"><span class="spinner"></span>{$t('common.loading')}</div>
{:else if !me}
	<div class="login-shell">
		<div class="login-card">
			<img class="login-logo" src={logo} alt="GoBareng" />
			<h2>{$t('auth.heading')}</h2>
			<p class="login-sub">{$t('auth.subtitle')}</p>
			{#if otpStep === 'identifier'}
				<form onsubmit={requestOtpCode}>
					<label class="field login-field">
						<span class="sr-only">{$t('auth.email')}</span>
						<span class="field-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
						</span>
						<input
							type="email"
							bind:value={email}
							autocomplete="email"
							placeholder={$t('auth.email')}
							required
						/>
					</label>
					<button class="login-btn" type="submit">{$t('auth.sendOtp')}</button>
				</form>
			{:else}
				<p class="login-sub">{$t('auth.otpIntro', { email })}</p>
				<form onsubmit={verifyOtpCode}>
					<label class="field login-field">
						<span class="sr-only">{$t('auth.otpCode')}</span>
						<span class="field-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
						</span>
						<input
							type="text"
							inputmode="numeric"
							maxlength="6"
							bind:value={otpCode}
							autocomplete="one-time-code"
							placeholder={$t('auth.otpCode')}
							required
						/>
					</label>
					<button class="login-btn" type="submit">{$t('auth.login')}</button>
					<button class="login-btn" type="button" onclick={requestOtpCode}>{$t('auth.resendOtp')}</button>
					<button class="login-btn" type="button" onclick={backToIdentifier}>{$t('auth.changeIdentifier')}</button>
				</form>
			{/if}
			<p class="login-foot">{$t('auth.adminOnly')}</p>
		</div>
	</div>
{:else if !canDashboard}
	<div class="card center">
		<h2>{$t('auth.denied')}</h2>
		<p class="muted">{$t('auth.deniedHint')}</p>
	</div>
{:else}
	<DashboardShell
		menus={visibleMenus}
		activeMenu={activeMenu}
		userLabel={me.name || me.email}
		profileRole={me.role === 'admin'
			? $t('dashboard.profileRoleAdmin')
			: $t('dashboard.profileRoleCommandCenter')}
		searchValue={tripSearch}
		badgeCounts={{
			'organizer-verification': pendingVerifications.length,
			proposals: proposalMountains.length + proposalRoutes.length,
			trips: trips.length,
			sos: activeSosCount,
			moderation: modReports.length,
			notifications: notifUnreadCount
		}}
		bellCount={notifUnreadCount}
		onSearch={(q) => (tripSearch = q)}
		onBell={() => {
			activeMenu = 'notifications';
			void loadNotifications();
		}}
		onProfile={() => {
			activeMenu = 'profile';
		}}
		onLogout={logout}
		onMenuSelect={(id) => {
			// CC-2 (keputusan Wella 28 Okt 2026): Peta Live opens the
			// command center in a NEW TAB (fullscreen-able for SAR/posko).
			// RBAC still applies — /safety gates itself and the API does too.
			if (id === 'live-map') {
				window.open('/safety', '_blank', 'noopener');
				return;
			}
			activeMenu = id;
			if (id === 'sos') void loadAllSos();
			if (id === 'staff') void loadStaff();
			if (id === 'members') void loadAdminMembers();
			if (id === 'organizer-verification') void loadVerifications();
			if (id === 'proposals') void loadProposals();
			if (id === 'organizer') void loadOrganizers();
			if (id === 'moderation') {
				void loadReports();
				void loadCommunities();
			}
			if (id === 'notifications') void loadNotifications();
			if (id === 'mountains') void loadMountains();
		}}
	>
		{#if errorCode}
			<div class="error" role="alert" tabindex="-1" bind:this={errorBannerEl}>{$t(errToKey(errorCode))}</div>
		{/if}
		{#if actionNotice}
			<div class="action-notice" role="status">{actionNotice}</div>
		{/if}
		{#if activeMenu === 'summary'}
			<!-- File-10 overview order. The SOS list, safety score and
			     member/alert cards are deliberately NOT rendered here
			     anymore: SOS lives in its own menu, the score is not
			     shown on any page, members stay on the Member page. -->
			<div class="date-row">
				<span class="info-pill">📅 {todayLabel}</span>
				<span class="info-pill live" class:off={!live}>
					<span class="info-dot" aria-hidden="true"></span>
					{live ? $t('common.live') : $t('common.offline')}
				</span>
			</div>
			{@render statsSnippet()}
			<div class="summary-grid">
				<div>
					{@render mapSnippet(true)}
					<div class="bottom-grid">
						{@render routesSnippet()}
						{@render upcomingTripsSnippet()}
					</div>
				</div>
				<div>
					{@render activeTripsSnippet()}
					{@render activitySnippet()}
				</div>
			</div>
		{:else if activeMenu === 'organizer-verification'}
			{@render verifySnippet()}
		{:else if activeMenu === 'proposals'}
			{#if isStaffAdmin}
				{@render proposalsSnippet()}
			{:else}
				<div class="card center">
					<h2>{$t('auth.denied')}</h2>
				</div>
			{/if}
		{:else if activeMenu === 'trips'}
			{@render tripsSnippet()}
		{:else if activeMenu === 'trip-detail'}
			{@render tripDetailSnippet()}
		{:else if activeMenu === 'sos'}
			{@render sosSnippet()}
		{:else if activeMenu === 'organizer'}
			{@render organizerSnippet()}
		{:else if activeMenu === 'moderation'}
			{@render communityPageSnippet()}
		{:else if activeMenu === 'notifications'}
			{@render notificationsSnippet()}
		{:else if activeMenu === 'members'}
			{@render memberPageSnippet()}
		{:else if activeMenu === 'mountains'}
			{@render mountainsSnippet()}
		{:else if activeMenu === 'settings'}
			{@render settingsSnippet()}
		{:else if activeMenu === 'profile'}
			{@render profileSnippet()}
		{:else if activeMenu === 'staff'}
			{#if isStaffAdmin}
				{@render staffSnippet()}
			{:else}
				<div class="card center">
					<h2>{$t('auth.denied')}</h2>
					<p class="muted">{$t('auth.deniedHint')}</p>
				</div>
			{/if}
		{/if}
	</DashboardShell>
{/if}
