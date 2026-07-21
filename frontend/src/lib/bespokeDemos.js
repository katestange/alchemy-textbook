// Registry of hand-built, book-specific interactive demos, mounted from the
// LaTeX source via  \bespokedemo{name}  ->  <a href="bespoke:name">  ->  the
// reader finds that anchor (see ReadingPane.injectBespokeDemos) and mounts the
// matching component here. This is the bespoke-demo analogue of Sage/Desmos
// injection, but driven from the LaTeX rather than a block-id table.
//
// To add a demo: write a Svelte component under lib/demos/, register it here
// under a kebab-case name, and call \bespokedemo{that-name} in the .tex
// (wrapped in \webonly{...} unless it wraps a print-fallback image).
import CaesarWheel from './demos/CaesarWheel.svelte';
import CaesarTool from './demos/CaesarTool.svelte';
import PolybiusSquare from './demos/PolybiusSquare.svelte';
import PolybiusTool from './demos/PolybiusTool.svelte';
import TranspositionDemo from './demos/TranspositionDemo.svelte';
import TranspositionTool from './demos/TranspositionTool.svelte';
import ScytaleDemo from './demos/ScytaleDemo.svelte';
import ScytaleTool from './demos/ScytaleTool.svelte';
import VigenereSquare from './demos/VigenereSquare.svelte';
import VigenereTool from './demos/VigenereTool.svelte';
import AdfgvxDemo from './demos/AdfgvxDemo.svelte';
import AdfgvxTool from './demos/AdfgvxTool.svelte';
import CaesarCrackDemo from './demos/CaesarCrackDemo.svelte';
import CaesarCrackTool from './demos/CaesarCrackTool.svelte';
import FrequencyDemo from './demos/FrequencyDemo.svelte';
import FrequencyTool from './demos/FrequencyTool.svelte';
import OtpTool from './demos/OtpTool.svelte';

const make = (Component, props = {}) => (host) => new Component({ target: host, props });

export const bespokeDemos = {
  'caesar-wheel': make(CaesarWheel, { size: 380, key: 17 }),
  'caesar-tool': make(CaesarTool),
  'polybius-demo': make(PolybiusSquare),
  'polybius-tool': make(PolybiusTool),
  'transposition-demo': make(TranspositionDemo),
  'transposition-tool': make(TranspositionTool),
  'scytale-demo': make(ScytaleDemo),
  'scytale-tool': make(ScytaleTool),
  'vigenere-square': make(VigenereSquare),
  'vigenere-tool': make(VigenereTool),
  'adfgvx-demo': make(AdfgvxDemo),
  'adfgvx-tool': make(AdfgvxTool),
  'caesar-crack-demo': make(CaesarCrackDemo),
  'caesar-crack-tool': make(CaesarCrackTool),
  'frequency-demo': make(FrequencyDemo),
  'frequency-tool': make(FrequencyTool),
  'otp-tool': make(OtpTool)
};
