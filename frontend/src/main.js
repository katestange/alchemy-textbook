// Self-hosted EB Garamond (Q11 typography) via @fontsource -- bundled at
// build time, no CDN/Google Fonts request at runtime (required: CSP forbids
// third-party origins).
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
// Minimal replication of the LaTeXML build's own stylesheets (build/html/*.css,
// copied verbatim into src/styles/ -- see README) so theorem/definition/proof
// environments, figures, and tables keep their structural layout. theme.css
// is imported after these so the parchment palette + typography wins.
import './styles/latexml.css';
import './styles/ltx-article.css';
import './styles/theme.css';
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app')
});

export default app;
