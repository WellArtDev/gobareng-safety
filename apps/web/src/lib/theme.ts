import { get, writable } from 'svelte/store';

// Theme policy (desain 11): the dashboard always starts Light; the
// Light|Dark toggle overrides it for this browser via localStorage.
// The system preference is deliberately ignored — the reference file
// calls setTheme("light") on load regardless of prefers-color-scheme.
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'gobareng-theme';

/** Resolve the startup theme from the persisted value (if any). */
export function initialTheme(saved: string | null): Theme {
	return saved === 'dark' ? 'dark' : 'light';
}

function createThemeStore() {
	const store = writable<Theme>('light');

	return {
		subscribe: store.subscribe,
		set(mode: Theme) {
			store.set(mode);
			if (typeof document !== 'undefined') {
				document.documentElement.setAttribute('data-theme', mode);
			}
			try {
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem(THEME_STORAGE_KEY, mode);
				}
			} catch {
				// Storage blocked: theme still applies for this page view.
			}
		},
		toggle() {
			const current = get(store);
			this.set(current === 'dark' ? 'light' : 'dark');
		},
		init() {
			if (typeof localStorage !== 'undefined') {
				let saved: string | null = null;
				try {
					saved = localStorage.getItem(THEME_STORAGE_KEY);
				} catch {
					saved = null;
				}
				const mode = initialTheme(saved);
				store.set(mode);
				if (typeof document !== 'undefined') {
					document.documentElement.setAttribute('data-theme', mode);
				}
			}
		}
	};
}

export const themeStore = createThemeStore();
