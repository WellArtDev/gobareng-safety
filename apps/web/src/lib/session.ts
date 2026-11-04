import { writable } from 'svelte/store';

// Whether an admin session is active. The layout renders the dashboard
// header only when logged in, so the login screen has no header at all.
// The login page syncs this from its own `me` state; logout reloads the
// page, which resets the store to false.
export const loggedIn = writable(false);

// Whether the currently shown page renders its own header inside a
// dashboard shell (DashboardShell). The layout hides its teal header
// while this is true, so a shelled dashboard has exactly one header
// (the shell's). The page sets this alongside `loggedIn`; it is false
// on the login screen and on the non-admin denied card, so those keep
// their current header behaviour.
export const shelled = writable(false);
