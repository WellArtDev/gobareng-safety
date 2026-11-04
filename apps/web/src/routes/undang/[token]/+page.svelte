<script lang="ts">
	// Landing undangan trip (INVITE, 2 Nov 2026) — PUBLIK, tanpa login.
	// Undangan berlaku sampai trip dimulai (hanya PLANNED); kuota
	// dihitung dari anggota yang sudah join. Saat kuota penuh tampil
	// pesan + link WhatsApp leader (hanya bila leader punya nomor
	// tersimpan; tanpa nomor -> teks saja, tanpa link rusak).
	// Pengunjung belum login -> simpan token, login OTP di /, lalu
	// diarahkan kembali ke sini (hook di +page.svelte verifyOtpCode).
	// Teman yang BELUM PUNYA AKUN tidak bisa gabung lewat web
	// (dashboard tidak membuat akun): daftar dulu lewat aplikasi
	// GoBareng, lalu buka lagi tautan ini.
	import { onMount } from 'svelte';
	import { api, ApiError, getToken } from '#lib/api';
	import { t } from '#lib/i18n/index';
	import {
		isQuotaFull,
		PENDING_INVITE_KEY,
		waLeaderUrl,
		type InviteResolve
	} from '#lib/public-trip';

	type State =
		| 'loading'
		| 'notFound'
		| 'started'
		| 'closed'
		| 'quotaFull'
		| 'ready'
		| 'joined'
		| 'error';

	let viewState = $state<State>('loading');
	let invite = $state<InviteResolve | null>(null);
	let errorCode = $state<string | null>(null);
	let loggedIn = $state(false);
	let token = $state('');

	// Token dari path /undang/{token}. $app/stores tidak dipakai: alias
	// $app tidak ter-resolve di svelte-check repo ini (tidak ada file
	// lama yang memakainya); halaman ini client-only (ssr=false).
	function tokenFromPath(): string {
		return window.location.pathname.split('/').filter(Boolean)[1] ?? '';
	}

	async function load() {
		viewState = 'loading';
		try {
			const res = await api.inviteResolve(token);
			invite = res;
			loggedIn = getToken() !== null;
			if (!res.usable) {
				viewState = res.trip.status === 'CLOSED' ? 'closed' : 'started';
			} else if (isQuotaFull(res.quota, res.memberCount)) {
				viewState = 'quotaFull';
			} else {
				viewState = 'ready';
			}
		} catch (e) {
			if (e instanceof ApiError) {
				viewState =
					e.code === 'INVITE_NOT_FOUND' || e.code === 'TRIP_NOT_FOUND'
						? 'notFound'
						: 'error';
				errorCode = e.code;
			} else {
				viewState = 'error';
			}
		}
	}

	function loginToJoin() {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem(PENDING_INVITE_KEY, token);
		}
		window.location.href = '/';
	}

	async function join() {
		try {
			await api.joinViaInvite(token);
			viewState = 'joined';
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'QUOTA_FULL') viewState = 'quotaFull';
				else if (e.code === 'TRIP_STARTED') viewState = 'started';
				else if (e.code === 'TRIP_CLOSED') viewState = 'closed';
				else if (
					e.code === 'INVITE_NOT_FOUND' ||
					e.code === 'TRIP_NOT_FOUND'
				)
					viewState = 'notFound';
				else {
					errorCode = e.code;
					viewState = 'error';
				}
			} else {
				viewState = 'error';
			}
		}
	}

	onMount(() => {
		token = tokenFromPath();
		void load();
	});
</script>

<svelte:head>
	<title>{$t('undang.title')} — GoBareng</title>
</svelte:head>

<div class="page">
	<main class="wrap">
		<header class="head">
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
			<span class="logo-text"><strong>GoBareng</strong><span>{$t('undang.title')}</span></span>
		</header>

		<section class="card">
			{#if viewState === 'loading'}
				<p class="state">{$t('undang.loading')}</p>
			{:else if viewState === 'notFound'}
				<p class="state">{$t('undang.notFound')}</p>
			{:else if viewState === 'started'}
				<p class="state">{$t('undang.started')}</p>
			{:else if viewState === 'closed'}
				<p class="state">{$t('undang.closed')}</p>
			{:else if viewState === 'quotaFull'}
				<p class="state">{$t('undang.quotaFull')}</p>
				{#if invite?.leaderPhone && waLeaderUrl(invite.leaderPhone)}
					<p class="state">
						<a href={waLeaderUrl(invite.leaderPhone)} target="_blank" rel="noreferrer">
							{$t('undang.contactLeader')}
						</a>
					</p>
				{/if}
			{:else if viewState === 'joined'}
				<h1>{$t('undang.joinedTitle')}</h1>
				<p class="note">{$t('undang.joinedNote')}</p>
			{:else if viewState === 'error'}
				<p class="state">
					{$t('undang.errorGeneric')}{errorCode ? ` (${errorCode})` : ''}
				</p>
			{:else if invite}
				<span class="badge" class:touring={invite.trip.type === 'TOURING'}>
					{invite.trip.type === 'HIKING'
						? $t('undang.typeHiking')
						: $t('undang.typeTouring')}
				</span>
				<h1>{invite.trip.name}</h1>
				<dl class="info">
					<div class="row">
						<dt>{$t('undang.typeLabel')}</dt>
						<dd>
							{invite.trip.type === 'HIKING'
								? $t('undang.typeHiking')
								: $t('undang.typeTouring')}
						</dd>
					</div>
					<div class="row">
						<dt>{$t('undang.dateLabel')}</dt>
						<dd>{invite.trip.date}</dd>
					</div>
					<div class="row">
						<dt>{$t('undang.meetingLabel')}</dt>
						<dd><code>{invite.trip.meetingPoint}</code></dd>
					</div>
					{#if invite.trip.destination}
						<div class="row">
							<dt>{$t('undang.destinationLabel')}</dt>
							<dd><code>{invite.trip.destination}</code></dd>
						</div>
					{/if}
				</dl>
				<div class="members">
					<div class="members-head">
						<span>{$t('undang.membersLabel')}</span>
						<strong>
							{invite.memberCount}{invite.quota !== null ? `/${invite.quota}` : ''}
						</strong>
					</div>
					{#if invite.quota !== null}
						<div
							class="progress"
							role="progressbar"
							aria-valuemin={0}
							aria-valuemax={invite.quota}
							aria-valuenow={invite.memberCount}
						>
							<div
								class="progress-fill"
								style={`width: ${Math.min(100, Math.round((invite.memberCount / invite.quota) * 100))}%`}
							></div>
						</div>
					{/if}
				</div>
				{#if invite.trip.price !== null}
					<p class="note">{$t('undang.priceNote')}</p>
				{/if}
				{#if loggedIn}
					<button class="primary" onclick={join}>{$t('undang.joinButton')}</button>
				{:else}
					<button class="primary" onclick={loginToJoin}>
						{$t('undang.loginButton')}
					</button>
					<p class="note">{$t('undang.noAccountNote')}</p>
				{/if}
			{/if}
		</section>

		<footer class="motto">
			Go bareng, pergi bareng, pulang bareng dengan selamat.
		</footer>
	</main>
</div>

<style>
	.page {
		background: #eef2f7;
		min-height: 100vh;
	}
	.wrap {
		max-width: 560px;
		margin: 0 auto;
		padding: 24px 16px 48px;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
		color: #0f172a;
	}
	.head {
		display: flex;
		gap: 12px;
		align-items: center;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 18px;
		padding: 14px 16px;
		box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
	}
	.logo-mark {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background: linear-gradient(135deg, #108b93, #268c4a);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-shadow: 0 4px 12px rgba(16, 139, 147, 0.35);
	}
	.logo-mark svg {
		width: 26px;
		height: 26px;
	}
	.logo-text {
		line-height: 1.1;
	}
	.logo-text strong {
		display: block;
		font-size: 19px;
		color: #108b93;
		letter-spacing: -0.02em;
	}
	.logo-text span {
		display: block;
		font-size: 13px;
		color: #64748b;
		margin-top: 2px;
	}
	.card {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-top: 4px solid #108b93;
		border-radius: 20px;
		padding: 24px;
		margin-top: 16px;
		box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
	}
	.card h1 {
		font-size: 32px;
		line-height: 1.2;
		letter-spacing: -0.02em;
		margin: 12px 0 20px;
		overflow-wrap: anywhere;
	}
	.badge {
		display: inline-block;
		background: #e6f4ea;
		color: #268c4a;
		border-radius: 99px;
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.badge.touring {
		background: #fff3e6;
		color: #f78308;
	}
	.info {
		margin: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid #e2e8f0;
	}
	.row:last-of-type {
		border-bottom: 0;
	}
	.row dt {
		color: #64748b;
		font-size: 14px;
	}
	.row dd {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.row code {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 13px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 3px 8px;
		overflow-wrap: anywhere;
	}
	.members {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 14px 16px;
		margin-top: 16px;
	}
	.members-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		font-size: 14px;
	}
	.members-head span {
		color: #64748b;
	}
	.members-head strong {
		font-size: 18px;
	}
	.progress {
		height: 10px;
		background: #e2e8f0;
		border-radius: 99px;
		overflow: hidden;
		margin-top: 10px;
	}
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #108b93, #268c4a);
		border-radius: 99px;
	}
	.primary {
		width: 100%;
		background: #108b93;
		color: #fff;
		border: 0;
		border-radius: 12px;
		padding: 14px 20px;
		margin-top: 20px;
		font: inherit;
		font-size: 16px;
		font-weight: 800;
		cursor: pointer;
		box-shadow: 0 6px 16px rgba(16, 139, 147, 0.3);
	}
	.primary:hover {
		background: #0d767e;
	}
	.primary:focus-visible {
		outline: 3px solid #f78308;
		outline-offset: 2px;
	}
	.note {
		color: #64748b;
		font-size: 14px;
		line-height: 1.6;
		margin: 14px 0 0;
	}
	.state {
		font-size: 16px;
		line-height: 1.6;
		margin: 0;
	}
	.state + .state {
		margin-top: 12px;
	}
	a {
		color: #108b93;
		font-weight: 700;
	}
	.motto {
		text-align: center;
		color: #64748b;
		font-size: 13px;
		font-style: italic;
		line-height: 1.6;
		padding: 20px 12px 0;
	}
	@media (max-width: 520px) {
		.wrap {
			padding: 16px 12px 40px;
		}
		.card {
			padding: 20px 16px;
		}
		.card h1 {
			font-size: 28px;
		}
		.row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
	}
</style>
