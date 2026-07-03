import { writable } from 'svelte/store';

// Decision 60: refresh_required is a non-dismissable banner, not a toast --
// once the server is on a newer build_version than what this tab loaded, no
// further generation is attempted against a stale anchor.
export const refreshRequired = writable(false);

// budget_exceeded: a friendly (dismissable) notice, not a hard error state.
export const budgetNotice = writable(/** @type {string | null} */ (null));
