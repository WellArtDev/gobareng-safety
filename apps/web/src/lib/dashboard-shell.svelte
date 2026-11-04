<script lang="ts">
	import type { Snippet } from 'svelte';
	import { locale, setLocale, t } from '#lib/i18n/index';
	import logo from '#lib/assets/gobareng-logo.svg';
	import { dashboardMenus, type DashboardMenuItem } from '#lib/dashboard-menus';
	import { themeStore, type Theme } from '#lib/theme';

	// Generic dashboard shell, reusable by every dashboard page:
	// sidebar + header + main content slot. It owns no dashboard
	// content of its own — a page plugs its content into `children`
	// (per-trip safety content, trip lists, settings forms, ...).
	// Visual tokens (colours, radius, spacing, Plus Jakarta Sans)
	// come from the reference layout Dashboard_Gobareg__9.html
	// (identical tokens to the earlier file-7 reference).
	// This shell is a template: it is not wired into any route yet.
	let {
		menus = dashboardMenus,
		activeMenu = 'summary',
		brandName = '',
		brandTagline = '',
		userLabel = '',
		profileRole = '',
		searchValue = '',
		badgeCounts = {},
		bellCount = 0,
		onSearch,
		onBell,
		onProfile,
		onLogout,
		actions,
		children,
		onMenuSelect
	}: {
		/** Sidebar menu. Defaults to `dashboardMenus`; pass your own array for another dashboard. */
		menus?: DashboardMenuItem[];
		/** Id of the currently active menu item (matched against `menus[].id`). */
		activeMenu?: string;
		/** Brand name in the sidebar. Defaults to the `app.name` i18n key. */
		brandName?: string;
		/** Brand tagline under the name. Defaults to the `dashboard.tagline` i18n key. */
		brandTagline?: string;
		/** User label in the header chip. Defaults to the `dashboard.admin` i18n key. */
		userLabel?: string;
		/** Role line under the user label in the header chip (real session role). */
		profileRole?: string;
		/** Current value of the topbar search input (page-owned state). */
		searchValue?: string;
		/** Per-menu badge counts, keyed by menu id (file-10 sidebar badges).
		 * Only ids whose menu item declares a `badge` style render one;
		 * zero/absent counts render nothing. */
		badgeCounts?: Record<string, number>;
		/** Red dot on the topbar bell when > 0 (file-10 .dot). */
		bellCount?: number;
		/** Called with the topbar search text; the page owns filtering. */
		onSearch?: (query: string) => void;
		/** Called when the bell button is clicked. */
		onBell?: () => void;
		/** Called when "Profil" is chosen from the profile dropdown. */
		onProfile?: () => void;
		/** Called when "Keluar" is chosen from the profile dropdown. */
		onLogout?: () => void;
		/** Optional extra header controls, rendered before the language switcher. */
		actions?: Snippet;
		/** Page content. When omitted, an empty state is shown instead. */
		children?: Snippet;
		/** Called with the clicked menu id; the page owns navigation. */
		onMenuSelect?: (id: string) => void;
	} = $props();

	const shownBrandName = $derived(brandName || $t('app.name'));
	const shownBrandTagline = $derived(brandTagline || $t('dashboard.tagline'));
	const shownUserLabel = $derived(userLabel || $t('dashboard.admin'));
	// Desain 13 two-tone wordmark: "Go" and ".app" are green, "Bareng" ink.
	// Falls back to the plain name for any other brand string.
	const brandWordmark = $derived(
		shownBrandName === 'GoBareng.app' ? { go: 'Go', mid: 'Bareng', suffix: '.app' } : null
	);

	// Theme (desain 11): ALWAYS starts Light — the reference ignores the
	// system preference. The Light|Dark toggle overrides it per browser
	// by setting data-theme on <html> (token cascade in +layout.svelte).
	// Persisted as a viewer convenience only — wrapped so blocked storage
	// never breaks the page.
	let theme = $state<Theme>('light');
	function applyTheme(mode: Theme) {
		themeStore.set(mode);
	}
	$effect(() => {
		themeStore.init();
		return themeStore.subscribe((mode) => {
			theme = mode;
		});
	});

	// Profile dropdown (desain 11 .profile-menu): the chip toggles it,
	// Escape and outside clicks close it, items navigate then close.
	let profileOpen = $state(false);
	let profileWrapEl: HTMLDivElement | undefined = $state();
	function closeProfile() {
		profileOpen = false;
	}
	function profileAction(action: 'profile' | 'logout') {
		closeProfile();
		if (action === 'profile') onProfile?.();
		else onLogout?.();
	}

	function badgeFor(id: string): number {
		return badgeCounts[id] ?? 0;
	}

	// Mobile FAB menu, copied from the reference layout
	// (Dashboard_Gobareg__2__5_n6lx.html): .fab-wrap is hidden on
	// desktop and shown at <=760px, when the sidebar is hidden.
	// Behaviour mirrors the reference toggleFab/closeFab: button
	// toggles, overlay click and Escape close, choosing an item
	// navigates and closes. Stagger delays follow the reference
	// pattern (40ms steps, 40/20/0 tail), extended to 11 items.
	let fabOpen = $state(false);
	let fabWrapEl: HTMLDivElement | undefined = $state();
	function closeFab() {
		fabOpen = false;
	}
	function fabDelay(index: number, count: number) {
		if (index === count - 1) return 0;
		if (index === count - 2) return 20;
		return 360 - index * 40;
	}
	function onWindowClick(event: MouseEvent) {
		const target = event.target as Node;
		if (fabOpen && fabWrapEl) {
			// Overlay clicks land on the wrap itself (its ::before);
			// anything outside the wrap also closes, as in the file.
			if (target === fabWrapEl || !fabWrapEl.contains(target)) closeFab();
		}
		if (profileOpen && profileWrapEl && !profileWrapEl.contains(target)) closeProfile();
	}
	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			closeFab();
			closeProfile();
		}
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="shell">
	<aside class="sidebar">
		<button
			type="button"
			class="brand"
			aria-label={shownBrandName}
			onclick={() => onMenuSelect?.('summary')}
		>
			<img class="brand-logo" src={logo} alt="" />
			<div class="brand-text">
				{#if brandWordmark}
					<b
						><span class="go">{brandWordmark.go}</span
						>{brandWordmark.mid}<span class="app-suffix">{brandWordmark.suffix}</span></b
					>
				{:else}
					<b>{shownBrandName}</b>
				{/if}
				<span class="brand-tag">{shownBrandTagline}</span>
			</div>
		</button>
		<nav class="nav" aria-label={$t('dashboard.navLabel')}>
			{#each menus as item (item.id)}
				<button
					type="button"
					class="nav-item"
					class:active={item.id === activeMenu}
					aria-current={item.id === activeMenu ? 'page' : undefined}
					onclick={() => onMenuSelect?.(item.id)}
				>
					<span class="ic" aria-hidden="true">{item.icon}</span>
					<span class="nav-label">{$t(item.labelKey)}</span>
					{#if item.badge && badgeFor(item.id) > 0}
						<span class="nav-badge" class:grey={item.badge === 'grey'}>
							{badgeFor(item.id)}
						</span>
					{/if}
				</button>
			{/each}
		</nav>
	</aside>
	<div class="main">
		<header class="topbar">
			<label class="top-search">
				<span aria-hidden="true">⌕</span>
				<input
					type="search"
					value={searchValue}
					oninput={(event) => onSearch?.(event.currentTarget.value)}
					placeholder={$t('dashboard.topSearch')}
					aria-label={$t('dashboard.topSearchLabel')}
				/>
			</label>
			<button
				type="button"
				class="icon-btn"
				aria-label={$t('dashboard.topBell')}
				onclick={() => onBell?.()}
			>
				<span aria-hidden="true">🔔</span>
				{#if bellCount > 0}
					<span class="bell-dot" aria-hidden="true"></span>
				{/if}
			</button>
			<div class="lang-toggle" role="group" aria-label={$t('dashboard.topTheme')}>
				<button
					type="button"
					class:active={theme === 'light'}
					aria-pressed={theme === 'light'}
					onclick={() => applyTheme('light')}
				>
					☀️ {$t('dashboard.themeLight')}
				</button>
				<span class="sep" aria-hidden="true">|</span>
				<button
					type="button"
					class:active={theme === 'dark'}
					aria-pressed={theme === 'dark'}
					onclick={() => applyTheme('dark')}
				>
					🌙 {$t('dashboard.themeDark')}
				</button>
			</div>
			<div class="lang-toggle" role="group" aria-label={$t('language.label')}>
				<button
					type="button"
					class:active={$locale === 'id'}
					aria-label={$t('language.id')}
					onclick={() => setLocale('id')}
				>
					{$t('language.shortId')}
				</button>
				<span class="sep" aria-hidden="true">|</span>
				<button
					type="button"
					class:active={$locale === 'en'}
					aria-label={$t('language.en')}
					onclick={() => setLocale('en')}
				>
					{$t('language.shortEn')}
				</button>
			</div>
			<div class="profile-wrap" class:open={profileOpen} bind:this={profileWrapEl}>
				<button
					type="button"
					class="profile"
					aria-label={$t('dashboard.topProfile')}
					aria-haspopup="menu"
					aria-expanded={profileOpen}
					onclick={() => (profileOpen = !profileOpen)}
				>
					<span class="avatar" aria-hidden="true">{shownUserLabel.slice(0, 1).toUpperCase()}</span>
					<span class="profile-text">
						<b>{shownUserLabel}</b>
						{#if profileRole}
							<span class="profile-role">{profileRole}</span>
						{/if}
					</span>
					<span class="profile-chev" aria-hidden="true">⌄</span>
				</button>
				{#if profileOpen}
					<div class="profile-menu" role="menu" aria-label={$t('dashboard.topProfile')}>
						<div class="pm-head">
							<span class="avatar" aria-hidden="true">
								{shownUserLabel.slice(0, 1).toUpperCase()}
							</span>
							<span>
								<b>{shownUserLabel}</b>
								{#if profileRole}<span class="pm-role">{profileRole}</span>{/if}
							</span>
						</div>
						<button type="button" role="menuitem" onclick={() => profileAction('profile')}>
							<span class="pm-ic" aria-hidden="true">👤</span>
							<span>{$t('dashboard.menuProfile')}</span>
						</button>
						<button
							type="button"
							role="menuitem"
							class="danger"
							onclick={() => profileAction('logout')}
						>
							<span class="pm-ic" aria-hidden="true">🚪</span>
							<span>{$t('dashboard.menuLogout')}</span>
						</button>
					</div>
				{/if}
			</div>
			{@render actions?.()}
		</header>
		<main class="content">
			{#if children}
				{@render children()}
			{:else}
				<p class="empty-state">{$t('dashboard.empty')}</p>
			{/if}
		</main>
	</div>
	<div class="fab-wrap" class:open={fabOpen} bind:this={fabWrapEl}>
		<nav class="fab-menu" id="fabMenu" aria-label={$t('dashboard.navLabel')} aria-hidden={!fabOpen}>
			{#each menus as item, index (item.id)}
				<button
					type="button"
					class="fab-item"
					class:active={item.id === activeMenu}
					style="--d: {fabDelay(index, menus.length)}ms"
					onclick={() => {
						onMenuSelect?.(item.id);
						closeFab();
					}}
				>
					<span class="ic" aria-hidden="true">{item.icon}</span>
					<span>{$t(item.labelKey)}</span>
					{#if item.badge && badgeFor(item.id) > 0}
						<span class="nav-badge fab-badge" class:grey={item.badge === 'grey'}>
							{badgeFor(item.id)}
						</span>
					{/if}
				</button>
			{/each}
			<div class="fab-item fab-prefs">
				<div class="fab-toggle" role="group" aria-label={$t('dashboard.topTheme')}>
					<button
						type="button"
						class:active={theme === 'light'}
						aria-pressed={theme === 'light'}
						onclick={() => applyTheme('light')}
					>
						☀️ {$t('dashboard.themeLight')}
					</button>
					<button
						type="button"
						class:active={theme === 'dark'}
						aria-pressed={theme === 'dark'}
						onclick={() => applyTheme('dark')}
					>
						🌙 {$t('dashboard.themeDark')}
					</button>
				</div>
				<div class="fab-toggle" role="group" aria-label={$t('language.label')}>
					<button
						type="button"
						class:active={$locale === 'id'}
						aria-pressed={$locale === 'id'}
						onclick={() => setLocale('id')}
					>
						{$t('language.shortId')}
					</button>
					<button
						type="button"
						class:active={$locale === 'en'}
						aria-pressed={$locale === 'en'}
						onclick={() => setLocale('en')}
					>
						{$t('language.shortEn')}
					</button>
				</div>
			</div>
		</nav>
		<button
			type="button"
			class="fab-main"
			id="fabMain"
			aria-expanded={fabOpen}
			aria-controls="fabMenu"
			aria-label={fabOpen ? $t('dashboard.closeMenu') : $t('dashboard.openMenu')}
			onclick={() => (fabOpen = !fabOpen)}
		>
			<span class="fab-lines" aria-hidden="true"><i></i><i></i><i></i></span>
		</button>
	</div>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
		font-family:
			'Plus Jakarta Sans',
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			'Helvetica Neue',
			Arial,
			sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	.sidebar {
		width: 238px;
		flex: 0 0 238px;
		background: var(--card);
		border-right: 1px solid var(--line);
		display: flex;
		flex-direction: column;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow: auto;
		z-index: 20;
	}
	.brand {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 18px 18px 14px;
		background: transparent;
		border: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.brand-logo {
		width: 50px;
		height: 40px;
		flex: 0 0 50px;
		object-fit: contain;
	}
	.brand-text b {
		font-family: Manrope, 'Plus Jakarta Sans', system-ui, sans-serif;
		font-size: 19px;
		font-weight: 800;
		letter-spacing: -0.02em;
		display: block;
		line-height: 1.1;
	}
	.brand-text b .go,
	.brand-text b .app-suffix {
		color: var(--green);
	}
	.brand-tag {
		font-size: 9px;
		color: var(--muted);
		font-weight: 600;
		font-style: italic;
		line-height: 1.25;
		display: block;
	}
	.nav {
		padding: 6px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.nav-item .ic {
		width: 20px;
		flex: 0 0 20px;
		text-align: center;
		opacity: 0.85;
	}
	.nav-item:hover {
		background: var(--card2);
	}
	.nav-item.active {
		background: var(--green-soft);
		color: var(--green-d);
	}
	/* File-10 .badge: red action counts + grey info counts, pushed to
	   the row's right edge. */
	.nav-badge {
		margin-left: auto;
		background: var(--red-soft);
		color: #dc2626;
		font-size: 11px;
		font-weight: 800;
		min-width: 20px;
		height: 20px;
		border-radius: 999px;
		display: grid;
		place-items: center;
		padding: 0 6px;
	}
	.nav-badge.grey {
		background: #eef2f5;
		color: var(--muted);
	}
	.fab-badge {
		background: var(--red-soft);
	}
	.bell-dot {
		position: absolute;
		top: 10px;
		right: 11px;
		width: 8px;
		height: 8px;
		background: var(--red);
		border: 2px solid var(--card);
		border-radius: 50%;
	}
	.nav-item:focus-visible,
	.lang-toggle button:focus-visible,
	.icon-btn:focus-visible,
	.profile:focus-visible,
	.brand:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.main {
		flex: 1;
		min-width: 0;
		padding: 14px 18px 24px;
	}
	.topbar {
		display: flex;
		gap: 14px;
		align-items: center;
		margin-bottom: 14px;
		flex-wrap: wrap;
	}
	.top-search {
		flex: 1;
		min-width: 200px;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 0 14px;
		height: 46px;
		box-shadow: var(--shadow);
	}
	.top-search:focus-within {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.top-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 13.5px;
		color: var(--ink);
		outline: none;
	}
	.icon-btn {
		width: 46px;
		height: 46px;
		flex: 0 0 46px;
		border-radius: 12px;
		background: var(--card);
		border: 1px solid var(--line);
		display: grid;
		place-items: center;
		position: relative;
		box-shadow: var(--shadow);
		font-size: 18px;
		color: var(--ink);
		cursor: pointer;
	}
	.profile-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.25;
	}
	.profile-text b {
		font-size: 13.5px;
	}
	.profile-role {
		font-size: 11px;
		color: var(--muted);
		font-weight: 600;
	}
	.profile-chev {
		color: var(--muted);
		font-size: 12px;
		transition: transform 0.25s ease;
	}
	.profile-wrap {
		position: relative;
		flex: 0 0 auto;
	}
	.profile-wrap.open .profile-chev {
		transform: rotate(180deg);
	}
	/* Desain 11 .profile-menu */
	.profile-menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 216px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 18px 44px rgba(10, 30, 25, 0.2);
		padding: 6px;
		z-index: 46;
	}
	.profile-menu .pm-head {
		padding: 9px 12px 10px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 6px;
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.profile-menu .pm-head b {
		font-size: 13.5px;
		display: block;
		line-height: 1.15;
	}
	.pm-role {
		font-size: 11.5px;
		color: var(--muted);
		display: block;
	}
	.profile-menu > button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		background: transparent;
		border-radius: 9px;
		font: inherit;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.profile-menu > button:hover,
	.profile-menu > button:focus-visible {
		background: var(--card2);
		outline: none;
	}
	.profile-menu .pm-ic {
		width: 20px;
		text-align: center;
		flex: 0 0 20px;
	}
	.profile-menu > button.danger {
		color: #dc2626;
	}
	.lang-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 46px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 4px;
		box-shadow: var(--shadow);
	}
	.lang-toggle button {
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 12.5px;
		font-weight: 800;
		height: 36px;
		padding: 0 10px;
		border-radius: 8px;
		cursor: pointer;
	}
	.lang-toggle button.active {
		background: var(--green-soft);
		color: var(--green-d);
	}
	.lang-toggle .sep {
		color: var(--muted2);
		font-size: 12px;
		font-weight: 700;
	}
	.profile {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 6px 12px 6px 6px;
		box-shadow: var(--shadow);
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.avatar {
		width: 34px;
		height: 34px;
		flex: 0 0 34px;
		border-radius: 50%;
		background: linear-gradient(135deg, #0fb27e, #2e7fe6);
		color: #ffffff;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 13px;
	}
	.profile b {
		font-size: 13px;
	}
	.content {
		min-width: 0;
	}
	.empty-state {
		color: var(--muted);
		font-size: 14px;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 24px;
		margin: 0;
		box-shadow: var(--shadow);
	}
	/* Mobile FAB menu + sidebar breakpoints, copied verbatim from
	   the reference layout (Dashboard_Gobareg__2__5_n6lx.html). */
	.fab-wrap {
		display: none;
	}
	.fab-wrap::before {
		content: '';
		position: fixed;
		inset: 0;
		background: rgba(3, 12, 16, 0.55);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.3s ease,
			visibility 0.3s;
		pointer-events: none;
	}
	.fab-wrap.open::before {
		opacity: 1;
		visibility: visible;
		pointer-events: auto;
	}
	.fab-menu {
		position: absolute;
		right: 0;
		bottom: 78px;
		width: min(252px, calc(100vw - 32px));
		max-height: calc(100dvh - 120px);
		overflow-y: auto;
		scrollbar-width: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 2px;
		visibility: hidden;
	}
	.fab-menu::-webkit-scrollbar {
		display: none;
	}
	.fab-wrap.open .fab-menu {
		visibility: visible;
	}
	.fab-item {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 14px;
		border-radius: 14px;
		background: #0b1826;
		border: 1px solid rgba(0, 255, 180, 0.35);
		color: #eafff7;
		font: inherit;
		font-size: 13.5px;
		font-weight: 700;
		text-align: left;
		box-shadow:
			0 0 0 rgba(0, 255, 180, 0),
			0 10px 24px rgba(0, 0, 0, 0.35);
		opacity: 0;
		transform: translateY(16px) scale(0.92);
		transform-origin: bottom right;
		transition:
			opacity 0.28s ease,
			transform 0.34s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.25s ease,
			border-color 0.25s ease;
		transition-delay: 0s;
		pointer-events: none;
		width: 100%;
		cursor: pointer;
	}
	.fab-item .ic {
		width: 20px;
		text-align: center;
		flex: 0 0 20px;
		filter: drop-shadow(0 0 6px rgba(0, 255, 180, 0.65));
	}
	.fab-wrap.open .fab-item {
		opacity: 1;
		transform: none;
		pointer-events: auto;
		transition-delay: var(--d, 0ms);
		box-shadow:
			0 0 14px rgba(0, 255, 180, 0.22),
			0 10px 24px rgba(0, 0, 0, 0.35);
	}
	.fab-item:hover,
	.fab-item:focus-visible {
		border-color: #00ffb4;
		box-shadow:
			0 0 20px rgba(0, 255, 180, 0.5),
			0 0 34px rgba(0, 194, 255, 0.28);
		outline: none;
	}
	.fab-item.active {
		border-color: #00ffb4;
		background: #0d2b22;
		color: #7dffce;
	}
	.fab-main {
		position: relative;
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: linear-gradient(135deg, #00ffa3, #00c2ff);
		display: grid;
		place-items: center;
		cursor: pointer;
		animation: fabPulse 2.4s ease-out infinite;
		transition:
			transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
			background 0.3s ease,
			border-color 0.3s ease;
	}
	.fab-main:active {
		transform: scale(0.92);
	}
	.fab-lines {
		position: relative;
		width: 24px;
		height: 18px;
		display: block;
	}
	.fab-lines i {
		position: absolute;
		left: 0;
		width: 100%;
		height: 3px;
		border-radius: 99px;
		background: #03281d;
		transition:
			top 0.3s ease,
			bottom 0.3s ease,
			transform 0.3s ease,
			opacity 0.2s ease,
			background 0.3s ease;
	}
	.fab-lines i:nth-child(1) {
		top: 0;
	}
	.fab-lines i:nth-child(2) {
		top: 7.5px;
	}
	.fab-lines i:nth-child(3) {
		bottom: 0;
	}
	.fab-wrap.open .fab-main {
		animation: none;
		background: #0b1826;
		border-color: #00ffb4;
		box-shadow:
			0 0 24px rgba(0, 255, 180, 0.65),
			0 0 48px rgba(0, 194, 255, 0.4),
			0 10px 26px rgba(0, 0, 0, 0.4);
		transform: rotate(90deg);
	}
	.fab-wrap.open .fab-lines i {
		background: #00ffb4;
	}
	.fab-wrap.open .fab-lines i:nth-child(1) {
		top: 7.5px;
		transform: rotate(45deg);
	}
	.fab-wrap.open .fab-lines i:nth-child(2) {
		opacity: 0;
		transform: scaleX(0.2);
	}
	.fab-wrap.open .fab-lines i:nth-child(3) {
		bottom: auto;
		top: 7.5px;
		transform: rotate(-45deg);
	}
	@keyframes fabPulse {
		0% {
			box-shadow:
				0 0 0 0 rgba(0, 255, 180, 0.45),
				0 0 22px rgba(0, 255, 180, 0.6),
				0 10px 26px rgba(0, 0, 0, 0.35);
		}
		70% {
			box-shadow:
				0 0 0 18px rgba(0, 255, 180, 0),
				0 0 36px rgba(0, 194, 255, 0.65),
				0 10px 26px rgba(0, 0, 0, 0.35);
		}
		100% {
			box-shadow:
				0 0 0 0 rgba(0, 255, 180, 0),
				0 0 22px rgba(0, 255, 180, 0.5),
				0 10px 26px rgba(0, 0, 0, 0.35);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fab-main {
			animation: none;
		}
		.fab-item,
		.fab-main,
		.fab-lines i,
		.fab-wrap::before {
			transition: none;
		}
	}
	@media (max-width: 1180px) {
		.sidebar {
			width: 210px;
			flex-basis: 210px;
		}
		.main {
			padding: 14px 14px 24px;
		}
	}
	@media (max-width: 760px) {
		.sidebar {
			display: none;
		}
		.main {
			padding: 12px 12px 96px;
		}
		.top-search {
			flex: 1 1 100%;
		}
		.icon-btn {
			width: 44px;
			height: 44px;
			flex-basis: 44px;
		}
		.lang-toggle {
			height: 44px;
		}
		.profile-text,
		.profile-chev {
			display: none;
		}
		.profile {
			padding-right: 6px;
		}
		.profile-wrap {
			margin-left: auto;
		}
		.profile-menu {
			width: min(216px, calc(100vw - 24px));
		}
		.fab-wrap {
			display: block;
			position: fixed;
			right: 16px;
			bottom: calc(16px + env(safe-area-inset-bottom));
			z-index: 80;
		}
	}
</style>
