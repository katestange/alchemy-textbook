<script>
  import { bookConfig } from '../stores/bookConfig.js';

  // Book front matter shown on the entry (splash) screen and the table of
  // contents. This is per-book *content*; only the title is config-driven so
  // far (via /api/book). The author/blurb/colophon live here for now — when
  // ADAPTABILITY.md Phase 3 moves per-book frontend content (e.g.
  // builtinApplets.js) into config, this should go with it. The two external
  // references a future adopter is most likely to change are pulled out here:
  const AUTHOR = 'Katherine E. Stange';
  const TAGLINE = 'A human-written textbook with AI overlay';
  const REPO_URL = 'https://github.com/katestange/alchemy-textbook';
  const CONTACT_EMAIL = 'kstange@math.colorado.edu';
</script>

<header class="masthead">
  <h1>{$bookConfig.title}</h1>
  <p class="byline">{AUTHOR}</p>
  <p class="tagline">{TAGLINE}</p>
</header>

<div class="book-intro">
  <p>
    Aimed at undergraduates of all types interested in the mathematics behind
    public key cryptography, basic quantum computation, and coding theory.
    Introduces modular arithmetic, finite fields, elliptic curves, lattices,
    ket notation, probability, complexity theory and other mathematical
    concepts in a conceptual, computational and experiential manner. The goal
    is a solid intuition for the behaviour of mathematical creatures: the
    ability to create magic at the alchemist's workbench. Proofs are available
    as paths to understanding. The student should emerge with a first sampling
    of a vast discipline, a sampling that reflects the great variety of
    creative methods in the field. And the student should have fun.
  </p>

  <p>
    This is a textbook in progress. Large chunks are not yet written. Some
    chunks are experimental. The base textbook is entirely human written. This
    online version has an AI overlay that lets the student optionally
    experience the textbook with an AI assistant. AI enhancements, such as
    further explanations, applets and examples, and insights from chats, are
    saved as margin notes for all other students to use. There is an instructor
    panel to moderate AI material and generate token keys for student AI use.
  </p>

  <p>
    When viewing in <em>static mode</em>, previously generated AI content is
    available. When viewing in <em>live mode</em>, you can interact with AI. To
    interact with AI requires the use of an API key to access Claude, which
    costs money. You can use your own API key or request a budget on my API key.
  </p>
</div>

<slot />

<section class="colophon">
  <h2>Colophon</h2>
  <p>
    The web display and AI enhancement overlay is vibe-coded with Claude and is
    MIT licensed at
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
      >github.com/katestange/alchemy-textbook</a>. The base textbook is simply a
    LaTeX textbook that can be updated seamlessly throughout the semester. The
    software could be applied to any LaTeX textbook. In future, I would like to
    have the system create the LaTeX automatically from hand-written lecture
    notes, among other features. This is a work in progress. Please reach out if
    you have comments and feedback, would like to request an AI token, or adopt
    a similar system for your textbook:
    <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.
  </p>
</section>
