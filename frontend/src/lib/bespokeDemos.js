// Registry of hand-built, book-specific interactive demos, mounted from the
// LaTeX source via  \bespokedemo{name}  ->  <a href="bespoke:name">  ->  the
// reader finds that anchor (see ReadingPane.injectBespokeDemos) and mounts the
// matching component here. This is the bespoke-demo analogue of Sage/Desmos
// injection, but driven from the LaTeX rather than a block-id table.
//
// To add a demo: write a Svelte component under lib/demos/, register it here
// under a kebab-case name, and call \bespokedemo{that-name} in the .tex.
import CaesarWheel from './demos/CaesarWheel.svelte';
import CaesarTool from './demos/CaesarTool.svelte';

export const bespokeDemos = {
  'caesar-wheel': (host) => new CaesarWheel({ target: host, props: { size: 380, key: 17 } }),
  'caesar-tool': (host) => new CaesarTool({ target: host, props: { open: false } })
};
