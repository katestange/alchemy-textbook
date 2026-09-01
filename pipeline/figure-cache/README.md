# figure-cache — pre-rendered TikZ fragments (committed on purpose)

Each `<hash>.xml` is the LaTeXML `<picture>` fragment (inline SVG) for one
tikzpicture in the book, produced by `pipeline/figures.py` and spliced into
`build/book.xml` during the build; `<hash>.log` holds that figure's LaTeXML
warning/error lines, replayed into `build/latexml.log` so `check.sh`'s
baselines behave identically on cached and uncached builds.

The hash covers the figure's source, the document preamble, and any
mid-document definitions the figure uses — so editing a figure (or the
preamble) automatically re-renders it, and this directory slowly accumulates
fragments for figure versions that no longer exist. That's harmless; delete
any or all files here whenever you like ("clearing the cache") and the next
build re-renders what it needs (~40s per figure, run in parallel).

If a figure ever looks wrong in the reader, build once with
`FIGURE_CACHE=off bash pipeline/build.sh` (the slow, all-inline path). If
that fixes it, the cache mechanism has a bug — please report it. See the
docstring in `pipeline/figures.py` for how it all works.
