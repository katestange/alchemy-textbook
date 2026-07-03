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
        buildVersion: manifest.build && manifest.build.build_version,
        chapters: chapters || {}
      });
    }
  };
}

export const manifestStore = createManifestStore();
