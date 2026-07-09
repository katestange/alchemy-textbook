// Book identity fetched once from /api/book (which reads the repo's
// book.toml), so no branding is hardcoded in the frontend bundle. The
// defaults keep dev against the mock server (and tests) working when the
// endpoint is absent.
import { writable } from 'svelte/store';

const DEFAULTS = {
  title: 'Interactive Textbook',
  slug: 'book',
  code_example: 'ABCD-1234-XY',
  desmos_api_key: null,
  // Decision 85: false = the instructor chose the classic colored chips
  // (quiet mode) over illustrated creature art. The creature-art layer, when
  // it lands, must check this flag and leave the chips alone when false.
  creature_art: true
};

export const bookConfig = writable({ ...DEFAULTS });

export async function loadBookConfig() {
  let cfg = { ...DEFAULTS };
  try {
    const res = await fetch('/api/book', { credentials: 'same-origin' });
    if (res.ok) cfg = { ...DEFAULTS, ...(await res.json()) };
  } catch {
    // offline / mock server without /api/book: keep defaults
  }
  bookConfig.set(cfg);
  if (typeof window !== 'undefined') {
    // For the self-contained helpers (desmos.js, inSituResult.js) that by
    // design import nothing from the rest of the project.
    window.__BOOK_CONFIG__ = cfg;
  }
  if (typeof document !== 'undefined' && cfg.title) document.title = cfg.title;
  if (typeof document !== 'undefined') {
    // Styling hook for the creature-art layer (Decision 85): CSS/components
    // key off <html data-creature-art="on|off">.
    document.documentElement.dataset.creatureArt = cfg.creature_art ? 'on' : 'off';
  }
  return cfg;
}
