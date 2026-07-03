import { writable } from 'svelte/store';
import { buildBlockMap } from '../manifestMap.js';

// Manifest + chapter list, loaded once at chapter-picker time and reused for
// the whole session (Q13: `manifest` store).
function createManifestStore() {
  const { subscribe, set } = writable({
    loaded: false,
    sections: [],
    blocks: [],
    blockMap: new Map(),
    buildVersion: null,
    chapters: {}
  });

  return {
    subscribe,
    setManifest(manifest, chapters) {
      set({
        loaded: true,
        sections: manifest.sections || [],
        blocks: manifest.blocks || [],
        blockMap: buildBlockMap(manifest),
        // Accept the version at top level (what the backend serves) or under
        // build{} — the two agents were given slightly different contracts
        // and this cost a real bug (every generate -> refresh_required).
        buildVersion:
          manifest.build_version ||
          (manifest.build && manifest.build.build_version) ||
          null,
        chapters: chapters || {}
      });
    }
  };
}

export const manifestStore = createManifestStore();
