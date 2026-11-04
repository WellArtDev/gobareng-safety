<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { locale, setLocale, t } from '#lib/i18n/index';
	import { loggedIn, shelled } from '#lib/session';
	import { setToken } from '#lib/api';

	let { children } = $props();

	function logout() {
		setToken(null);
		location.reload();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{$t('meta.title')}</title>
	<meta name="description" content={$t('meta.description')} />
	<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
	<!-- Desain 11 fonts on every page (not only inside the shell):
	     Plus Jakarta Sans for UI text, Manrope 800 for the logo. -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Manrope:wght@800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<style>
	/* Desain-11 design tokens — single source for every page color. Dark
	   values mirror the reference's [data-theme="dark"] block. The default
	   is ALWAYS Light (the reference calls setTheme("light") on load and
	   ignores the system preference); only the shell's Light|Dark toggle
	   switches data-theme on <html>. */
	:global(:root) {
		--bg: #eef3f6;
		--card: #ffffff;
		--card2: #f7faf9;
		--ink: #12212f;
		--muted: #6d7f90;
		--muted2: #93a3b1;
		--line: #e3ebef;
		--green: #0fb27e;
		--green-d: #0a9a6a;
		--green-soft: #e6f7f0;
		--stat-green: #10b981;
		--blue: #2e7fe6;
		--blue-soft: #e8f1fe;
		--orange: #f97316;
		--orange-soft: #fff1e6;
		--purple: #8b5cf6;
		--purple-soft: #f0eafd;
		--red: #ef4444;
		--red-soft: #fee2e2;
		--shadow: 0 1px 3px rgba(16, 42, 32, 0.06), 0 8px 24px rgba(16, 42, 32, 0.04);
		--radius: 16px;
	}
	:global(:root[data-theme='dark']) {
		--bg: #0e171f;
		--card: #16222e;
		--card2: #1a2836;
		--ink: #edf4f7;
		--muted: #9db0bf;
		--muted2: #7d93a5;
		--line: #243747;
		--green-soft: #12362a;
		--blue-soft: #162f4d;
		--orange-soft: #3a2412;
		--purple-soft: #2b2145;
		--red-soft: #3a1620;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		color-scheme: dark;
	}
	:global(:root[data-theme='light']) {
		color-scheme: light;
	}
	:global(body) {
		margin: 0;
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
	/* The SOS marker pulse lives in Leaflet-injected HTML, outside any
	   component's scoped styles, so the keyframes must be global. */
	:global {
		@keyframes gb-pulse {
			0% {
				box-shadow:
					0 0 0 2px rgba(0, 0, 0, 0.3),
					0 0 0 0 rgba(225, 29, 72, 0.55);
			}
			70% {
				box-shadow:
					0 0 0 2px rgba(0, 0, 0, 0.3),
					0 0 0 12px rgba(225, 29, 72, 0);
			}
			100% {
				box-shadow:
					0 0 0 2px rgba(0, 0, 0, 0.3),
					0 0 0 0 rgba(225, 29, 72, 0);
			}
		}
	}
	:global(.leaflet-container) {
		font-family: inherit;
		z-index: 1;
	}
	header {
		position: sticky;
		top: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		padding: 12px 24px;
		background: linear-gradient(90deg, #0b6f76 0%, #108b93 55%, #268c4a 130%);
		color: #fff;
		box-shadow: 0 2px 12px rgba(11, 111, 118, 0.35);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.brand img {
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: #fff;
		padding: 3px;
		flex: none;
	}
	header h1 {
		font-size: 20px;
		line-height: 1.2;
		margin: 0;
		letter-spacing: -0.01em;
	}
	header p {
		margin: 2px 0 0;
		opacity: 0.88;
		font-size: 13px;
	}
	.controls {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.controls button {
		background: rgba(255, 255, 255, 0.16);
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.45);
		border-radius: 999px;
		padding: 7px 14px;
		cursor: pointer;
		font: inherit;
		font-size: 14px;
		transition:
			background 0.15s ease,
			transform 0.1s ease;
	}
	.controls button:hover {
		background: rgba(255, 255, 255, 0.3);
	}
	.controls button:active {
		transform: translateY(1px);
	}
	.controls button.active {
		background: #f78308;
		border-color: #f78308;
		color: #fff;
	}
	.controls button:focus-visible {
		outline: 3px solid #f78308;
		outline-offset: 2px;
	}
	main {
		padding: 24px;
		max-width: 1440px;
		margin: 0 auto;
	}
	/* Login view: no header, no padding — the login page's photo
	   background covers the full viewport. */
	main.bare {
		padding: 0;
		max-width: none;
	}
	/* Shelled dashboard view: the shell owns its own padding and
	   full-viewport background, so the layout wrapper must not inset it. */
	main.full {
		padding: 0;
		max-width: none;
	}
	@media (max-width: 640px) {
		header {
			padding: 12px 16px;
		}
		header h1 {
			font-size: 18px;
		}
		header p {
			display: none;
		}
		main {
			padding: 16px 12px;
		}
	}
</style>

{#if $loggedIn && !$shelled}
	<header>
		<div class="brand">
			<img src={favicon} alt="" aria-hidden="true" />
			<div>
				<h1>{$t('app.name')}</h1>
				<p>{$t('app.tagline')}</p>
			</div>
		</div>
		<div class="controls">
			<span>{$t('language.label')}:</span>
			<button class:active={$locale === 'id'} onclick={() => setLocale('id')}>
				{$t('language.id')}
			</button>
			<button class:active={$locale === 'en'} onclick={() => setLocale('en')}>
				{$t('language.en')}
			</button>
			<button onclick={logout}>{$t('auth.logout')}</button>
		</div>
	</header>
{/if}
<main class:bare={!$loggedIn} class:full={$shelled}>
	{@render children()}
</main>
