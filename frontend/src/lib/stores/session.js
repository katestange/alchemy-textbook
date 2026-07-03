import { writable } from 'svelte/store';

// Session state for the invite-code auth flow (Q5). We deliberately store
// NOTHING client-side beyond what's needed to render the UI this tick --
// the actual auth token is the HttpOnly session cookie the backend sets on
// /api/claim, which this app never reads. A page reload re-derives
// `claimed` from a live /api/manifest (or any API) call succeeding again is
// out of scope for this slice; instead we just track claim state in memory
// for the current tab session.
function createSessionStore() {
  const { subscribe, set, update } = writable({
    claimed: false,
    anonymous: false,
    budgetRemainingMicrodollars: null,
    error: null
  });

  return {
    subscribe,
    setClaimed(budgetRemainingMicrodollars) {
      update((s) => ({ ...s, claimed: true, anonymous: false, budgetRemainingMicrodollars, error: null }));
    },
    // Reader chose "continue without a code" (Q5: anonymous reader tier) --
    // can read the base textbook + already-approved AI content, but AI
    // generation is not offered (no session cookie to bill against).
    continueAnonymous() {
      update((s) => ({ ...s, claimed: true, anonymous: true, budgetRemainingMicrodollars: null, error: null }));
    },
    setError(error) {
      update((s) => ({ ...s, error }));
    },
    updateBudget(budgetRemainingMicrodollars) {
      update((s) => ({ ...s, budgetRemainingMicrodollars }));
    },
    // auth_required (Q13/step 6): drop back to the code-entry screen.
    reset() {
      set({ claimed: false, anonymous: false, budgetRemainingMicrodollars: null, error: null });
    }
  };
}

export const session = createSessionStore();
