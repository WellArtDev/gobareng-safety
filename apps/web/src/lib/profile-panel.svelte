<script lang="ts">
	import { t } from '#lib/i18n/index';
	import type { Me } from '#lib/types';

	// Halaman Profil tanpa tab: tab Ubah Kata Sandi dicopot (tindak lanjut
	// #122 — submit-nya 410 OTP_ONLY). Panel ini langsung menampilkan
	// konten Profil; ganti email tetap memakai gate kata sandi saat ini
	// lewat onChangeEmail, itu bukan tab ubah kata sandi.
	type Props = {
		user?: Me | null;
		nameNotice?: string | null;
		nameError?: string | null;
		onChangeName?: (name: string) => Promise<boolean> | boolean | void;
		emailNotice?: string | null;
		emailError?: string | null;
		onChangeEmail?: (
			email: string,
			currentPassword: string
		) => Promise<boolean> | boolean | void;
		avatarNotice?: string | null;
		avatarError?: string | null;
		onUploadAvatar?: (file: File) => Promise<boolean> | boolean | void;
		onDeleteAvatar?: () => Promise<boolean> | boolean | void;
	};

	let {
		user = null,
		nameNotice = null,
		nameError = null,
		onChangeName,
		emailNotice = null,
		emailError = null,
		onChangeEmail,
		avatarNotice = null,
		avatarError = null,
		onUploadAvatar,
		onDeleteAvatar
	}: Props = $props();

	// Avatar & User Info
	const initial = $derived(
		(user?.name || user?.email || '?').slice(0, 1).toUpperCase()
	);
	const roleLabel = $derived(
		user?.role === 'admin'
			? $t('dashboard.profileRoleAdmin')
			: user?.role === 'command_center'
				? $t('dashboard.profileRoleCommandCenter')
				: (user?.role ?? '-')
	);

	let fileInputEl: HTMLInputElement | undefined = $state();
	let isUploadingAvatar = $state(false);
	let isDeletingAvatar = $state(false);
	let avatarErrorFallback = $state(false);

	async function handleFileChange(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;
		if (onUploadAvatar) {
			isUploadingAvatar = true;
			try {
				await onUploadAvatar(file);
				target.value = '';
				avatarErrorFallback = false;
			} finally {
				isUploadingAvatar = false;
			}
		}
	}

	async function handleAvatarDelete() {
		if (!onDeleteAvatar) return;
		isDeletingAvatar = true;
		try {
			await onDeleteAvatar();
			avatarErrorFallback = false;
		} finally {
			isDeletingAvatar = false;
		}
	}

	// Nama
	let profileName = $state('');
	let lastUserName = $state<string | undefined>(undefined);
	$effect(() => {
		if (user?.name && user.name !== lastUserName) {
			profileName = user.name;
			lastUserName = user.name;
		}
	});
	let isSavingName = $state(false);

	async function submitName(e: SubmitEvent) {
		e.preventDefault();
		if (!onChangeName || !profileName.trim()) return;
		isSavingName = true;
		try {
			await onChangeName(profileName.trim());
		} finally {
			isSavingName = false;
		}
	}

	// Email
	let newEmail = $state('');
	let emailPassword = $state('');
	let isSavingEmail = $state(false);

	async function submitEmail(e: SubmitEvent) {
		e.preventDefault();
		if (!onChangeEmail || !newEmail.trim() || !emailPassword) return;
		isSavingEmail = true;
		try {
			const ok = await onChangeEmail(newEmail.trim(), emailPassword);
			if (ok !== false) {
				newEmail = '';
				emailPassword = '';
			}
		} finally {
			isSavingEmail = false;
		}
	}

</script>

<div class="profile-page" data-profile-panel>
	<header class="profile-page-head">
		<h1>{$t('dashboard.profilePageTitle')}</h1>
		<p>{$t('dashboard.profilePageSubtitle')}</p>
	</header>

	<div class="profile-grid">
			<!-- Card 1: Foto Profil & Ringkasan Akun -->
			<section class="profile-card" data-profile-card="avatar">
				<div class="profile-card-head">
					<h2>{$t('dashboard.avatarTitle')}</h2>
					<p class="profile-muted">{$t('dashboard.avatarHint')}</p>
				</div>
				<div class="profile-card-body avatar-section">
					<div class="avatar-preview-wrap">
						{#if user?.avatarUrl && !avatarErrorFallback}
							<img
								class="avatar-preview-img"
								src={user.avatarUrl}
								alt={$t('dashboard.avatarAlt')}
								onerror={() => (avatarErrorFallback = true)}
							/>
						{:else}
							<span class="avatar-preview-fallback" aria-hidden="true">
								{initial}
							</span>
						{/if}
						<div class="avatar-user-info">
							<h3>{user?.name || 'User'}</h3>
							<p class="avatar-email">{user?.email || '-'}</p>
							<div class="role-badge-wrap">
								<span class="role-pill">
									{roleLabel}
								</span>
							</div>
						</div>
					</div>

					<input
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif"
						class="visually-hidden"
						bind:this={fileInputEl}
						onchange={handleFileChange}
					/>

					<div class="avatar-actions">
						<button
							type="button"
							class="btn-primary"
							disabled={isUploadingAvatar}
							onclick={() => fileInputEl?.click()}
						>
							<span aria-hidden="true">📷</span>
							<span>{isUploadingAvatar ? '...' : $t('dashboard.avatarUpload')}</span>
						</button>
						{#if user?.avatarUrl}
							<button
								type="button"
								class="btn-danger"
								disabled={isDeletingAvatar}
								onclick={handleAvatarDelete}
							>
								<span>{isDeletingAvatar ? '...' : $t('dashboard.avatarDelete')}</span>
							</button>
						{/if}
					</div>

					{#if avatarNotice === 'changed'}
						<div class="profile-notice" role="status">{$t('dashboard.avatarChanged')}</div>
					{:else if avatarNotice === 'deleted'}
						<div class="profile-notice" role="status">{$t('dashboard.avatarDeleted')}</div>
					{/if}
					{#if avatarError}
						<div class="profile-error" role="alert">{avatarError}</div>
					{/if}
				</div>
			</section>

			<!-- Card 2: Informasi Pribadi & Ganti Nama/Email -->
			<div class="profile-forms-col">
				<!-- Ganti Nama -->
				<section class="profile-card" data-profile-card="name">
					<div class="profile-card-head">
						<h2>{$t('dashboard.profileNameTitle')}</h2>
					</div>
					<form class="profile-card-body profile-form" onsubmit={submitName}>
						<label class="profile-field">
							<span>{$t('dashboard.profileNameLabel')}</span>
							<input
								type="text"
								required
								minlength="2"
								bind:value={profileName}
								placeholder={$t('dashboard.profileNameLabel')}
							/>
						</label>

						{#if nameNotice === 'changed'}
							<div class="profile-notice" role="status">{$t('dashboard.profileNameChanged')}</div>
						{/if}
						{#if nameError}
							<div class="profile-error" role="alert">{nameError}</div>
						{/if}

						<div class="form-actions">
							<button
								type="submit"
								class="btn-primary"
								disabled={isSavingName || !profileName.trim() || profileName === user?.name}
							>
								{isSavingName ? '...' : $t('dashboard.profileNameSave')}
							</button>
						</div>
					</form>
				</section>

				<!-- Ganti Email -->
				<section class="profile-card" data-profile-card="email">
					<div class="profile-card-head">
						<h2>{$t('dashboard.emailTitle')}</h2>
						<p class="profile-muted">
							{$t('dashboard.profileEmailCurrent')}: <strong>{user?.email || '-'}</strong>
						</p>
					</div>
					<form class="profile-card-body profile-form" onsubmit={submitEmail}>
						<label class="profile-field">
							<span>{$t('dashboard.emailNew')}</span>
							<input
								type="email"
								required
								bind:value={newEmail}
								placeholder="contoh@domain.com"
							/>
						</label>

						<label class="profile-field">
							<span>{$t('dashboard.emailPasswordConfirm')}</span>
							<input
								type="password"
								required
								bind:value={emailPassword}
								placeholder="••••••••"
								autocomplete="current-password"
							/>
							<small>{$t('dashboard.emailPasswordConfirmHint')}</small>
						</label>

						{#if emailNotice === 'changed'}
							<div class="profile-notice" role="status">{$t('dashboard.emailChanged')}</div>
						{/if}
						{#if emailError}
							<div class="profile-error" role="alert">{emailError}</div>
						{/if}

						<div class="form-actions">
							<button
								type="submit"
								class="btn-primary"
								disabled={isSavingEmail || !newEmail.trim() || !emailPassword}
							>
								{isSavingEmail ? '...' : $t('dashboard.emailSave')}
							</button>
						</div>
					</form>
				</section>
			</div>
		</div>
</div>

<style>
	.profile-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 100%;
		box-sizing: border-box;
	}

	.profile-page-head h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.profile-page-head p {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 13.5px;
		line-height: 1.5;
	}

	/* Layout Grids */
	.profile-grid {
		display: grid;
		grid-template-columns: 340px minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.profile-forms-col {
		display: flex;
		flex-direction: column;
		gap: 20px;
		min-width: 0;
	}

	/* Cards */
	.profile-card {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.profile-card-head {
		padding: 16px 20px;
		border-bottom: 1px solid var(--line);
	}
	.profile-card-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
		letter-spacing: -0.01em;
	}
	.profile-muted {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.profile-card-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* Avatar Section */
	.avatar-preview-wrap {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.avatar-preview-img {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid var(--line);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	.avatar-preview-fallback {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--green-soft);
		color: var(--green-d);
		border: 2px solid var(--line);
		font-size: 28px;
		font-weight: 800;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	.avatar-user-info h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--ink);
	}
	.avatar-email {
		margin: 2px 0 6px;
		font-size: 13px;
		color: var(--muted);
	}
	.role-pill {
		display: inline-flex;
		align-items: center;
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 11.5px;
		font-weight: 700;
		background: var(--green-soft);
		color: var(--green-d);
		border: 1px solid var(--green);
	}
	.avatar-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	/* Form & Fields */
	.profile-form {
		margin: 0;
	}
	.profile-field {
		display: grid;
		gap: 6px;
	}
	.profile-field > span {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}
	.profile-field input {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		font: inherit;
		font-size: 13.5px;
		background: var(--card);
		color: var(--ink);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.profile-field input:focus {
		outline: none;
		border-color: var(--green);
		box-shadow: 0 0 0 3px var(--green-soft);
	}
	.profile-field small {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.4;
	}

	/* Buttons */
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 0;
		border-radius: 10px;
		padding: 9px 18px;
		background: var(--green);
		color: #fff;
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, transform 0.1s ease;
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--green-d);
	}
	.btn-primary:active:not(:disabled) {
		transform: translateY(1px);
	}
	.btn-primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.btn-primary:focus-visible,
	.btn-danger:focus-visible {
		outline: 3px solid var(--orange);
		outline-offset: 2px;
	}
	.btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 9px 18px;
		background: var(--card2);
		color: var(--red);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
	}
	.btn-danger:hover:not(:disabled) {
		background: var(--red-soft);
		border-color: var(--red);
	}
	.btn-danger:active:not(:disabled) {
		transform: translateY(1px);
	}
	.btn-danger:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 4px;
	}

	/* Notices */
	.profile-notice,
	.profile-error {
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.45;
	}
	.profile-notice {
		background: var(--green-soft);
		color: var(--green-d);
		border: 1px solid var(--green);
	}
	.profile-error {
		background: var(--red-soft);
		color: var(--red);
		border: 1px solid var(--red);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}

	@media (max-width: 800px) {
		.profile-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
