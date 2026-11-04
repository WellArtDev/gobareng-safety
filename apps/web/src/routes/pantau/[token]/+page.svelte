<script lang="ts">
	// Landing pantau trip (SHARE, 2 Nov 2026) — PUBLIK, read-only,
	// tanpa login. Hanya melayani share-link scope ANYONE; token
	// EMERGENCY_CONTACT ditampilkan sebagai tidak ditemukan (semantik
	// EC tetap app-only, tidak dilonggarkan). Link pantau lama (api base
	// /pantau/{token}) tidak pernah jalan dan dibiarkan mati tanpa
	// redirect (keputusan 2 Nov 2026).
	//
	// Layout (3 Nov 2026) mengikuti PERSIS template HTML contoh
	// Pantau_Trip_ke_warjok__HTML_Rapih.html: header logo + lencana
	// autorefresh, hero, bar refresh, kartu peta, kartu anggota (bukan
	// bullet list), kartu SOS. Template HANYA referensi desain: semua
	// data di halaman ini LIVE dari alur pantau yang sudah ada
	// (api.sharedTrip + buildPantauMapInput); tidak ada satu pun data
	// demo template yang di-hardcode. Deviasi yang terpaksa (payload
	// publik tidak membawa nama tempat, API tidak disentuh): pill
	// lokasi template tidak ditampilkan; toggle Standar/Satelit dan
	// fokus peta memakai createMap yang sudah ada (toggle bawaan
	// createMap; fokus = center min zoom 14 tanpa popup karena marker
	// anggota bersama tidak punya popup); subtitel peta generik tanpa
	// nama area; autorefresh 5 detik melakukan
	// refetch live (bukan sekadar bump timestamp seperti template yang
	// datanya statis) dan kamera peta tidak digeser ulang tiap refresh.
	import { onDestroy, onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { api, ApiError } from '#lib/api';
	import { locale, t } from '#lib/i18n/index';
	import { createMap, type MapHandle } from '#lib/map';
	import { buildPantauMapInput } from '#lib/pantau-map';
	import {
		isPantauScopeAllowed,
		trackedMemberCount,
		type SharedTripView
	} from '#lib/public-trip';
	import type { TripPosition } from '#lib/types';

	type State = 'loading' | 'notFound' | 'ready' | 'error';

	let viewState = $state<State>('loading');
	let view = $state<SharedTripView | null>(null);
	let token = $state('');
	let mapEl: HTMLDivElement | undefined = $state();
	let mapHandle: MapHandle | null = null;
	let mapError = $state(false);
	let mapFitted = false;
	let paused = $state(false);
	let refreshCount = $state(0);
	let lastUpdated = $state('—');
	let timer: ReturnType<typeof setInterval> | null = null;

	const mapInput = $derived(view ? buildPantauMapInput(view) : null);
	const tracked = $derived(view ? trackedMemberCount(view) : 0);

	// Token dari path /pantau/{token} (alasan sama seperti /undang:
	// $app/stores tidak ter-resolve di svelte-check repo ini).
	function tokenFromPath(): string {
		return window.location.pathname.split('/').filter(Boolean)[1] ?? '';
	}

	function formatNow(): string {
		return new Date().toLocaleString($locale === 'en' ? 'en-US' : 'id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function stopPolling() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function startPolling() {
		stopPolling();
		if (!paused) timer = setInterval(() => void load(true), 5000);
	}

	function togglePause() {
		paused = !paused;
		if (paused) stopPolling();
		else startPolling();
	}

	// quiet = refresh berkala/manual: tidak ada flash "memuat", data
	// lama dipertahankan bila refetch gagal, hitung + timestamp hanya
	// naik bila refetch berhasil.
	async function load(quiet = false) {
		if (!quiet) viewState = 'loading';
		try {
			const res = await api.sharedTrip(token);
			if (!isPantauScopeAllowed(res.scope)) {
				viewState = 'notFound';
				stopPolling();
				return;
			}
			view = res;
			viewState = 'ready';
			refreshCount += 1;
			lastUpdated = formatNow();
			if (!quiet) startPolling();
		} catch (e) {
			if (!quiet) viewState = e instanceof ApiError ? 'notFound' : 'error';
		}
	}

	onMount(() => {
		token = tokenFromPath();
		void load();
	});

	onDestroy(() => {
		stopPolling();
		mapHandle?.destroy();
	});

	// Peta dibuat sekali, hanya bila ada anggota berposisi. Render
	// pertama mengikuti perilaku lama (satu titik -> fokus min zoom 14,
	// banyak titik -> fitBounds); refresh berikutnya hanya memperbarui
	// marker tanpa menggeser kamera user. Gagal muat Leaflet ->
	// keterangan jujur, daftar kartu tetap tampil.
	async function updateMap() {
		if (!mapEl || !mapInput?.hasMap) return;
		try {
			if (!mapHandle) {
				mapHandle = await createMap(
					mapEl,
					env.PUBLIC_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
					{ standard: $t('map.styleStandard'), satellite: $t('map.styleSatellite') }
				);
			}
			if (!mapFitted) {
				if (mapInput.locations.length === 1) {
					mapHandle.setData(mapInput.locations, mapInput.roles, mapInput.sos, false);
					mapHandle.focusPoint(mapInput.locations[0]);
				} else {
					mapHandle.setData(mapInput.locations, mapInput.roles, mapInput.sos, true);
				}
				mapFitted = true;
			} else {
				mapHandle.setData(mapInput.locations, mapInput.roles, mapInput.sos, false);
			}
		} catch {
			mapError = true;
		}
	}

	$effect(() => {
		if (mapInput?.hasMap && mapEl) void updateMap();
	});

	function focusMemberPos(pos: TripPosition) {
		if (pos.location && mapHandle) mapHandle.focusPoint(pos.location);
	}
</script>

<svelte:head>
	<title>{$t('pantau.title')} — GoBareng</title>
</svelte:head>

<div class="page">
	<main class="wrap">
		<!-- HEADER + LOGO (persis template) -->
		<header class="header">
			<div class="logo">
				<span class="logo-mark" aria-hidden="true">
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="#fff"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><path d="M3 20 9 9l3 5 3-4 6 10Z" /><path d="M3 20h18" /></svg
					>
				</span>
				<span class="logo-text"><b>GoBareng</b><span>{$t('pantau.title')}</span></span>
			</div>
			{#if viewState === 'ready'}
				<span class="auto"
					><span class="dot" class:paused></span><span
						>{paused ? $t('pantau.autoPaused') : $t('pantau.autoRefresh')}</span
					></span
				>
			{/if}
		</header>

		{#if viewState === 'loading'}
			<p>{$t('pantau.loading')}</p>
		{:else if viewState === 'notFound'}
			<p>{$t('pantau.notFound')}</p>
		{:else if viewState === 'error'}
			<p>{$t('pantau.errorGeneric')}</p>
		{:else if view}
			<!-- HERO (persis template; pill lokasi tidak ada: payload
			     publik tidak membawa nama tempat, API tidak disentuh) -->
			<section class="hero">
				<small>{$t('pantau.tripWatched')}</small>
				<h1>{view.trip.name}</h1>
				<div class="row">
					<span class="pill"
						>● {view.status === 'SOS_ACTIVE'
							? $t('pantau.statusSos')
							: $t('pantau.statusSafe')}</span
					>
					<span class="pill solid">{$t('pantau.membersTracked', { n: String(tracked) })}</span>
				</div>
			</section>

			<!-- REFRESH (persis template) -->
			<section class="refresh">
				<span>{$t('pantau.lastUpdated')} <strong>{lastUpdated}</strong></span>
				<span>{$t('pantau.refreshCount')}<strong>{refreshCount}</strong></span>
				<button class="primary" onclick={() => void load(true)}>{$t('pantau.refreshNow')}</button>
				<button onclick={togglePause}
					>{paused ? $t('pantau.resumeRefresh') : $t('pantau.pauseRefresh')}</button
				>
			</section>

			<!-- MAP (kartu template; mesin peta = createMap lama) -->
			<section class="card">
				<h2>{$t('pantau.mapTitle')}</h2>
				<p class="sub">{$t('pantau.mapSubtitle')}</p>
				<div class="map-wrap">
					{#if mapError}
						<p>{$t('pantau.mapLoadFailed')}</p>
					{:else if mapInput?.hasMap}
						<div class="map" bind:this={mapEl}></div>
					{:else}
						<p>{$t('pantau.mapNoPositions')}</p>
					{/if}
				</div>
			</section>

			<!-- POSISI ANGGOTA — KARTU, BUKAN BULLET (persis template) -->
			<section class="card">
				<h2>{$t('pantau.positionsTitle')}</h2>
				<p class="sub">{$t('pantau.positionsSubtitle')}</p>
				{#if view.positions.length === 0}
					<p>{$t('pantau.noPositions')}</p>
				{:else}
					{#each view.positions as pos (pos.userId)}
						{@const loc = pos.location}
						<div class="member">
							<div class="avatar" class:online={loc !== null}>
								{pos.user.name.charAt(0).toUpperCase() || '?'}
							</div>
							<div class="member-info">
								<div class="name">{pos.user.name} <span class="badge">{pos.role}</span></div>
								{#if loc}
									<div class="online-line">● {$t('pantau.memberOnline')}</div>
									<div class="coords"><code>{loc.lat}, {loc.lon}</code></div>
								{:else}
									<div class="muted-line">{$t('pantau.memberNoPosition')}</div>
								{/if}
							</div>
							{#if loc}
								<div class="member-actions">
									<a
										href={`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}`}
										target="_blank"
										rel="noopener noreferrer"
									>{$t('pantau.directionToCoords')}</a>
									<button class="primary" onclick={() => focusMemberPos(pos)}
										>{$t('pantau.focusMap')}</button
									>
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</section>

			<!-- SOS AKTIF — KARTU AMAN / PERINGATAN MERAH -->
			<section class="card">
				<h2>{$t('pantau.sosTitle')}</h2>
				{#if view.activeSos.length === 0}
					<div class="sos">
						<div class="check">✓</div>
						<div>
							<b>{$t('pantau.noSos')}</b>
							<p>{$t('pantau.noSosNote')}</p>
						</div>
					</div>
				{:else}
					<div class="sos danger">
						<div class="check">!</div>
						<div>
							<b>{$t('pantau.statusSos')}</b>
							<ul class="sos-list">
								{#each view.activeSos as sos (sos.id)}
									<li>
										{sos.reason} — {sos.senderName ?? ''} — {sos.status}
									</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	.page {
		background: #eef2f7;
		min-height: 100vh;
	}
	.wrap {
		max-width: 760px;
		margin: 0 auto;
		padding: 24px 20px 44px;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
		color: #0f172a;
	}
	/* Header dengan logo */
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		padding: 14px 16px;
		box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
	}
	.logo {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.logo-mark {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background: linear-gradient(135deg, #14b8a6, #0f766e);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
	}
	.logo-mark svg {
		width: 26px;
		height: 26px;
	}
	.logo-text {
		line-height: 1.1;
	}
	.logo-text b {
		font-size: 19px;
		color: #0f766e;
		letter-spacing: -0.02em;
	}
	.logo-text span {
		display: block;
		font-size: 13px;
		color: #64748b;
	}
	.auto {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 7px;
		background: #f0fdfa;
		border: 1px solid #ccfbf1;
		color: #0f766e;
		border-radius: 99px;
		padding: 7px 12px;
		font-size: 13px;
		font-weight: 600;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #10b981;
		animation: pulse 1.6s infinite;
	}
	.dot.paused {
		background: #94a3b8;
		animation: none;
	}
	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5);
		}
		70% {
			box-shadow: 0 0 0 7px rgba(16, 185, 129, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
		}
	}
	/* Hero */
	.hero {
		background: linear-gradient(135deg, #0f766e, #14b8a6);
		color: #fff;
		border-radius: 20px;
		padding: 24px;
		margin-top: 16px;
		box-shadow: 0 10px 28px rgba(15, 118, 110, 0.25);
	}
	.hero small {
		opacity: 0.85;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 12px;
		font-weight: 700;
	}
	.hero h1 {
		font-size: 42px;
		margin: 6px 0 10px;
		letter-spacing: -0.02em;
	}
	.hero .row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	.pill {
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
	.pill.solid {
		background: #fff;
		color: #0f766e;
		border-color: #fff;
	}
	/* Refresh bar */
	.refresh {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 12px 14px;
		margin-top: 14px;
		font-size: 13px;
		color: #334155;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
	}
	.refresh strong {
		color: #0f172a;
	}
	button {
		border: 1px solid #cbd5e1;
		background: #fff;
		border-radius: 10px;
		padding: 8px 13px;
		cursor: pointer;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
	}
	button.primary {
		background: #0d9488;
		border-color: #0d9488;
		color: #fff;
	}
	button:hover {
		border-color: #0d9488;
	}
	.member-actions a {
		border: 1px solid #cbd5e1;
		background: #fff;
		border-radius: 10px;
		padding: 8px 13px;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		color: #0f172a;
	}
	.member-actions a:hover {
		border-color: #0d9488;
	}
	/* Cards */
	.card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 20px;
		padding: 20px;
		margin-top: 16px;
		box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
	}
	.card h2 {
		font-size: 19px;
		margin: 0 0 4px;
	}
	.card .sub {
		color: #64748b;
		font-size: 13px;
		margin: 0 0 14px;
	}
	.map-wrap {
		position: relative;
	}
	.map {
		height: 420px;
		border-radius: 14px;
		border: 1px solid #e2e8f0;
		background: #dbeafe;
		z-index: 1;
	}
	/* Member card — bukan lagi bullet list */
	.member {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 16px;
		flex-wrap: wrap;
	}
	.member + .member {
		margin-top: 12px;
	}
	.avatar {
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
		position: relative;
	}
	.avatar.online::after {
		content: '';
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 13px;
		height: 13px;
		border-radius: 50%;
		background: #22c55e;
		border: 2px solid #fff;
	}
	.member-info {
		flex: 1;
		min-width: 220px;
	}
	.member-info .name {
		font-size: 18px;
		font-weight: 800;
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.badge {
		background: #ccfbf1;
		color: #0f766e;
		border-radius: 99px;
		padding: 3px 10px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
	}
	.online-line {
		color: #64748b;
		font-size: 13px;
		margin-top: 3px;
	}
	.muted-line {
		color: #64748b;
		font-size: 13px;
		margin-top: 3px;
	}
	.coords {
		margin-top: 8px;
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.coords code {
		background: #0f172a;
		color: #e2e8f0;
		padding: 7px 11px;
		border-radius: 9px;
		font-size: 13px;
	}
	.member-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	/* SOS card */
	.sos {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		background: #ecfdf5;
		border: 1px solid #a7f3d0;
		border-radius: 16px;
		padding: 18px;
	}
	.sos.danger {
		background: #fef2f2;
		border-color: #fecaca;
	}
	.check {
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
	.sos.danger .check {
		background: #dc2626;
	}
	.sos b {
		font-size: 17px;
	}
	.sos.danger b {
		color: #991b1b;
	}
	.sos p {
		margin: 5px 0 0;
		color: #065f46;
		font-size: 14px;
		line-height: 1.5;
	}
	.sos-list {
		margin: 8px 0 0;
		padding-left: 18px;
		color: #7f1d1d;
		font-size: 14px;
		line-height: 1.7;
	}
	@media (max-width: 560px) {
		.hero h1 {
			font-size: 32px;
		}
		.map {
			height: 320px;
		}
		.auto {
			margin-left: 0;
		}
	}
</style>
