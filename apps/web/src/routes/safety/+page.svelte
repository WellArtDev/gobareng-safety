<script lang="ts">
	// Command center (CC-1..CC-3, keputusan Wella 28 Okt 2026): a safety
	// dashboard SEPARATE from the admin dashboard. It watches EVERY
	// active trip and every member on them, account-gated to dashboard
	// roles (RBAC via canOpenCommandCenter + the API's own requireRole).
	// Opened from the admin dashboard's Peta Live menu in a new tab, so
	// posko/SAR can keep it fullscreen.
	//
	// This is the kerangka (skeleton): overview stats, the cross-trip
	// live map, member list + position detail, active SOS list, and a
	// beacon placeholder section. Beacon implementation is ON HOLD.
	import { onDestroy, onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { api, ApiError, getToken } from '#lib/api';
	import { locale, setLocale, t } from '#lib/i18n/index';
	import { canOpenCommandCenter } from '#lib/command-center';
	import { createMap, type MapHandle } from '#lib/map';
	import type {
		CommandCenterTripRow,
		CurrentWeather,
		Me,
		Quake,
		TripPosition,
		TripRole
	} from '#lib/types';

	let me = $state<Me | null>(null);
	let loading = $state(true);
	let errorCode = $state<string | null>(null);
	let rows = $state<CommandCenterTripRow[]>([]);
	let tripFilter = $state<string>('ALL');
	let selected = $state<{ tripId: string; userId: string } | null>(null);

	let safetyPopHandler: (() => void) | null = null;
	let ccErrorEl: HTMLDivElement | undefined = $state();
	let mapEl: HTMLDivElement | undefined = $state();
	// Fokus ke error pertama saat muncul (Tugas 1.3).
	$effect(() => {
		if (errorCode && ccErrorEl) ccErrorEl.focus();
	});
	let mapHandle: MapHandle | null = null;
	let refreshTimer: ReturnType<typeof setInterval> | null = null;

	const allowed = $derived(canOpenCommandCenter(me));
	const shownRows = $derived(
		tripFilter === 'ALL' ? rows : rows.filter((r) => r.trip.id === tripFilter)
	);
	const totalMembers = $derived(rows.reduce((n, r) => n + r.positions.length, 0));
	const activeSos = $derived(rows.flatMap((r) => r.sos));
	const selectedPosition = $derived.by((): TripPosition | null => {
		if (!selected) return null;
		const row = rows.find((r) => r.trip.id === selected!.tripId);
		return row?.positions.find((p) => p.userId === selected!.userId) ?? null;
	});
	const selectedTripName = $derived(
		selected ? (rows.find((r) => r.trip.id === selected!.tripId)?.trip.name ?? '') : ''
	);

	async function loadOverview() {
		try {
			rows = (await api.commandCenterOverview()).trips;
			errorCode = null;
		} catch (e) {
			errorCode = e instanceof ApiError ? e.code : 'GENERIC';
		}
	}

	// WX-1: cuaca + gempa untuk posko — anchor koordinat = posisi/titik
	// kumpul trip pertama yang punya koordinat; fail-soft (null/[] =
	// seksi tampil kosong, tidak pernah error).
	let weather = $state<CurrentWeather | null>(null);
	let quakes = $state<Quake[]>([]);
	let wxAnchor = $state<{ lat: number; lon: number } | null>(null);

	function findAnchor(): { lat: number; lon: number } | null {
		for (const row of rows) {
			const located = row.positions.find((p) => p.location !== null);
			if (located?.location) return { lat: located.location.lat, lon: located.location.lon };
			if (row.trip.meetingLat != null && row.trip.meetingLon != null) {
				return { lat: row.trip.meetingLat, lon: row.trip.meetingLon };
			}
		}
		return null;
	}

	async function loadWeather() {
		const anchor = findAnchor();
		wxAnchor = anchor;
		if (!anchor) {
			weather = null;
			quakes = [];
			return;
		}
		const [w, q] = await Promise.all([
			api.weatherCurrent(anchor.lat, anchor.lon).catch(() => null),
			api.weatherQuakes(anchor.lat, anchor.lon).catch(() => null)
		]);
		weather = w?.weather ?? null;
		quakes = q?.quakes ?? [];
	}

	async function init() {
		loading = true;
		try {
			me = (await api.me()).user;
			if (canOpenCommandCenter(me)) {
				await loadOverview();
				void loadWeather();
			}
		} catch {
			me = null;
		} finally {
			loading = false;
		}
	}

	// All positions (and active SOS) across the visible trips on one map.
	async function updateMap() {
		if (!mapEl || !allowed) return;
		if (!mapHandle) {
			mapHandle = await createMap(
				mapEl,
				env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
				{ standard: $t('map.styleStandard'), satellite: $t('map.styleSatellite') }
			);
		}
		const locations = shownRows.flatMap((r) =>
			r.positions.filter((p) => p.location !== null).map((p) => p.location!)
		);
		const roles = new Map<string, TripRole>(
			shownRows.flatMap((r) => r.positions.map((p) => [p.userId, p.role] as [string, TripRole]))
		);
		mapHandle.setData(locations, roles, shownRows.flatMap((r) => r.sos), false);
	}

	$effect(() => {
		void shownRows;
		if (mapEl) void updateMap();
	});

	function toggleFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen();
	}

	function batteryLabel(p: TripPosition): string {
		const b = p.location?.batteryLevel;
		return b === null || b === undefined ? '—' : `${b}%`;
	}

	onMount(() => {
		// URL sync (Tugas 1.1): filter trip Peta Live di ?trip= supaya
		// refresh/back tidak menghilangkan pilihan (ALL = tanpa param).
		const q = new URLSearchParams(window.location.search);
		const trip = q.get('trip');
		if (trip) tripFilter = trip;
		safetyPopHandler = () => {
			tripFilter = new URLSearchParams(window.location.search).get('trip') ?? 'ALL';
		};
		window.addEventListener('popstate', safetyPopHandler);
		if (getToken()) void init();
		else loading = false;
		// The design refreshes positions automatically; 15s is gentle on
		// the API while keeping the ops map live.
		refreshTimer = setInterval(() => {
			if (canOpenCommandCenter(me)) void loadOverview();
		}, 15000);
	});

	onDestroy(() => {
		if (refreshTimer) clearInterval(refreshTimer);
		mapHandle?.destroy();
		if (safetyPopHandler) window.removeEventListener('popstate', safetyPopHandler);
	});
	$effect(() => {
		const q = new URLSearchParams();
		if (tripFilter !== 'ALL') q.set('trip', tripFilter);
		const next = q.toString() ? `?${q.toString()}` : window.location.pathname;
		if (typeof window !== 'undefined' && window.location.search !== (q.toString() ? `?${q.toString()}` : '')) {
			history.replaceState(null, '', next);
		}
	});
</script>

<svelte:head>
	<title>{$t('safety.ccTitle')} — GoBareng</title>
</svelte:head>

{#if loading}
	<div class="cc-page"><p class="cc-note">…</p></div>
{:else if !me}
	<div class="cc-page">
		<div class="cc-card cc-gate">
			<h1>{$t('safety.ccTitle')}</h1>
			<p>{$t('safety.ccLogin')}</p>
			<a class="cc-btn" href="/">GoBareng Dashboard</a>
		</div>
	</div>
{:else if !allowed}
	<div class="cc-page">
		<div class="cc-card cc-gate">
			<h1>{$t('safety.ccTitle')}</h1>
			<p>{$t('safety.ccDenied')}</p>
		</div>
	</div>
{:else}
	<div class="cc-page">
		<header class="cc-head">
			<div>
				<span class="cc-brand-sub">{$t('safety.ccBrandSub')}</span>
				<h1>{$t('safety.ccTitle')}</h1>
				<p class="cc-sub">{$t('safety.ccSubtitle')}</p>
			</div>
			<div class="cc-actions">
				<div class="cc-lang" role="group" aria-label={$t('language.label')}>
					<button
						class="cc-btn cc-lang-btn"
						class:active={$locale === 'id'}
						onclick={() => setLocale('id')}
					>
						{$t('language.shortId')}
					</button>
					<button
						class="cc-btn cc-lang-btn"
						class:active={$locale === 'en'}
						onclick={() => setLocale('en')}
					>
						{$t('language.shortEn')}
					</button>
				</div>
				<button class="cc-btn" onclick={() => void loadOverview()}>
					⟳ {$t('safety.ccRefresh')}
				</button>
				<button class="cc-btn" onclick={toggleFullscreen}>
					⛶ {$t('safety.ccFullscreen')}
				</button>
			</div>
		</header>

		{#if errorCode}
			<div class="cc-error" role="alert" aria-live="assertive" tabindex="-1" bind:this={ccErrorEl}>{errorCode}</div>
		{/if}

		<div class="cc-stats">
			<div class="cc-stat">
				<small>{$t('safety.ccStatTrips')}</small>
				<strong>{rows.length}</strong>
			</div>
			<div class="cc-stat">
				<small>{$t('safety.ccStatMembers')}</small>
				<strong>{totalMembers}</strong>
			</div>
			<div class="cc-stat" class:alert={activeSos.length > 0}>
				<small>{$t('safety.ccStatSos')}</small>
				<strong>{activeSos.length}</strong>
			</div>
			<div class="cc-stat">
				<small>{$t('safety.ccStatBeacons')}</small>
				<strong>—</strong>
				<em>{$t('safety.ccBeaconHold')}</em>
			</div>
		</div>

		<!-- WX-1: cuaca + gempa. Fail-soft: tanpa data -> teks kosong. -->
		<div class="cc-wx">
			<div class="cc-card cc-wx-card">
				<h3>{$t('safety.wxWeatherTitle')}</h3>
				{#if weather}
					<p class="cc-wx-main">
						{weather.temperatureC !== null ? `${weather.temperatureC}°C` : '—'}
						{#if weather.windSpeedKmh !== null}
							· {$t('safety.wxWind')} {weather.windSpeedKmh} km/j
						{/if}
					</p>
					<p class="cc-wx-sub">
						{$t('safety.wxProvider')}: {weather.provider === 'bmkg' ? 'BMKG' : 'Open-Meteo'}
						{#if wxAnchor}
							· {wxAnchor.lat.toFixed(3)}, {wxAnchor.lon.toFixed(3)}
						{/if}
					</p>
				{:else}
					<p class="cc-wx-sub">{$t('safety.wxEmpty')}</p>
				{/if}
			</div>
			<div class="cc-card cc-wx-card">
				<h3>{$t('safety.wxQuakeTitle')}</h3>
				{#if quakes.length > 0}
					<ul class="cc-wx-quakes">
						{#each quakes.slice(0, 3) as quake (quake.time)}
							<li>
								<strong>M{quake.magnitude ?? '—'}</strong>
								<span>{quake.region ?? '—'}</span>
								{#if quake.tsunamiPotential}
									<em>{quake.tsunamiPotential}</em>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="cc-wx-sub">{$t('safety.wxQuakeEmpty')}</p>
				{/if}
			</div>
		</div>

		<div class="cc-chips" role="group">
			<button class="cc-chip" class:on={tripFilter === 'ALL'} onclick={() => (tripFilter = 'ALL')}>
				{$t('safety.ccAllTrips')} · {rows.length}
			</button>
			{#each rows as row (row.trip.id)}
				<button
					class="cc-chip"
					class:on={tripFilter === row.trip.id}
					onclick={() => (tripFilter = row.trip.id)}
				>
					{row.trip.name} · {row.positions.length}
				</button>
			{/each}
		</div>

		<div class="cc-grid">
			<div class="cc-card cc-map-card">
				<div class="cc-map" bind:this={mapEl}></div>
			</div>
			<div class="cc-side">
				<div class="cc-card">
					<h2>{$t('safety.ccDetail')}</h2>
					{#if selectedPosition}
						<p class="cc-detail-name">{selectedPosition.user.name}</p>
						<p class="cc-note">{selectedTripName} · {selectedPosition.role}</p>
						{#if selectedPosition.location}
							<p class="cc-mono">
								{selectedPosition.location.lat.toFixed(4)}, {selectedPosition.location.lon.toFixed(
									4
								)}
								{#if selectedPosition.location.altitude != null}
									· {Math.round(selectedPosition.location.altitude)} mdpl
								{/if}
							</p>
							<p class="cc-note">
								{$t('safety.battery')}: {batteryLabel(selectedPosition)} ·
								{new Date(selectedPosition.location.ts).toLocaleTimeString()}
							</p>
						{:else}
							<p class="cc-note">{$t('safety.ccNoPosition')}</p>
						{/if}
					{:else}
						<p class="cc-note">{$t('safety.ccMembers')} →</p>
					{/if}
				</div>
				<div class="cc-card cc-members">
					<h2>{$t('safety.ccMembers')}</h2>
					{#if shownRows.length === 0}
						<p class="cc-note">{$t('safety.ccEmpty')}</p>
					{/if}
					{#each shownRows as row (row.trip.id)}
						<p class="cc-trip-name">{row.trip.name}</p>
						{#each row.positions as pos (pos.userId)}
							<button
								class="cc-member"
								class:sel={selected?.tripId === row.trip.id && selected?.userId === pos.userId}
								onclick={() => (selected = { tripId: row.trip.id, userId: pos.userId })}
							>
								<span class="cc-avatar" class:leader={pos.role === 'LEADER'}>
									{pos.user.name
										.split(' ')
										.map((w) => w[0])
										.slice(0, 2)
										.join('')
										.toUpperCase()}
								</span>
								<span class="cc-member-text">
									<b>{pos.user.name}</b>
									<span>{pos.role}</span>
								</span>
								<span class="cc-member-end">
									{#if pos.location}
										{batteryLabel(pos)}
									{:else}
										{$t('safety.ccNoPosition')}
									{/if}
								</span>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		</div>

		<div class="cc-card cc-sos">
			<h2>{$t('safety.ccSosActive')}</h2>
			{#if activeSos.length === 0}
				<p class="cc-note">{$t('safety.ccNoSos')}</p>
			{/if}
			{#each activeSos as alert (alert.id)}
				<div class="cc-sos-row">
					<span class="cc-sos-ico">⚠</span>
					<span class="cc-member-text">
						<b>{$t(`sosReasons.${alert.reason}`)}</b>
						<span class="cc-mono">
							{alert.lat.toFixed(4)}, {alert.lon.toFixed(4)} ·
							{new Date(alert.createdAt).toLocaleTimeString()}
						</span>
						<!-- AI-P: foto kondisi + deskripsi vision (bila ada) -->
						{#if alert.photos?.length}
							{#each alert.photos as photo (photo.id)}
								<span class="cc-sos-photo">
									<img src={photo.photoUrl} alt="" loading="lazy" />
									<span class="cc-sos-photo-desc">
										<b>{$t('safety.ccSosPhotoDesc')}:</b>
										{photo.aiDescription ?? $t('safety.ccSosPhotoUnavailable')}
									</span>
									{#if photo.model}
										<span class="cc-sos-photo-attr">
											{$t('safety.ccSosPhotoAttribution')}
										</span>
									{/if}
								</span>
							{/each}
						{/if}
					</span>
					<span class="cc-pill" class:bad={alert.level === 'EMERGENCY'}>
						{alert.level}
					</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* Safety-dashboard tokens (design/safety-dashboard/index.html):
	   its own palette, separate from the admin dashboard tokens. */
	.cc-page {
		--cc-brand: #0aa653;
		--cc-brand-dark: #07823f;
		--cc-bg: #edf3f0;
		--cc-surface: #ffffff;
		--cc-surface-2: #f3f8f5;
		--cc-ink: #12211b;
		--cc-muted: #5f7269;
		--cc-line: #dce7e1;
		--cc-chip: #e7efeb;
		--cc-red: #dc2626;
		min-height: 100vh;
		background: var(--cc-bg);
		color: var(--cc-ink);
		padding: 20px 26px 44px;
		font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
		box-sizing: border-box;
	}
	:global(:root[data-theme='dark']) .cc-page {
		--cc-bg: #08120e;
		--cc-surface: #101d17;
		--cc-surface-2: #0c1712;
		--cc-ink: #e6f2ec;
		--cc-muted: #93aa9f;
		--cc-line: #21382d;
		--cc-chip: #182a21;
	}
	.cc-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
		margin-bottom: 16px;
	}
	.cc-head h1 {
		margin: 0;
		font-family: Manrope, 'Plus Jakarta Sans', sans-serif;
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.cc-brand-sub {
		font-size: 10.5px;
		font-weight: 800;
		letter-spacing: 0.09em;
		color: var(--cc-brand-dark);
	}
	.cc-sub {
		margin: 3px 0 0;
		color: var(--cc-muted);
		font-size: 14px;
		max-width: 640px;
	}
	.cc-actions {
		margin-left: auto;
		display: flex;
		gap: 8px;
	}
	.cc-btn {
		border: 1px solid var(--cc-line);
		background: var(--cc-surface);
		color: var(--cc-ink);
		border-radius: 11px;
		padding: 9px 14px;
		font: inherit;
		font-weight: 700;
		font-size: 13.5px;
		cursor: pointer;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.cc-btn:hover {
		border-color: var(--cc-brand);
		color: var(--cc-brand-dark);
	}
	.cc-lang {
		display: inline-flex;
	}
	.cc-lang-btn:first-child {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}
	.cc-lang-btn:last-child {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
		border-left-width: 0;
	}
	.cc-lang-btn.active {
		background: var(--cc-brand);
		border-color: var(--cc-brand);
		color: #fff;
	}
	.cc-error {
		background: #fde8ea;
		border: 1px solid var(--cc-red);
		color: #7f0f2a;
		border-radius: 12px;
		padding: 10px 14px;
		margin-bottom: 12px;
		font-weight: 700;
	}
	.cc-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		margin-bottom: 16px;
	}
	/* WX-1: panel cuaca + gempa */
	.cc-wx {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 16px;
	}
	.cc-wx-card h3 {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #5b6b76;
		margin: 0 0 8px;
	}
	.cc-wx-main {
		font-size: 19px;
		font-weight: 800;
		margin: 0 0 4px;
	}
	.cc-wx-sub {
		font-size: 12px;
		color: #5b6b76;
		margin: 0;
	}
	.cc-wx-quakes {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cc-wx-quakes li {
		display: flex;
		gap: 8px;
		align-items: baseline;
		padding: 4px 0;
		font-size: 12.5px;
	}
	.cc-wx-quakes li em {
		color: #b91c1c;
		font-style: normal;
		font-weight: 700;
		font-size: 11px;
	}
	.cc-stat {
		background: var(--cc-surface);
		border: 1px solid var(--cc-line);
		border-radius: 16px;
		padding: 15px 16px;
	}
	.cc-stat small {
		font-size: 11.5px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--cc-muted);
		display: block;
	}
	.cc-stat strong {
		font-family: Manrope, sans-serif;
		font-size: 31px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.cc-stat.alert strong {
		color: var(--cc-red);
	}
	.cc-stat em {
		display: block;
		font-style: normal;
		font-size: 12px;
		color: var(--cc-muted);
		margin-top: 2px;
	}
	.cc-chips {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.cc-chip {
		border: 1px solid var(--cc-line);
		background: var(--cc-surface-2);
		color: var(--cc-ink);
		border-radius: 99px;
		padding: 6px 13px;
		font: inherit;
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
	}
	.cc-chip.on {
		background: var(--cc-brand);
		border-color: var(--cc-brand);
		color: #fff;
	}
	.cc-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 324px;
		gap: 14px;
		align-items: start;
	}
	.cc-card {
		background: var(--cc-surface);
		border: 1px solid var(--cc-line);
		border-radius: 18px;
		padding: 16px 18px;
		margin-bottom: 14px;
	}
	.cc-card h2 {
		margin: 0 0 10px;
		font-family: Manrope, sans-serif;
		font-size: 16px;
		font-weight: 800;
	}
	.cc-map-card {
		padding: 0;
		overflow: hidden;
	}
	.cc-map {
		height: 620px;
	}
	.cc-side {
		min-width: 0;
	}
	.cc-members {
		max-height: 430px;
		overflow: auto;
	}
	.cc-trip-name {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--cc-muted);
		margin: 10px 0 4px;
	}
	.cc-member {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		padding: 8px 6px;
		border: 0;
		border-bottom: 1px solid var(--cc-line);
		background: none;
		color: var(--cc-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.cc-member:hover {
		background: var(--cc-surface-2);
	}
	.cc-member.sel {
		background: var(--cc-chip);
	}
	.cc-avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		flex: none;
		display: grid;
		place-items: center;
		background: #0e8a94;
		color: #fff;
		font-weight: 800;
		font-size: 12.5px;
	}
	.cc-avatar.leader {
		background: #f97316;
	}
	.cc-member-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cc-member-text b {
		font-size: 14px;
		font-weight: 700;
	}
	.cc-member-text span {
		font-size: 12px;
		color: var(--cc-muted);
	}
	.cc-member-end {
		margin-left: auto;
		font-size: 12px;
		color: var(--cc-muted);
		white-space: nowrap;
	}
	.cc-detail-name {
		margin: 0;
		font-size: 17px;
		font-weight: 800;
	}
	.cc-mono {
		font-family: ui-monospace, Menlo, monospace;
		font-size: 12.5px;
	}
	.cc-note {
		color: var(--cc-muted);
		font-size: 13.5px;
	}
	.cc-gate {
		max-width: 480px;
		margin: 15vh auto 0;
		text-align: center;
	}
	.cc-sos-row {
		display: flex;
		gap: 13px;
		align-items: center;
		padding: 10px 0;
		border-top: 1px solid var(--cc-line);
	}
	.cc-sos-ico {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		flex: none;
		display: grid;
		place-items: center;
		background: rgba(220, 38, 38, 0.12);
		color: var(--cc-red);
		font-size: 18px;
	}
	/* AI-P: foto kondisi SOS di baris posko. */
	.cc-sos-photo {
		display: block;
		margin-top: 8px;
	}
	.cc-sos-photo img {
		width: 100%;
		max-width: 320px;
		border-radius: 8px;
		display: block;
	}
	.cc-sos-photo-desc {
		display: block;
		margin-top: 6px;
		font-size: 13px;
		line-height: 1.45;
	}
	.cc-sos-photo-attr {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: var(--cc-muted);
	}
	.cc-pill {
		margin-left: auto;
		border-radius: 99px;
		padding: 3px 10px;
		font-size: 12px;
		font-weight: 800;
		background: var(--cc-chip);
		color: var(--cc-muted);
	}
	.cc-pill.bad {
		background: rgba(220, 38, 38, 0.13);
		color: var(--cc-red);
	}
	@media (max-width: 1080px) {
		.cc-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 860px) {
		.cc-page {
			padding: 16px 14px 44px;
		}
		.cc-grid {
			grid-template-columns: 1fr;
		}
		.cc-map {
			height: 420px;
		}
	}
	@media (max-width: 560px) {
		.cc-stats {
			grid-template-columns: 1fr 1fr;
			gap: 9px;
		}
		.cc-stat strong {
			font-size: 24px;
		}
	}
</style>
