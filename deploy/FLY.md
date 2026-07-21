# Deploying this book to Fly.io (→ alchemy.katestange.net)

This is the **Fly.io** hosting story for a single book, as an alternative to the
department-server (`deploy/README.md`) model. Fly runs the same
`deploy/Dockerfile` — no nginx/certbot needed (Fly terminates TLS at its edge).

**Target:** `https://alchemy.katestange.net`, DNS on Cloudflare (which already
hosts katestange.net), the app itself on Fly.io in the **Dallas (`dfw`)** region
(Fly has no Denver region; Dallas is the nearest).

**Cost:** ~$4/month — one always-on `shared-cpu-1x` 512 MB machine (~$3–4) plus a
1 GB volume for the SQLite database (~$0.15). Fly requires a payment card at
signup even at this size.

> **Division of labor:** Claude prepares `fly.toml` and the repo config (its part
> of the plan). **You** do everything in this file — it's account-, billing-, and
> secret-handling work that must be in your hands. You can work through §1–§2 now
> while Claude finishes the config; §3 onward needs `fly.toml` to exist.

---

## 1. One-time account setup (do this now, ~10 min)

- [ ] Create a Fly.io account: <https://fly.io/app/sign-up>
- [ ] Add a payment card (Account → Billing). Required even for the ~$4/mo tier.
- [ ] Install the Fly CLI (`flyctl`, invoked as `fly`) on your own machine:
  - macOS: `brew install flyctl`
  - Linux/WSL: `curl -L https://fly.io/install.sh | sh`
  - Then restart your shell so `fly` is on your PATH. Verify: `fly version`
- [ ] Log in: `fly auth login` (opens a browser).

You'll keep `flyctl` installed — it's also how you ship future content updates
(see §7).

## 2. Gather your two secrets (do this now)

You'll set these in §5. Have them ready — do **not** put them in any file that
gets committed:

- [ ] **`ANTHROPIC_API_KEY`** — the API key that funds all AI generation for this
      book. Get/rotate one at <https://console.anthropic.com> → API Keys. All
      student AI usage bills to this key, so treat it like a credit card.
- [ ] **`ADMIN_PASSWORD`** — choose a strong password now. On the very first
      startup it seeds your instructor dashboard login at `/admin`. (To change it
      later you delete the admin row and restart with a new value — so pick well.)

---

> **Everything below needs `fly.toml` in the repo root.** Claude is creating it.
> Once it's there (Claude will tell you), continue.

## 3. Create the app and its database volume

From the **repo root** (where `fly.toml` lives):

- [ ] Pick a globally-unique Fly app name. This checklist assumes
      **`alchemy-textbook`** — if it's taken, choose another and change the
      `app = "..."` line at the top of `fly.toml` to match.
- [ ] Create the app (this does **not** deploy yet):
  ```sh
  fly apps create alchemy-textbook
  ```
- [ ] Create the 1 GB SQLite volume in Dallas (`dfw`, matching
      `primary_region`). The name **must** be `textbook_data` (it matches the
      mount in `fly.toml`):
  ```sh
  fly volumes create textbook_data --app alchemy-textbook --region dfw --size 1
  ```
  Answer "yes" to the single-volume warning — one machine, one volume is exactly
  the model this app wants (single uvicorn worker, one SQLite file).

## 4. (Recommended) Confirm the book needs the TeX toolchain

`fly.toml` builds with `WITH_TEX=1`, which adds the ~2 GB LaTeX toolchain that
LaTeXML uses to rasterize tikz / tcolorbox figures. The Alchemy book uses those,
so this is the safe default. It makes the image build slower (~10–15 min) and
larger. Nothing for you to do here unless a later build proves it's unneeded —
just be aware the first build is not fast.

## 5. Set the secrets

- [ ] Set both secrets (this stores them encrypted on Fly; they become env vars
      in the container):
  ```sh
  fly secrets set \
    ANTHROPIC_API_KEY='sk-ant-...' \
    ADMIN_PASSWORD='your-strong-password' \
    --app alchemy-textbook
  ```
  Use single quotes so your shell doesn't mangle special characters.

## 6. Deploy

- [ ] Build and ship (uses Fly's remote builder — no local Docker needed):
  ```sh
  fly deploy --app alchemy-textbook
  ```
  The build runs the whole book pipeline (LaTeXML + frontend bundle) inside the
  image, so the **first** deploy takes ~10–15 min. Subsequent deploys with a warm
  cache are faster.
- [ ] When it finishes, check it's alive on the Fly-provided URL:
  ```sh
  fly open --app alchemy-textbook          # opens https://alchemy-textbook.fly.dev
  fly logs --app alchemy-textbook          # watch startup / troubleshoot
  ```
  You should see the reader load. Try `/admin` and log in with your
  `ADMIN_PASSWORD` to confirm the first-run seeding worked.

> **If the build fails on memory** (LaTeXML/TeX is heavy): rerun with a larger
> remote builder — `fly deploy --vm-memory 2048` — or ping Claude; there are a
> couple of fallbacks (build-only, local Docker).

## 7. Point alchemy.katestange.net at it

Do the custom-domain handshake on Fly first, then add the DNS record on
Cloudflare.

- [ ] Tell Fly about the domain (this requests a Let's Encrypt cert for it):
  ```sh
  fly certs add alchemy.katestange.net --app alchemy-textbook
  ```
  Fly prints the exact DNS records it wants — **use whatever it prints**. It
  typically recommends an **A + AAAA** pair for `alchemy` pointing at Fly's IPs
  (e.g. `A → 66.241.124.193`, `AAAA → 2a09:8280:1::...`). (A `CNAME` for
  `alchemy → alchemy-textbook.fly.dev` also works if that's what it shows.)
- [ ] In the **Cloudflare** dashboard → katestange.net → DNS → Records, add the
      records Fly printed, all **DNS only (grey cloud)**:
  - **A** `alchemy` → the IPv4 Fly printed
  - **AAAA** `alchemy` → the IPv6 Fly printed
  - (or, if Fly showed a CNAME instead: **CNAME** `alchemy` →
    `alchemy-textbook.fly.dev`)
  - **Proxy status: DNS only (grey cloud)** on every record ← important, see note.
- [ ] Wait a few minutes, then confirm validation:
  ```sh
  fly certs check alchemy.katestange.net --app alchemy-textbook
  ```
- [ ] Visit <https://alchemy.katestange.net> — done.

**Why grey cloud (DNS only) rather than Cloudflare's orange-cloud proxy?** This
app streams AI generations over SSE (long-lived HTTP responses). Fly terminating
TLS directly keeps those streams unbuffered and avoids Cloudflare's ~100 s proxy
timeout. Your DNS still lives on Cloudflare — you're just not proxying this one
subdomain. If you later want the orange cloud (Cloudflare caching/WAF in front),
it's doable: set SSL/TLS mode to **Full (strict)** and keep the Fly cert — but
start with grey cloud, it's the reliable default for streaming.

---

## 8. Day-to-day: publishing content updates

When you edit the book's `.tex` (or `book.toml`) later:

1. Rebuild + gate locally as usual: `./publish.sh` (commits the new baselines).
2. Redeploy the image: `fly deploy --app alchemy-textbook`.

The database (invite codes, budgets, cached AI content) lives on the `/data`
volume and is untouched by redeploys — only the baked-in book content changes.

## Operational notes

- **Backups:** the entire state is one SQLite file on the volume
  (`/data/textbook.db`). Snapshot it with:
  `fly ssh console --app alchemy-textbook -C 'cat /data/textbook.db' > backup.db`
  (or use `fly ssh sftp get`). A periodic copy is a complete backup.
- **Do not scale up workers or machines.** Admin sessions and rate-limit windows
  are in-process; keep it at one machine, one worker (the `fly.toml` is set for
  this). Restarting the machine logs you out of `/admin` (student sessions
  survive — they're in SQLite).
- **Do not enable auto-stop / scale-to-zero.** Cold starts would stall SSE and
  drop admin sessions. `fly.toml` pins `min_machines_running = 1`.
- **Costs & budgets:** all AI spend lands on your `ANTHROPIC_API_KEY`. Watch
  per-code budgets at `/admin/usage`; re-check model prices (`PRICES` in
  `backend/app.py`) against Anthropic's list each semester.
