<script lang="ts">
	import { t } from '#lib/i18n/index';
	import type { PlatformSettings } from '#lib/types';

	type Props = {
		email?: string;
		displayName?: string;
		avatarUrl?: string | null;
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
		qrisNotice?: string | null;
		qrisError?: string | null;
		onUploadQris?: (file: File) => Promise<boolean> | boolean | void;
		onDeleteQris?: () => Promise<boolean> | boolean | void;
		platformSettings?: PlatformSettings | null;
		settingsSaving?: boolean;
		isStaffAdmin?: boolean;
		onTogglePlatformSetting?: (key: keyof PlatformSettings) => void | Promise<void>;
		onUpdatePlatformSettings?: (patch: Partial<PlatformSettings>) => void | Promise<void>;
	};

	let {
		qrisNotice = null,
		qrisError = null,
		onUploadQris,
		onDeleteQris,
		platformSettings = null,
		settingsSaving = false,
		isStaffAdmin = true,
		onTogglePlatformSetting,
		onUpdatePlatformSettings
	}: Props = $props();

	let qrisFile = $state<File | null>(null);

	// Local fallback state if platformSettings is not provided (or for offline/test usage)
	let localSettings = $state<PlatformSettings>({
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
		otpEmail: true,
		otpSms: true,
		otpWhatsapp: false,
		aiV: true,
		aiP: true,
		aiL: true,
		aiQ: true,
		aiR: true,
		aiG: true,
		notifVerifyEmail: true,
		notifVerifyWhatsapp: true,
		notifVerifySms: true,
		notifCheckinEmail: true,
		notifCheckinWhatsapp: true,
		notifCheckinSms: true,
		brevoSenderEmail: '',
		brevoSmsSender: '',
		brevoWhatsappSenderNumber: '',
		brevoWhatsappTemplateId: '',
		defaultQuota: 15,
		currency: 'IDR',
		timezone: 'WIB',
		proQrisUrl: '',
		whatsappProvider: 'official'
	});

	// Matriks notifikasi: baris = event, kolom = kanal.
	// SOS sengaja hanya 2 kolom (WhatsApp + SMS, Wella 1 Nov 2026):
	// kolom Email dirender kosong supaya switch tetap sejajar header.
	const notifMatrix = [
		{
			labelKey: 'dashboard.notifRegist',
			hintKey: 'dashboard.notifRegistHint',
			keys: ['notifRegistEmail', 'notifRegistWhatsapp', 'notifRegistSms']
		},
		{
			labelKey: 'dashboard.notifSos',
			hintKey: 'dashboard.notifSosHint',
			keys: [null, 'notifSosWhatsapp', 'notifSosSms']
		},
		{
			labelKey: 'dashboard.notifVerify',
			hintKey: 'dashboard.notifVerifyHint',
			keys: ['notifVerifyEmail', 'notifVerifyWhatsapp', 'notifVerifySms']
		},
		{
			labelKey: 'dashboard.notifCheckin',
			hintKey: 'dashboard.notifCheckinHint',
			keys: ['notifCheckinEmail', 'notifCheckinWhatsapp', 'notifCheckinSms']
		}
	] as const;

	// Toggle kanal OTP register/login (Wella 1 Nov 2026).
	const otpChannels = [
		{ key: 'otpEmail', labelKey: 'dashboard.otpEmail' },
		{ key: 'otpSms', labelKey: 'dashboard.otpSms' },
		{ key: 'otpWhatsapp', labelKey: 'dashboard.otpWhatsapp' }
	] as const;
	// Modul AI (Wella 2 Nov 2026): 6 toggle, default nyala. Disusun 2
	// kolom di dalam kartu standar supaya tinggi kartu sepadan dengan
	// kartu Kode OTP (3 baris), bukan kartu yang dibesarkan.
	const aiModules = [
		{ key: 'aiV', labelKey: 'dashboard.aiV' },
		{ key: 'aiP', labelKey: 'dashboard.aiP' },
		{ key: 'aiL', labelKey: 'dashboard.aiL' },
		{ key: 'aiQ', labelKey: 'dashboard.aiQ' },
		{ key: 'aiR', labelKey: 'dashboard.aiR' },
		{ key: 'aiG', labelKey: 'dashboard.aiG' }
	] as const;
	const notifChannels = [
		'dashboard.channelEmail',
		'dashboard.channelWhatsapp',
		'dashboard.channelSms'
	] as const;

	// Gabungan: nilai parent menang, kunci yang tidak dikirim parent
	// (mis. di tes yang memakai platformSettings parsial) jatuh ke
	// default lokal — bukan undefined.
	const effectiveSettings = $derived({ ...localSettings, ...(platformSettings ?? {}) });

	// Toggle hanya untuk kunci Boolean; kunci teks Brevo tidak lewat
	// sini (punya form sendiri), jadi assignment boolean tidak boleh
	// menyentuh field string — itulah sumber error svelte-check
	// "boolean not assignable to never" setelah field teks ditambah.
	type BooleanSettingKey = {
		[K in keyof PlatformSettings]: PlatformSettings[K] extends boolean ? K : never;
	}[keyof PlatformSettings];

	function toggleSetting(key: BooleanSettingKey) {
		if (onTogglePlatformSetting) {
			saveKind = 'toggle';
			void onTogglePlatformSetting(key);
		} else {
			localSettings[key] = !localSettings[key];
			saveNotice = $t('dashboard.settingsToggleSaved');
		}
	}

	// Penyedia WhatsApp (Wella 3 Nov 2026): radio official/dikontak.
	// Sama seperti toggle — kirim PATCH lewat parent bila ada,
	// kalau tidak cukup ubah state lokal (mode tes/offline).
	function setWhatsappProvider(provider: 'official' | 'dikontak') {
		if (effectiveSettings.whatsappProvider === provider) return;
		localSettings.whatsappProvider = provider;
		if (onUpdatePlatformSettings) {
			saveKind = 'toggle';
			void onUpdatePlatformSettings({ whatsappProvider: provider });
		} else {
			saveNotice = $t('dashboard.settingsToggleSaved');
		}
	}

	// Draft setting Brevo: diisi sekali dari platformSettings saat
	// pertama tersedia, lalu disimpan lewat tombol Simpan (satu PATCH).
	let brevoDraft = $state({
		brevoSenderEmail: '',
		brevoSmsSender: '',
		brevoWhatsappSenderNumber: '',
		brevoWhatsappTemplateId: ''
	});
	let brevoDraftLoaded = $state(false);
	$effect(() => {
		if (!brevoDraftLoaded && platformSettings) {
			brevoDraft = {
				brevoSenderEmail: platformSettings.brevoSenderEmail ?? '',
				brevoSmsSender: platformSettings.brevoSmsSender ?? '',
				brevoWhatsappSenderNumber: platformSettings.brevoWhatsappSenderNumber ?? '',
				brevoWhatsappTemplateId: platformSettings.brevoWhatsappTemplateId ?? ''
			};
			brevoDraftLoaded = true;
		}
	});

	// Umpan balik simpan: pesan sukses role="status" di bawah header;
	// tombol Brevo menampilkan label sibuk selama settingsSaving.
	let saveNotice = $state<string | null>(null);
	let saveKind = $state<'brevo' | 'toggle' | 'security' | null>(null);
	let wasSaving = $state(false);
	$effect(() => {
		if (settingsSaving) {
			wasSaving = true;
		} else if (wasSaving && saveKind) {
			saveNotice =
				saveKind === 'brevo'
					? $t('dashboard.settingsBrevoSaved')
					: saveKind === 'security'
						? $t('dashboard.settingsSecuritySaved')
						: $t('dashboard.settingsToggleSaved');
			saveKind = null;
			wasSaving = false;
		}
	});

	function submitBrevo(event: SubmitEvent) {
		event.preventDefault();
		if (onUpdatePlatformSettings) {
			saveKind = 'brevo';
			void onUpdatePlatformSettings({ ...brevoDraft });
		} else {
			Object.assign(localSettings, brevoDraft);
			saveNotice = $t('dashboard.settingsBrevoSaved');
		}
	}

	async function submitQris(event: SubmitEvent) {
		event.preventDefault();
		if (onUploadQris && qrisFile) {
			const ok = await onUploadQris(qrisFile);
			if (ok !== false) qrisFile = null;
		}
	}

	async function deleteQris(event: MouseEvent) {
		event.preventDefault();
		if (onDeleteQris) await onDeleteQris();
	}

	// Draft kartu Keamanan & Batas: dimuat sekali dari setting tersimpan,
	// lalu dikirim lewat onUpdatePlatformSettings saat tombol simpan ditekan.
	let securityDraft = $state({ defaultQuota: 15, currency: 'IDR', timezone: 'WIB' });
	let securityDraftLoaded = $state(false);
	$effect(() => {
		if (!securityDraftLoaded) {
			securityDraft = {
				defaultQuota: effectiveSettings.defaultQuota ?? 15,
				currency: effectiveSettings.currency ?? 'IDR',
				timezone: effectiveSettings.timezone ?? 'WIB'
			};
			securityDraftLoaded = true;
		}
	});

	function submitSecurity(event: SubmitEvent) {
		event.preventDefault();
		const patch = {
			defaultQuota: Math.trunc(Number(securityDraft.defaultQuota)),
			currency: securityDraft.currency,
			timezone: securityDraft.timezone
		};
		if (onUpdatePlatformSettings) {
			saveKind = 'security';
			void onUpdatePlatformSettings(patch);
		} else {
			Object.assign(localSettings, patch);
			saveNotice = $t('dashboard.settingsSecuritySaved');
		}
	}
</script>

<div class="settings-page">
	<header class="settings-page-head">
		<h1>{$t('dashboard.menus.settings')}</h1>
		<p>{$t('dashboard.settingsDescription')}</p>
		{#if saveNotice}
			<p class="settings-notice" role="status" aria-live="polite">{saveNotice}</p>
		{/if}
	</header>

	<div class="settings-grid">
		<!-- Card 1: Notifikasi (Col 1) -->
		<section class="settings-card settings-notif-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.settingsNotifications')}</h2>
				<p class="settings-muted">{$t('dashboard.settingsNotificationsHint')}</p>
			</div>
			<div class="settings-matrix-head" aria-hidden="true">
				<span></span>
				{#each notifChannels as channelKey}
					<span>{$t(channelKey)}</span>
				{/each}
			</div>
			{#each notifMatrix as row}
				<div class="settings-matrix-row">
					<div><h3>{$t(row.labelKey)}</h3><p>{$t(row.hintKey)}</p></div>
					{#each row.keys as key, i}
						{#if key}
							<button
								class="settings-switch"
								class:on={effectiveSettings[key]}
								data-settings-switch={key}
								type="button"
								role="switch"
								aria-checked={effectiveSettings[key]}
								aria-label={`${$t(row.labelKey)} ${$t(notifChannels[i])}`}
								disabled={settingsSaving || !isStaffAdmin}
								onclick={() => toggleSetting(key)}
							></button>
						{:else}
							<span aria-hidden="true"></span>
						{/if}
					{/each}
				</div>
			{/each}
		</section>

		<!-- Card 2: Setting Brevo (Col 2) -->
		<section class="settings-card settings-brevo-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.brevoSettings')}</h2>
				<p class="settings-muted">{$t('dashboard.brevoSettingsHint')}</p>
			</div>
			<form class="settings-brevo-form" onsubmit={submitBrevo}>
				<label class="settings-field">
					<span>{$t('dashboard.brevoSenderEmail')}</span>
					<input
						data-settings-field="brevoSenderEmail"
						type="email"
						autocomplete="email"
						spellcheck={false}
						name="brevoSenderEmail"
						bind:value={brevoDraft.brevoSenderEmail}
						disabled={settingsSaving || !isStaffAdmin}
					/>
				</label>
				<label class="settings-field">
					<span>{$t('dashboard.brevoSmsSender')}</span>
					<input
						data-settings-field="brevoSmsSender"
						type="text"
						spellcheck={false}
						name="brevoSmsSender"
						bind:value={brevoDraft.brevoSmsSender}
						disabled={settingsSaving || !isStaffAdmin}
					/>
				</label>
				<label class="settings-field">
					<span>{$t('dashboard.brevoWhatsappSenderNumber')}</span>
					<input
						data-settings-field="brevoWhatsappSenderNumber"
						type="text"
						spellcheck={false}
						name="brevoWhatsappSenderNumber"
						inputmode="numeric"
						bind:value={brevoDraft.brevoWhatsappSenderNumber}
						disabled={settingsSaving || !isStaffAdmin}
					/>
					<small>{$t('dashboard.brevoWhatsappSenderNumberHint')}</small>
				</label>
				<label class="settings-field">
					<span>{$t('dashboard.brevoWhatsappTemplateId')}</span>
					<input
						data-settings-field="brevoWhatsappTemplateId"
						type="text"
						spellcheck={false}
						name="brevoWhatsappTemplateId"
						inputmode="numeric"
						bind:value={brevoDraft.brevoWhatsappTemplateId}
						disabled={settingsSaving || !isStaffAdmin}
					/>
					<small>{$t('dashboard.brevoWhatsappTemplateIdHint')}</small>
				</label>
				<button class="settings-primary" type="submit" disabled={settingsSaving || !isStaffAdmin}>
					{settingsSaving ? $t('dashboard.settingsBrevoSaving') : $t('dashboard.brevoSave')}
				</button>
			</form>
		</section>

		<!-- Card 3: Platform (Col 1) -->
		<section class="settings-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.settingsPlatform')}</h2>
			</div>
			<div class="settings-row">
				<div><h3>{$t('dashboard.platformSignup')}</h3><p>{$t('dashboard.platformSignupHint')}</p></div>
				<button
					class="settings-switch"
					class:on={effectiveSettings.signupOpen}
					data-settings-switch="signupOpen"
					type="button"
					role="switch"
					aria-checked={effectiveSettings.signupOpen}
					aria-label={$t('dashboard.platformSignup')}
					disabled={settingsSaving || !isStaffAdmin}
					onclick={() => toggleSetting('signupOpen')}
				></button>
			</div>
			<div class="settings-row">
				<div><h3>{$t('dashboard.publicMap')}</h3><p>{$t('dashboard.publicMapHint')}</p></div>
				<button
					class="settings-switch"
					class:on={effectiveSettings.publicMapTrips}
					data-settings-switch="publicMapTrips"
					type="button"
					role="switch"
					aria-checked={effectiveSettings.publicMapTrips}
					aria-label={$t('dashboard.publicMap')}
					disabled={settingsSaving || !isStaffAdmin}
					onclick={() => toggleSetting('publicMapTrips')}
				></button>
			</div>
			<div class="settings-row">
				<div><h3>{$t('dashboard.maintenanceMode')}</h3><p>{$t('dashboard.maintenanceHint')}</p></div>
				<button
					class="settings-switch"
					class:on={effectiveSettings.maintenanceMode}
					data-settings-switch="maintenanceMode"
					type="button"
					role="switch"
					aria-checked={effectiveSettings.maintenanceMode}
					aria-label={$t('dashboard.maintenanceMode')}
					disabled={settingsSaving || !isStaffAdmin}
					onclick={() => toggleSetting('maintenanceMode')}
				></button>
			</div>
			<!-- Penyedia WhatsApp (Wella 3 Nov 2026): radio, BUKAN switch,
			     supaya hitungan switch tes layout (23) tidak berubah.
			     Menentukan jalur SEMUA pengiriman WA OTP + SOS. -->
			<div class="settings-row">
				<div><h3>{$t('dashboard.whatsappProvider')}</h3><p>{$t('dashboard.whatsappProviderHint')}</p></div>
				<div style="display: flex; flex-direction: column; gap: 6px;">
					<label>
						<input
							data-whatsapp-provider="official"
							type="radio"
							name="whatsappProvider"
							value="official"
							checked={effectiveSettings.whatsappProvider === 'official'}
							disabled={settingsSaving || !isStaffAdmin}
							onchange={() => setWhatsappProvider('official')}
						/>
						{$t('dashboard.whatsappProviderOfficial')}
					</label>
					<label>
						<input
							data-whatsapp-provider="dikontak"
							type="radio"
							name="whatsappProvider"
							value="dikontak"
							checked={effectiveSettings.whatsappProvider === 'dikontak'}
							disabled={settingsSaving || !isStaffAdmin}
							onchange={() => setWhatsappProvider('dikontak')}
						/>
						{$t('dashboard.whatsappProviderDikontak')}
					</label>
				</div>
			</div>
			<p>{$t('dashboard.whatsappProviderNote')}</p>
		</section>

		<!-- Card 4: Keamanan & Batas (Col 2) -->
		<section class="settings-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.settingsSecurity')}</h2>
			</div>
			<form class="settings-brevo-form" onsubmit={submitSecurity}>
				<label class="settings-field">
					<span>{$t('dashboard.defaultQuota')}</span>
					<input
						data-settings-field="defaultQuota"
						type="number"
						inputmode="numeric"
						name="defaultQuota"
						required
						min="2"
						step="1"
						bind:value={securityDraft.defaultQuota}
						disabled={settingsSaving || !isStaffAdmin}
					/>
					<small>{$t('dashboard.defaultQuotaHint')}</small>
				</label>
				<label class="settings-field">
					<span>{$t('dashboard.currencyLabel')}</span>
					<select
						data-settings-field="currency"
						name="currency"
						bind:value={securityDraft.currency}
						disabled={settingsSaving || !isStaffAdmin}
					>
						<option value="IDR">IDR</option>
					</select>
				</label>
				<label class="settings-field">
					<span>{$t('dashboard.timezoneLabel')}</span>
					<select
						data-settings-field="timezone"
						name="timezone"
						bind:value={securityDraft.timezone}
						disabled={settingsSaving || !isStaffAdmin}
					>
						<option value="WIB">WIB</option>
						<option value="WITA">WITA</option>
						<option value="WIT">WIT</option>
					</select>
					<small>{$t('dashboard.currencyTimezoneHint')}</small>
				</label>
				<button class="settings-primary" type="submit" disabled={settingsSaving || !isStaffAdmin}>
					{settingsSaving ? $t('dashboard.settingsBrevoSaving') : $t('dashboard.settingsSecuritySave')}
				</button>
			</form>
		</section>

		<!-- Card 5: Kode OTP (Col 1) -->
		<section class="settings-card settings-otp-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.otpSettings')}</h2>
				<p class="settings-muted">{$t('dashboard.otpSettingsHint')}</p>
			</div>
			<div class="settings-otp">
				{#each otpChannels as channel}
					<div class="settings-row">
						<div><h3>{$t(channel.labelKey)}</h3></div>
						<button
							class="settings-switch"
							class:on={effectiveSettings[channel.key]}
							data-settings-switch={channel.key}
							type="button"
							role="switch"
							aria-checked={effectiveSettings[channel.key]}
							aria-label={$t(channel.labelKey)}
							disabled={settingsSaving || !isStaffAdmin}
							onclick={() => toggleSetting(channel.key)}
						></button>
					</div>
				{/each}
			</div>
		</section>

		<!-- Card 6: Pro Payment (Col 2) -->
		<section class="settings-card settings-qris-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.proPaymentTitle')}</h2>
				<p class="settings-muted">{$t('dashboard.proPaymentHint')}</p>
			</div>
			<div class="settings-qris-content">
				{#if effectiveSettings.proQrisUrl}
					<img
						class="settings-qris-preview"
						src={effectiveSettings.proQrisUrl}
						alt={$t('dashboard.proQrisPreviewAlt')}
						loading="lazy"
						data-pro-qris-preview={effectiveSettings.proQrisUrl}
					/>
				{:else}
					<p class="settings-muted">{$t('dashboard.proQrisEmpty')}</p>
				{/if}
			</div>
			<form class="settings-brevo-form" onsubmit={submitQris}>
				<label class="settings-field">
					<span>{$t('dashboard.proPaymentTitle')}</span>
					<input
						data-profile-field="qris"
						type="file"
						accept="image/*"
						aria-label={$t('dashboard.proPaymentTitle')}
						onchange={(e) => (qrisFile = e.currentTarget.files?.[0] ?? null)}
					/>
					<small>{$t('dashboard.avatarHint')}</small>
				</label>
				<div class="settings-form-actions">
					<button
						class="settings-primary"
						type="submit"
						disabled={!qrisFile || settingsSaving || !isStaffAdmin}
					>
						{$t('dashboard.proQrisUpload')}
					</button>
					<button
						class="settings-secondary"
						type="button"
						onclick={deleteQris}
						disabled={!effectiveSettings.proQrisUrl || settingsSaving || !isStaffAdmin}
					>
						{$t('dashboard.proQrisDelete')}
					</button>
				</div>
				{#if qrisNotice}
					<p class="settings-notice" role="status">
						{qrisNotice === 'deleted'
							? $t('dashboard.proQrisDeleted')
							: $t('dashboard.proQrisSaved')}
					</p>
				{/if}
				{#if qrisError}
					<div class="settings-error" role="status">{qrisError}</div>
				{/if}
			</form>
		</section>

		<!-- Card 7: Modul AI (Col 1) -->
		<section class="settings-card settings-ai-card" data-settings-card>
			<div class="settings-card-head">
				<h2>{$t('dashboard.aiModules')}</h2>
				<p class="settings-muted">{$t('dashboard.aiModulesHint')}</p>
			</div>
			<div class="settings-ai-grid">
				{#each aiModules as mod}
					<div class="settings-ai-cell">
						<h3>{$t(mod.labelKey)}</h3>
						<button
							class="settings-switch"
							class:on={effectiveSettings[mod.key]}
							data-settings-switch={mod.key}
							type="button"
							role="switch"
							aria-checked={effectiveSettings[mod.key]}
							aria-label={$t(mod.labelKey)}
							disabled={settingsSaving || !isStaffAdmin}
							onclick={() => toggleSetting(mod.key)}
						></button>
					</div>
				{/each}
			</div>
		</section>
	</div>
</div>

<style>
	.settings-page {
		max-width: 100%;
	}
	.settings-page-head {
		margin: 2px 0 16px;
	}
	.settings-page-head h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.settings-page-head p {
		max-width: 680px;
		margin: 5px 0 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
	}
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		align-items: start;
	}
	.settings-card {
		min-width: 0;
		overflow: hidden;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
	}
	.settings-card-head {
		padding: 15px 16px;
		border-bottom: 1px solid var(--line);
	}
	.settings-card-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--ink);
	}
	.settings-card-head .settings-muted {
		margin: 4px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}

	.settings-muted {
		margin: 3px 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.5;
	}

	/* Buttons */
	.settings-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
	.settings-primary:hover:not(:disabled) {
		background: var(--green-d);
	}
	.settings-primary:active:not(:disabled) {
		transform: translateY(1px);
	}
	.settings-primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.settings-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 9px 18px;
		background: var(--card2);
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
	}
	.settings-secondary:hover:not(:disabled) {
		background: var(--green-soft);
		border-color: var(--green);
	}
	.settings-secondary:active:not(:disabled) {
		transform: translateY(1px);
	}
	.settings-secondary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.settings-primary:focus-visible,
	.settings-secondary:focus-visible {
		outline: 3px solid var(--orange);
		outline-offset: 2px;
	}

	/* Feedback notices */
	.settings-notice,
	.settings-error {
		margin: 8px 0 12px;
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.45;
	}
	.settings-notice {
		background: var(--green-soft);
		color: var(--green-d);
		border: 1px solid var(--green);
	}
	.settings-error {
		background: var(--red-soft);
		color: var(--red);
		border: 1px solid var(--red);
	}

	/* Row list layout (Platform, OTP) */
	.settings-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 16px;
		border-top: 1px solid var(--line);
	}
	.settings-row:first-child {
		border-top: none;
	}
	.settings-row > div {
		min-width: 0;
		flex: 1;
	}
	.settings-row h3 {
		margin: 0;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}
	.settings-row p {
		margin: 3px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}

	/* Switch controls */
	.settings-switch {
		position: relative;
		width: 48px;
		height: 28px;
		flex: 0 0 48px;
		margin-left: auto;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card2);
		cursor: pointer;
		transition: background 0.2s ease, border-color 0.2s ease;
	}
	.settings-switch:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.settings-switch::after {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
		content: '';
		transition: transform 0.2s ease;
	}
	.settings-switch.on {
		background: var(--green);
		border-color: var(--green);
	}
	.settings-switch.on::after {
		transform: translateX(20px);
	}
	.settings-switch:focus-visible {
		outline: 3px solid var(--orange);
		outline-offset: 2px;
	}

	/* Notification Matrix */
	.settings-matrix-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px 48px 48px;
		gap: 12px;
		align-items: center;
		padding: 10px 16px;
		background: var(--card2);
		border-bottom: 1px solid var(--line);
	}
	.settings-matrix-head span:not(:first-child) {
		color: var(--muted);
		font-size: 12px;
		font-weight: 700;
		text-align: center;
	}
	.settings-matrix-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px 48px 48px;
		gap: 12px;
		align-items: center;
		padding: 12px 16px;
		border-top: 1px solid var(--line);
	}
	.settings-matrix-row:first-of-type {
		border-top: none;
	}
	.settings-matrix-row h3 {
		margin: 0;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}
	.settings-matrix-row p {
		margin: 3px 0 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.settings-matrix-row .settings-switch {
		margin: 0 auto;
	}

	/* Modul AI: 6 toggle dalam 2 kolom x 3 baris di dalam kartu
	   standar — tinggi kartu sepadan dengan kartu Kode OTP. */
	.settings-ai-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.settings-ai-cell {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 12px 16px;
		border-top: 1px solid var(--line);
	}
	.settings-ai-cell:nth-child(-n + 2) {
		border-top: none;
	}
	.settings-ai-cell:nth-child(even) {
		border-left: 1px solid var(--line);
	}
	.settings-ai-cell h3 {
		margin: 0;
		min-width: 0;
		flex: 1;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}

	/* Form layouts (Brevo, Security, QRIS) */
	.settings-brevo-form {
		padding: 16px;
		margin: 0;
		border: 0;
		display: grid;
		gap: 14px;
	}
	.settings-field {
		display: grid;
		gap: 6px;
	}
	.settings-field > span {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}
	.settings-field input,
	.settings-field select {
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		font: inherit;
		font-size: 13.5px;
		background: var(--card);
		color: var(--ink);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.settings-field input:focus,
	.settings-field select:focus {
		outline: none;
		border-color: var(--green);
		box-shadow: 0 0 0 3px var(--green-soft);
	}
	.settings-field small {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.4;
	}

	/* QRIS */
	.settings-form-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.settings-qris-content {
		padding: 16px 16px 0;
	}
	.settings-qris-content .settings-muted {
		margin: 0;
	}
	.settings-qris-preview {
		display: block;
		max-width: 220px;
		height: auto;
		border-radius: 10px;
		border: 1px solid var(--line);
		box-shadow: var(--shadow);
	}

	@media (max-width: 760px) {
		.settings-page-head h1 {
			font-size: 20px;
		}
		.settings-grid {
			grid-template-columns: 1fr;
		}
		.settings-ai-grid {
			grid-template-columns: 1fr;
		}
		.settings-ai-cell {
			border-top: 1px solid var(--line);
			border-left: none;
		}
		.settings-ai-cell:first-child {
			border-top: none;
		}
	}
</style>
