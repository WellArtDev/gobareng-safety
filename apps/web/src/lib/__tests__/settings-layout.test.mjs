import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let vite;
let SettingsPanel;
let render;

before(async () => {
	vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	({ default: SettingsPanel } = await vite.ssrLoadModule('/src/lib/settings-panel.svelte'));
	({ render } = await vite.ssrLoadModule('svelte/server'));
});

after(async () => {
	await vite?.close();
});

function renderSettings(overrides = {}) {
	return render(SettingsPanel, {
		props: {
			email: 'admin@gobareng.test',
			displayName: 'Admin GoBareng',
			avatarUrl: null,
			passwordNotice: null,
			passwordError: null,
			onChangePassword: () => undefined,
			onChangeName: () => undefined,
			onChangeEmail: () => undefined,
			onUploadAvatar: () => undefined,
			onDeleteAvatar: () => undefined,
			onUploadQris: () => undefined,
			onDeleteQris: () => undefined,
			...overrides
		}
	}).body;
}

test('settings page renders the mockup header and seven cards in two-column layout', () => {
	const html = renderSettings();

	assert.match(html, /<h1[^>]*>Pengaturan<\/h1>/);
	assert.match(html, /Pengaturan akun admin, tampilan dashboard/);
	assert.equal((html.match(/data-settings-card/g) ?? []).length, 7);
	for (const heading of ['Notifikasi', 'Setting Brevo', 'Platform', 'Keamanan &amp; Batas', 'Kode OTP', 'Pro Payment', 'Modul AI']) {
		assert.match(html, new RegExp(`<h2[^>]*>${heading}<\\/h2>`));
	}
	assert.doesNotMatch(html, /<h2[^>]*>Profil Admin<\/h2>/);
	assert.doesNotMatch(html, /<h2[^>]*>Tampilan<\/h2>/);
	assert.doesNotMatch(html, /data-settings-switch="darkMode"/);
});

test('notification matrix renders one switch per event x channel (SOS: SMS + WhatsApp only)', () => {
	const html = renderSettings();
	const matrixKeys = [
		'notifRegistEmail', 'notifRegistWhatsapp', 'notifRegistSms',
		'notifSosWhatsapp', 'notifSosSms',
		'notifVerifyEmail', 'notifVerifyWhatsapp', 'notifVerifySms',
		'notifCheckinEmail', 'notifCheckinWhatsapp', 'notifCheckinSms'
	];
	for (const key of matrixKeys) {
		assert.match(html, new RegExp(`data-settings-switch="${key}"`));
	}
	// SOS tidak punya switch Email: darurat hanya SMS + WhatsApp.
	assert.doesNotMatch(html, /data-settings-switch="notifSosEmail"/);
});

test('otp channel toggles render with email + sms on, whatsapp off by default', () => {
	const html = renderSettings();
	for (const key of ['otpEmail', 'otpSms', 'otpWhatsapp']) {
		assert.match(html, new RegExp(`data-settings-switch="${key}"`));
	}
	assert.match(html, /data-settings-switch="otpEmail"[^>]*aria-checked="true"/);
	assert.match(html, /data-settings-switch="otpSms"[^>]*aria-checked="true"/);
	assert.match(html, /data-settings-switch="otpWhatsapp"[^>]*aria-checked="false"/);
});

test('ai module card renders six toggles, all on by default, in a two-column inner grid', () => {
	const html = renderSettings();
	for (const key of ['aiV', 'aiP', 'aiL', 'aiQ', 'aiR', 'aiG']) {
		assert.match(html, new RegExp(`data-settings-switch="${key}"`));
		assert.match(html, new RegExp(`data-settings-switch="${key}"[^>]*aria-checked="true"`));
	}
	// Kartu tetap seukuran kartu standar: 6 toggle disusun 2 kolom di
	// dalam kartu yang sama, bukan kartu yang dibesarkan.
	assert.match(html, /settings-ai-grid/);
	for (const label of ['SOS Suara', 'SOS Foto', 'Agen Leader', 'Q&amp;A Member', 'Laporan Trip', 'Glimmer']) {
		assert.match(html, new RegExp(label));
	}
});

test('admin profile section is removed from settings', () => {
	const html = renderSettings();

	assert.doesNotMatch(html, /<h2[^>]*>Profil Admin<\/h2>/);
	assert.doesNotMatch(html, /data-profile-field="name"/);
	assert.doesNotMatch(html, /data-profile-field="email"/);
	assert.doesNotMatch(html, /data-profile-field="avatar"/);
	assert.doesNotMatch(html, /data-profile-avatar-fallback/);
});

test('security card persists quota, currency and timezone from settings, without manualVerify', () => {
	const html = renderSettings();

	// Baris verifikasi manual Cartensz & Kerinci dihapus (koreksi Wella).
	assert.doesNotMatch(html, /manualVerify/);
	assert.doesNotMatch(html, /Verifikasi manual trip/);
	assert.match(html, /data-settings-field="defaultQuota"[^>]*value="15"/);
	// Svelte 5 SSR: nilai select terpilih dirender sebagai selected di
	// <option>, bukan atribut value di <select>.
	assert.match(html, /data-settings-field="currency"[^>]*><option value="IDR"[^>]*selected/);
	assert.match(html, /data-settings-field="timezone"[^>]*><option value="WIB"[^>]*selected/);
	assert.match(html, />Simpan Keamanan &amp; Batas<\/button>|>Simpan Keamanan & Batas<\/button>/);
});

test('pro payment card renders the qris upload control and empty state by default', () => {
	const html = renderSettings();

	assert.match(html, /Pro Payment/);
	assert.match(html, /data-profile-field="qris"/);
	assert.match(html, />Unggah QRIS<\/button>/);
	assert.match(html, /Belum ada QRIS yang diunggah/);
});

test('pro payment card shows the qris preview when proQrisUrl is set', () => {
	const html = renderSettings({
		platformSettings: {
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
			brevoSenderEmail: '',
			brevoSmsSender: '',
			brevoWhatsappSenderNumber: '',
			brevoWhatsappTemplateId: '',
			defaultQuota: 15,
			currency: 'IDR',
			timezone: 'WIB',
			proQrisUrl: 'https://x.test/uploads/qris/q.png'
		}
	});

	assert.match(html, /data-pro-qris-preview="https:\/\/x\.test\/uploads\/qris\/q\.png"/);
	assert.match(html, />Hapus QRIS<\/button>/);
});

test('switches render properly with role="switch" and aria-checked attributes', () => {
	const html = renderSettings();
	const switches = html.match(/<button[^>]*data-settings-switch[^>]*>/g) ?? [];

	// 17 awal − 1 switch Email SOS + 3 toggle kanal OTP − 1 switch
	// darkMode (kartu Tampilan dihapus) − 1 switch manualVerify
	// (baris verifikasi manual dihapus atas koreksi Wella) + 6 toggle
	// Modul AI = 23.
	assert.equal(switches.length, 23);
	for (const button of switches) {
		assert.match(button, /role="switch"/);
		assert.match(button, /aria-checked=/);
		assert.match(button, /aria-label=/);
	}
});

test('brevo settings form renders whatsapp number and template fields', () => {
	const html = renderSettings();

	assert.match(html, /Setting Brevo/);
	for (const field of [
		'brevoSenderEmail',
		'brevoSmsSender',
		'brevoWhatsappSenderNumber',
		'brevoWhatsappTemplateId'
	]) {
		assert.match(html, new RegExp(`data-settings-field="${field}"`));
	}
	assert.match(html, /Simpan setting Brevo/);
});

test('switches reflect platformSettings when provided', () => {
	const html = render(SettingsPanel, {
		props: {
			email: 'admin@gobareng.test',
			passwordNotice: null,
			passwordError: null,
			onChangePassword: () => undefined,
			platformSettings: {
				signupOpen: false,
				publicMapTrips: true,
				maintenanceMode: true,
				notifVerify: false,
				notifCheckin: true,
				notifRegistEmail: true,
				notifRegistWhatsapp: true,
				notifRegistSms: true,
				notifSosEmail: true,
				notifSosWhatsapp: true,
				notifSosSms: false,
				notifVerifyEmail: true,
				notifVerifyWhatsapp: true,
				notifVerifySms: true,
				notifCheckinEmail: false,
				notifCheckinWhatsapp: true,
				notifCheckinSms: true
			}
		}
	}).body;

	assert.match(html, /data-settings-switch="signupOpen"[^>]*aria-checked="false"/);
	assert.match(html, /data-settings-switch="maintenanceMode"[^>]*aria-checked="true"/);
	assert.match(html, /data-settings-switch="notifSosSms"[^>]*aria-checked="false"/);
	assert.match(html, /data-settings-switch="notifCheckinEmail"[^>]*aria-checked="false"/);
});

test('brevo inputs carry autocomplete, spellcheck and meaningful names', () => {
	const html = renderSettings();
	assert.match(html, /data-settings-field="brevoSenderEmail"[^>]*autocomplete="email"/);
	assert.match(html, /data-settings-field="brevoSenderEmail"[^>]*spellcheck="false"/);
	assert.match(html, /data-settings-field="brevoSenderEmail"[^>]*name="brevoSenderEmail"/);
	assert.match(html, /data-settings-field="brevoWhatsappTemplateId"[^>]*spellcheck="false"/);
	assert.match(html, /data-settings-field="brevoWhatsappTemplateId"[^>]*name="brevoWhatsappTemplateId"/);
});

test('settings cards follow the two-column order (Platform left, Security right, OTP last)', () => {
	const html = renderSettings();
	const order = ['Notifikasi', 'Setting Brevo', 'Platform', 'Keamanan &amp; Batas', 'Kode OTP'];
	let prev = -1;
	for (const heading of order) {
		const idx = html.search(new RegExp(`<h2[^>]*>${heading}<\\/h2>`));
		assert.ok(idx > prev, `${heading} should follow previous card`);
		prev = idx;
	}
});

test('whatsapp provider radios render with official checked by default', () => {
	const html = renderSettings();

	assert.match(html, /Penyedia WhatsApp/);
	assert.match(html, /data-whatsapp-provider="official"[^>]*checked/);
	assert.match(html, /data-whatsapp-provider="dikontak"/);
	assert.doesNotMatch(html, /data-whatsapp-provider="dikontak"[^>]*checked/);
	assert.match(html, /DIKONTAK_API_KEY/);
});

test('whatsapp provider radios reflect platformSettings when dikontak is set', () => {
	const html = renderSettings({
		platformSettings: {
			whatsappProvider: 'dikontak'
		}
	});

	assert.match(html, /data-whatsapp-provider="dikontak"[^>]*checked/);
	assert.doesNotMatch(html, /data-whatsapp-provider="official"[^>]*checked/);
});
