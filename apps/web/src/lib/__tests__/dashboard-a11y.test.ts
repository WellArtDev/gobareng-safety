// Guard sumber Tugas 1 (audit UI/UX dashboard, 1 Nov 2026):
// URL state, konfirmasi keputusan, error alert + fokus, keyboard +
// focus trap modal. Tes guard berbasis sumber (halaman dashboard
// 5.000+ baris tidak dirender di tes ini).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function src(rel: string): string {
	return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const page = src('../../routes/+page.svelte');
const safety = src('../../routes/safety/+page.svelte');
const i18nId = src('../i18n/id.ts');
const i18nEn = src('../i18n/en.ts');

describe('Tugas 1.1 — state dashboard di URL', () => {
	test('menu/tab/halaman gunung & jalur ditulis ke query param via replaceState', () => {
		for (const key of ['menu', 'tab', 'mpage', 'rpage']) {
			expect(page).toContain(`q.set('${key}'`);
		}
		expect(page).toContain('history.replaceState');
		expect(page).toContain("addEventListener('popstate'");
	});
	test('filter trip safety di ?trip=', () => {
		expect(safety).toContain("q.set('trip'");
		expect(safety).toContain('history.replaceState');
	});
});

describe('Tugas 1.2 — konfirmasi keputusan + jejak', () => {
	test('verifikasi, laporan, SOS, ban, dan toggle aktif memakai window.confirm i18n', () => {
		for (const key of [
			'verifyApproveConfirm',
			'verifyRejectConfirm',
			'reportActionedConfirm',
			'reportDismissedConfirm',
			'sosResolveConfirm',
			'memberBanConfirm',
			'mountainToggleConfirm',
			'routeToggleConfirm'
		]) {
			expect(page).toContain(key);
			expect(i18nId).toContain(key);
			expect(i18nEn).toContain(key);
		}
	});
	test('banner jejak role=status setelah keputusan', () => {
		expect(page).toContain('actionNotice');
		expect(page).toContain('role="status"');
		expect(page).toContain('verifyApprovedNotice');
		expect(page).toContain('sosResolvedNotice');
	});
});

describe('Tugas 1.3 — error diumumkan + fokus', () => {
	test('banner error utama + cc-error punya role=alert dan fokus otomatis', () => {
		expect(page).toContain('role="alert"');
		expect(page).toContain('errorBannerEl.focus()');
		expect(safety).toContain('role="alert"');
		expect(safety).toContain('ccErrorEl.focus()');
	});
});

describe('Tugas 1.4 — keyboard + modal', () => {
	test('baris trip bisa diakses keyboard (tabindex + Enter/Space, lewati kontrol dalam baris)', () => {
		expect(page).toContain('tabindex="0"');
		expect(page).toContain("e.key !== 'Enter'");
		expect(page).toContain("closest('button, a, input, select, textarea')");
	});
	test('semua dialog .mountains-modal memakai focusTrap; backdrop menahan scroll', () => {
		const dialogs = (page.match(/use:focusTrap/g) ?? []).length;
		expect(dialogs).toBeGreaterThanOrEqual(5);
		expect(page).toContain('overscroll-behavior: contain');
		const trap = src('../focus-trap.ts');
		expect(trap).toContain('previouslyFocused');
		expect(trap).toContain("document.body.style.overflow = 'hidden'");
	});
});
