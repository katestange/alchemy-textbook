# How to Turn the Creature Prompts into Usable Art

A practical guide to going from `creature_art_prompts.md` → actual creature
sprites the textbook app can use.

---

## First, what you have (and what you don't)

`creature_art_prompts.md` is **text**. Fable wrote *prompts* — it does not
render images. To get pictures you feed those prompts to a **text-to-image
generator** (Midjourney, DALL·E / GPT-image, Ideogram, Stable Diffusion / Flux,
etc.) and iterate. This file is the bridge between the prompts and the finished
art.

Three things make creature art harder than a one-off illustration, and the
whole workflow below exists to handle them:

1. **Consistency** — all ten creatures must read as one hand-drawn set, and each
   creature must stay recognizably *the same animal* across ~10 pose frames.
   Image generators are stochastic; consistency is the hard part.
2. **Tiny-size legibility** — each creature must be clear at **30–40 px** (at
   rest) and detailed at **100–200 px** (presenting). Most AI art looks great
   large and turns to mush small.
3. **Sprite-sheet reality** — the app animates each creature with CSS `steps()`
   over a strip of **equal-sized, registered frames**. Generators produce a
   loose "study sheet," *not* a clean CSS sprite sheet. Final assembly is a
   post-processing step, not something the generator does for you.

---

## The prompt file's anatomy (so you know what to copy)

- **Shared Style Preamble** (top) — the grimoire look. Prepend it (or a
  shortened version) to *every* creature prompt so the ten match.
- **Per creature** (§1–§10): a **Primary prompt**, a **~10 frames/states** list
  (idle / alert / presenting + the young/wise/uncertain status variants), an
  **Avoid** line (negative prompt), and **Style anchors** (short keywords).
- **Keeping the Ten Distinct** (bottom) — silhouette rules so the color-sharing
  creatures don't blur together (teal octopus vs. raven vs. spider, green
  dragon-worm vs. beetle, gold owl vs. firefly, red jester vs. salamander).

To assemble one request: **Shared Preamble + Primary prompt + Avoid + Style
anchors**, adapted to your generator's syntax (see below).

---

## The workflow (do it in this order)

### Phase 0 — Pick a generator

Any modern one works; the differences that matter here:

| Generator | Good for | Watch out for |
|---|---|---|
| **Midjourney** | Painterly/illustrative consistency; `--sref` style reference; `--cref` character reference | Loose prompt adherence; sprite sheets need `--tile`-free manual assembly |
| **Ideogram / GPT-image / DALL·E** | Strong prompt adherence, follows "monochrome ink on parchment" literally | Weaker character-consistency tooling |
| **Stable Diffusion / Flux (local or hosted)** | Full control: LoRA/IP-Adapter/ControlNet for *real* character + pose consistency; batch generation | Setup effort; needs a workflow (ComfyUI/A1111) |

For a **one-time art pass at course scale**, Midjourney (fast, great style,
`--sref`/`--cref`) or Ideogram (literal adherence) get you there with the least
setup. If you want maximal consistency and are willing to invest, an
SD/Flux + IP-Adapter workflow is the most controllable.

### Phase 1 — Lock the *style* on ONE creature (don't start with all ten)

Pick the dragon-worm (it's the model creature in the spec). Generate its
**Primary prompt** only, several times, and iterate the *shared preamble* until
the look is right: loose colored-pen linework, aged-parchment feel, monochrome
accent ink, no digital polish. Tune wording, not the creature, at this stage.

When you love one image, **capture its style as a reusable reference**:
- Midjourney: grab the `--sref <url-or-code>` of the winning image.
- SD/Flux: save the seed + settings, or train a tiny style LoRA.
- Others: keep the exact final prompt text as your canonical "style block."

Everything else inherits this so the ten match.

### Phase 2 — Establish *character* consistency per creature

For each creature you need the *same* animal across ~10 poses. Options, best to
simplest:
- **Character reference** — Midjourney `--cref`, or SD **IP-Adapter** seeded
  from one good "hero" drawing of that creature. Strongest.
- **Seed + minimal prompt edits** — generate the hero pose, fix the seed, then
  change only the pose words per frame. Decent.
- **Edit/inpaint from the hero** — take one great drawing and inpaint pose
  changes (uncoil, lift head, add question mark). Good for status variants.

Generate the **hero at-rest (idle)** pose first; that becomes the character
reference for all its other frames.

### Phase 3 — Generate the frames

Two production strategies — pick per creature:

**A. Per-frame (recommended for the final asset).** Generate each of the ~10
frames *individually* from the character reference, one pose per image, on a
plain background. Pros: uniform, registerable, easy to assemble into a clean
CSS strip. Cons: more generations. This is what actually feeds `steps()`.

**B. Single study-sheet (great for exploration).** Use the prompt as written
("ten drawings on one sheet") to get a whole creature's mood in one shot. Pros:
fast, shows the set cohesively, good for approval. Cons: frames vary in size and
registration — you'll still have to cut and normalize them. Treat these as
*reference sheets*, not final sprite sheets.

Realistic path: use **B** to explore and get sign-off, then **A** to produce the
shippable frames.

### Phase 4 — Post-process into app-ready assets

The generator output is not directly usable. For each creature:

1. **Knock out the background → transparent PNG.** The app's page *already*
   provides the aged-parchment background (spec Q11), so a sprite carrying its
   own parchment rectangle looks like a pasted patch. Generate the art (parchment
   helps the ink read during generation), then remove the background so the
   creature sits on the live page. *Caveat:* if the ink is too pale to read on
   the page's parchment, either darken the accent ink or keep a very faint matte.
2. **Normalize every frame to one canvas** — same pixel dimensions, creature
   centered/registered so it doesn't jump between frames. This is what makes
   `steps()` animation look stable.
3. **Assemble a strip** — pack the normalized frames left-to-right (or in a grid)
   into one sprite sheet per creature (see file layout below). A tiny
   ImageMagick/Python script does this deterministically.
4. **Shrink-test** — view at **32 px**. If the pose isn't readable by silhouette
   alone, the frame fails — revise the prompt (usually: simplify, exaggerate the
   pose, thicken key shapes) and regenerate.
5. **Silhouette-distinctness check** — put the color-sharing creatures side by
   side at 32 px (octopus/raven/spider; worm/beetle; owl/firefly;
   jester/salamander). If any two read alike, apply the "Keeping the Ten
   Distinct" rules from the prompt file and regenerate.

---

## Per-generator syntax cheatsheet

The prompt text is natural language; adapt the trimmings:

- **Midjourney:** `<preamble + primary prompt> --style raw --ar 1:1 --sref
  <style-ref> --cref <hero-ref>` and put the **Avoid** line after `--no`
  (e.g. `--no gradients, 3D, white background, extra colors`).
- **Ideogram / GPT-image / DALL·E:** paste `<preamble + primary prompt>`, then a
  sentence: "Avoid: <the Avoid line>." Request a transparent or plain background
  if supported.
- **Stable Diffusion / Flux:** positive = `<preamble + primary prompt + style
  anchors>`; negative = the **Avoid** line; drive consistency with IP-Adapter
  (character) + a fixed seed, ControlNet if you sketch poses.

---

## The non-negotiables (from spec Q11 — check every asset against these)

- **Monochrome per creature**, in its accent color: green (dragon-worm,
  beetle), gold (owl, firefly), teal (octopus, raven, spider), red (jester,
  salamander), warm grey (cat).
- **Readable at 30–40 px** resting and **100–200 px** presenting.
- **~10 frames** per creature covering: idle, alert, presenting, and the three
  **status variants** — unreviewed (young/scrappy), approved (old/wise), flagged
  (uncertain, with a question mark).
- **Grimoire aesthetic:** illuminated-manuscript × Voynich × Deyrolle, loose
  colored-pen-on-parchment scribble — *not* polished vector or 3D.
- **Quiet-mode fallback exists** (spec Q11 accessibility): a plain typed icon per
  creature. You don't need art for that — just note which icon maps to which
  creature.

---

## Suggested file layout (matches the CSS-sprite frontend, spec Q13)

```
frontend/assets/creatures/
  dragon-worm/
    dragon-worm.sheet.png        # normalized ~10-frame strip (transparent)
    dragon-worm.hero.png         # the character reference you generated from
    frames/                      # individual normalized frames (source of the strip)
      01-idle.png … 10-return.png
  owl/  …  (same shape for all ten)
  _refs/
    style.sref.txt               # the locked style reference / canonical prompt
```

One strip per creature; the app's `Creature` component picks the row/frame by
state and status (spec Q13). Keep the hero + individual frames so you can
re-assemble or re-tune without regenerating from scratch.

---

## When the results miss the vision

The prompts are a strong starting point, not a guarantee — expect to iterate.
Two levers:

1. **Tune the shared preamble**, not each creature. Style problems (too glossy,
   too clean, wrong paper feel, colors leaking) almost always live there; fixing
   it once fixes all ten.
2. **Ask for a prompt revision.** If a specific creature keeps coming out wrong
   (e.g. the octopus reads as a spider at 32 px), tell me or Fable *exactly*
   what's wrong and we'll rewrite that creature's Primary prompt / Avoid line —
   revising the prompt is cheap; fighting a bad prompt with more generations is
   not.

---

## Quick-start checklist

- [ ] Pick a generator; read its consistency features (`--sref`/`--cref`,
      IP-Adapter, seeds).
- [ ] Style-lock on the **dragon-worm** at-rest pose; save the style reference.
- [ ] Generate each creature's **hero idle** pose from that style ref.
- [ ] Produce the **~10 frames** per creature (per-frame for the final asset).
- [ ] Background-knockout → transparent; normalize frames to one canvas.
- [ ] Assemble strips; **shrink-test at 32 px**; silhouette-distinctness check.
- [ ] File them under `frontend/assets/creatures/<creature>/` as above.
- [ ] Loop back and revise any prompt that keeps missing.
```
