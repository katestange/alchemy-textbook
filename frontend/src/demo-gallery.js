// Dev-only entry for demo-gallery.html: mounts every registered bespoke demo
// under its name, using the reader's theme, so a demo can be previewed and
// iterated without rebuilding the book.
import './styles/theme.css';
import './styles/latexml.css';
import { bespokeDemos } from './lib/bespokeDemos.js';

const root = document.getElementById('gallery');
root.style.cssText = 'max-width: 60rem; margin: 2rem auto; padding: 0 1rem;';

for (const [name, mount] of Object.entries(bespokeDemos)) {
  const h = document.createElement('h2');
  h.textContent = name;
  h.style.cssText = 'font-size:1rem; margin:2.5rem 0 0.75rem;';
  const host = document.createElement('div');
  host.className = 'bespoke-demo';
  host.dataset.demo = name;
  root.append(h, host);
  mount(host);
}
