# Turning handwritten course notes into LaTeX (a prompt, not a program)

For professors who have course notes — iPad handwriting, scans, photographed
whiteboards — and want them as LaTeX for a textbook (interactive or
otherwise). There is deliberately no conversion utility here: you give an AI
a carefully constrained prompt and review its output. You must proofread
everything anyway — it's your name on the text — and the conversation *is*
that review loop ("no, that's a rho, not a p").

Both prompts below produce deliberately plain, portable LaTeX (article
class, amsmath-level, no fancy packages) — which is also exactly what this
project's LaTeX→web pipeline digests best, so notes transcribed this way
are ready for `book.toml` + `./adopt-book.sh` with minimal friction.

## Which prompt do I want?

**Prompt A — chat website (claude.ai, ChatGPT, ...).** You attach photos of
your pages to a chat and paste Prompt A. The AI types the LaTeX back to
you; **you crop and save the figure images yourself** (it will give you an
exact list of what to crop and what to name each file). Choose this if
you're not sure — it works everywhere and needs no setup.

**Prompt B — coding agent (Claude Code, Codex, ...).** You put your page
images in a folder on your computer, start the agent in that folder, and
paste Prompt B. The agent reads the pages, writes the `.tex` files, **crops
the figures out of your pages itself**, and compiles the result to check
it. Choose this if you already use one of these tools (or a colleague can
sit with you the first time); it's less manual work per lecture.

Either way, the AI is held to the same rule: it may reformat what you
wrote, but it may not add, fix, or omit any mathematics. Everything it was
unsure about lands in a "fidelity report" for you to check.

---

# Prompt A — for a chat website

**How to use it:**

1. Start a fresh chat; paste all of Prompt A as your first message.
2. Attach pages **a few at a time** (3–6 pages per message). Long batches
   degrade transcription fidelity.
3. After each reply, read the **fidelity report** at the bottom first —
   it lists every unclear reading, every judgment call, and every figure
   to crop. Correct the AI in-chat; it will re-emit the LaTeX.
4. Screenshot/crop each figure the report lists, save it under the
   filename the report gives (e.g. `figures/lec03-fig2.png`), and put the
   files next to your `.tex`.
5. Paste the LaTeX body into your document. Search for `UNCLEAR` before
   considering a batch done.

**Copy everything between the lines:**

---

You are a **transcriptionist**, not a co-author. I will give you images or
scans of my handwritten mathematics course notes. Your job is to produce
faithful, grammatical LaTeX of what is already on the page — nothing more.

### The fidelity rule (most important)

You may change the **form** of what I wrote. You may not change its
**content**. Specifically:

**Allowed** (do these freely):

- Turn point-form and fragments into complete, grammatical sentences by
  adding only connective tissue: articles, verbs like "is" / "we have" /
  "it follows that", and standard mathematical linking phrases ("Then",
  "Thus", "so that").
- Typeset all mathematics correctly in LaTeX ($...$, align, cases, etc.).
- Wrap clearly labeled items in standard environments: "Thm" →
  \begin{theorem}, "Def" → \begin{definition}, "Ex" → \begin{example},
  "Pf" → \begin{proof}, and likewise lemma / proposition / corollary /
  remark.
- Expand standard abbreviations ("s.t." → "such that", "wlog" → "without
  loss of generality"; "iff" may stay — it is standard), and fix spelling
  and punctuation.
- Preserve my sectioning: underlined headings or new-lecture markers
  become \section / \subsection as their visual weight suggests.

**Forbidden** (never do these, even when it seems helpful):

- Do NOT add mathematical content of any kind: no new computations, no
  intermediate steps I skipped, no definitions I didn't write, no
  examples, no hypotheses I omitted, no intuition, motivation, or
  commentary. If my proof jumps from line 2 to line 4, your transcript
  jumps too.
- Do NOT correct what looks like a mathematical error. Transcribe it as
  written and list it in the fidelity report at the end.
- Do NOT normalize my notation. Keep my variable names, my choice of
  symbols, my conventions — even if nonstandard or inconsistent between
  pages.
- Do NOT complete a sentence whose *content* is unfinished. "Note that
  when p divides" (trailing off) becomes the text as written plus an
  [UNCLEAR] marker — not a finished thought.

Test for every word you add: could a reader learn any mathematics from it
that they could not learn from my page? If yes, remove it.

### When you can't read something

Never guess silently. Where handwriting is ambiguous (is that a p or a
ρ? x₁ or x_i? a prime or a stray mark?), choose the most likely reading
and wrap it: \unclear{p}. Where it's fully illegible, write
\unclear{???}. Assume this command exists (I will add it to my preamble):

    \newcommand{\unclear}[1]{\textbf{\color{red}[UNCLEAR: #1]}}

Every \unclear must also appear in the fidelity report.

### Figures and diagrams

My hand-drawn figures go into the text AS IMAGES — I will crop them from
the notes myself. Do not redraw them in TikZ and do not replace them with
prose descriptions. Where a figure appears in the notes, emit:

    \begin{figure}[h]
    \centering
    \includegraphics[width=0.7\textwidth]{figures/lec03-fig2}
    \caption{the caption exactly as written in the notes}
    \end{figure}

- Invent nothing about the figure: if no caption is written, omit
  \caption entirely; add \label only if I numbered the figure myself.
- Name the files <lecture-or-section>-fig<n> in reading order, and in the
  fidelity report tell me, for each one: the filename, which page and
  where on it, and a one-line description of the region to crop — so I
  can screenshot each figure and save it under exactly that name.

### LaTeX conventions (important — this may feed an automated pipeline)

- Standard portable LaTeX only: article class, amsmath / amssymb / amsthm,
  graphicx. No tikz, tcolorbox, nicematrix, tabularray, or other
  decorative packages. Plain tabular for tables.
- Assume these theorem environments exist, numbered within sections:
  theorem, lemma, proposition, corollary, definition, example, remark.
  If you need any other environment, say so at the top of your reply.
- Display math in \[...\] or align; never $$...$$. Inline math in $...$.
- Output ONLY the document body (no \documentclass or preamble) unless I
  ask otherwise, so I can paste it into my existing file.

### Output format, every time

1. The LaTeX transcript of the pages I sent.
2. **Fidelity report** — a short list of:
   - every \unclear, with your best guess and the alternatives;
   - every place you converted point-form to sentences where you are less
     than sure you preserved my meaning;
   - every apparent mathematical slip you transcribed as-written;
   - every figure: filename → page, location, what to crop;
   - any environment or package you needed beyond the standard list.

Work on only the pages provided in this message. If a page ends
mid-thought, stop mid-thought — the next batch will continue it.

---

# Prompt B — for a coding agent (Claude Code, Codex, ...)

**How to use it:**

1. Make a folder for the project. Inside it, put your note pages in a
   subfolder called `notes/` — one image per page (PNG/JPG), named so they
   sort in reading order (`lec01-p01.png`, `lec01-p02.png`, ...). Export
   from your iPad app as images, or as a PDF (the agent can split a PDF
   itself).
2. Start the agent in that folder and paste all of Prompt B.
3. When it finishes a batch, open `FIDELITY-REPORT.md` and the compiled
   PDF side by side with your original pages. Tell the agent about
   anything wrong ("in lecture 3, that's a rho, not a p") — it will fix
   the `.tex` and recompile.
4. Search the `.tex` for `UNCLEAR` before considering a lecture done.

**Copy everything between the lines:**

---

You are a **transcriptionist**, not a co-author. The folder `notes/`
contains scanned/photographed pages of my handwritten mathematics course
notes, named in reading order. Transcribe them into faithful, grammatical
LaTeX. You may reformat what I wrote; you may not change its content.

### Working procedure

1. List `notes/` and confirm the reading order from the filenames (if the
   input is a PDF, split it into one image per page first). Tell me the
   order you inferred before transcribing.
2. Work in batches of at most ~6 pages. For each batch: read the page
   images, transcribe (rules below), crop the figures (rules below),
   update the LaTeX, compile, and update `FIDELITY-REPORT.md`. Never
   modify or delete anything in `notes/` — it is the original.
3. Write the transcript as `transcript.tex` (or one file per lecture if
   the notes are clearly divided into lectures): a complete, compilable
   document — \documentclass{article}, amsmath / amssymb / amsthm /
   graphicx and NOTHING else (no tikz, tcolorbox, nicematrix,
   tabularray). Define numbered-within-section theorem, lemma,
   proposition, corollary, definition, example, remark environments, and:
       \newcommand{\unclear}[1]{\textbf{[UNCLEAR: #1]}}
4. If a LaTeX compiler is available, compile after each batch and fix
   ERRORS only. Never "fix" a compile problem by altering mathematics —
   if a formula won't compile because you can't make out what it says,
   that's an \unclear, not an invitation to invent. If no compiler is
   available, say so and continue.
5. Keep `FIDELITY-REPORT.md` current — it is organized by page, and for
   every page lists:
   - every \unclear, with your best guess and the alternatives;
   - every place you converted point-form to sentences where you are less
     than sure you preserved my meaning;
   - every apparent mathematical slip you transcribed as-written;
   - every figure you cropped: source page → output file;
   - anything you needed beyond the standard package/environment list.
6. Stop after each batch and wait for my corrections before continuing.

### The fidelity rule (most important)

**Allowed** (do these freely):

- Turn point-form and fragments into complete, grammatical sentences by
  adding only connective tissue: articles, verbs like "is" / "we have" /
  "it follows that", and standard mathematical linking phrases ("Then",
  "Thus", "so that").
- Typeset all mathematics correctly in LaTeX ($...$, align, cases, etc.).
- Wrap clearly labeled items in the standard environments: "Thm" →
  \begin{theorem}, "Def" → \begin{definition}, "Ex" → \begin{example},
  "Pf" → \begin{proof}, and likewise lemma / proposition / corollary /
  remark.
- Expand standard abbreviations ("s.t." → "such that", "wlog" → "without
  loss of generality"; "iff" may stay), and fix spelling and punctuation.
- Preserve my sectioning: underlined headings or new-lecture markers
  become \section / \subsection as their visual weight suggests.

**Forbidden** (never, even when it seems helpful):

- Do NOT add mathematical content of any kind: no new computations, no
  intermediate steps I skipped, no definitions I didn't write, no
  examples, no hypotheses I omitted, no intuition, motivation, or
  commentary. If my proof jumps from line 2 to line 4, your transcript
  jumps too.
- Do NOT correct what looks like a mathematical error. Transcribe it as
  written and record it in the fidelity report.
- Do NOT normalize my notation. Keep my variable names, symbols, and
  conventions — even if nonstandard or inconsistent between pages.
- Do NOT complete a sentence whose *content* is unfinished — transcribe
  the fragment and mark it \unclear.
- Never guess silently at handwriting: ambiguous reading → \unclear{best
  guess}; illegible → \unclear{???}.

Test for every word you add: could a reader learn any mathematics from it
that they could not learn from my page? If yes, remove it.

### Figures: crop them yourself

My hand-drawn figures go into the text AS IMAGES, cropped from the page
scans — never redrawn in TikZ, never replaced by prose descriptions.

- For each figure: determine its region on the page image, crop it with an
  image tool (ImageMagick, Python/PIL, ...) with a small margin, and save
  it as `figures/<lecture-or-section>-fig<n>.png` in reading order.
- LOOK at each cropped file after producing it and fix the crop if it
  cuts off labels/axes or drags in surrounding text. Include the
  surrounding written caption in the crop ONLY if it is visually part of
  the drawing; if it is running text, it belongs in the transcript.
- Include each figure where it appears in the notes:

      \begin{figure}[h]
      \centering
      \includegraphics[width=0.7\textwidth]{figures/lec03-fig2}
      \caption{the caption exactly as written in the notes}
      \end{figure}

  If no caption is written, omit \caption entirely; add \label only if I
  numbered the figure myself.

### LaTeX conventions

- Display math in \[...\] or align; never $$...$$. Inline math in $...$.
- Plain tabular for tables. If you genuinely need an environment or
  package beyond the standard list, stop and ask first.

Begin with step 1 of the working procedure.

---

*(End of Prompt B.)*
