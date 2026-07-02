# Git & GitHub Setup

## ✅ Local git — DONE (Claude did this)

The local repository is fully set up. You do **not** need to redo any of it:

- `git init` on branch **`main`**
- commit identity set to **Katherine Stange &lt;katestange@gmail.com&gt;**, so you
  are the author of the history — you own it
- `.gitignore` in place (excludes `.env`, `build/`, the ~8 MB zip, venvs, etc.)
- **first commit made** — `5dc6718`, 24 files tracked
- **verified** that `.env` (your API key) is **not** tracked

You can confirm any time (run as the `claude` user — see ownership note below):

```bash
cd /workspace
git log --oneline
git ls-files | grep -x ".env" && echo "!! KEY IS TRACKED — STOP" || echo "ok: key not tracked"
```

## ✅ Remote — DONE (SSH deploy key, scoped to this repo)

Live at **github.com/katestange/alchemy-textbook**; pushes go over an **SSH
deploy key** scoped to this one repository:

- Remote: `git@github.com:katestange/alchemy-textbook.git`
- Auth: an ed25519 **deploy key** (write-enabled) on the repo. The private half
  lives in the container (`~/.ssh/id_ed25519`, claude-owned, never committed);
  only the public half is on GitHub.
- Scope: **this repository only** — revoke anytime via the repo's
  Settings → Deploy keys (one click; nothing else is affected).

No tokens, no secrets in chat. The Path A / Path B sections below are kept as
reference (how the remote could be set up, and alternatives).

---

## A note on ownership (run git as the `claude` user)

Every file here is owned by the `claude` user, not `root`. Run git/GitHub
commands as `claude` so credentials and `.git` ownership stay consistent. From
your root shell, drop into a claude shell first:

```bash
sudo -u claude -H bash
cd /workspace
```

Do the steps below in that shell.

---

## Put it on GitHub — Path A (web + token, no extra install) ⟵ recommended

`gh` isn't installed here, and installing it on Debian needs GitHub's apt repo.
The quickest route needs nothing extra — just a repo and a token.

### 1. Create an empty repo on your account
On **github.com** (logged into your account): **New repository** →
name it (e.g. `alchemy-textbook`) → **Private** → **do NOT** add a README,
`.gitignore`, or license (we already have them) → **Create repository**.

> Start **private**. Make it public later (spec Q9 wants the reference
> implementation public) once you've confirmed there are no secrets in history.

### 2. Make a Personal Access Token
GitHub no longer accepts your account password over HTTPS git — you need a token.
github.com → **Settings → Developer settings → Personal access tokens** →
generate one with **repo** scope (fine-grained: give it read/write "Contents" on
this repo). Copy it (you'll see it once).

### 3. Add the remote and push (in the claude shell, in /workspace)
```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
When prompted:
- **Username:** your GitHub username
- **Password:** paste the **token** (not your account password)

To avoid re-typing the token on later pushes:
```bash
git config --global credential.helper store   # saves it (plaintext) in ~/.git-credentials
```
(Use `credential.helper cache` instead if you'd rather it not persist to disk.)

Done — refresh the repo page and your files are there, authored by you.

**SSH alternative:** if you already have an SSH key on GitHub, skip the token and
use `git remote add origin git@github.com:<your-username>/<repo-name>.git`.

---

## Put it on GitHub — Path B (GitHub CLI)

Nicer if you'll use GitHub a lot, but needs a root install first.

**You (root)** — install `gh` via GitHub's apt repo:
```bash
type -p curl >/dev/null || apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list
apt-get update && apt-get install -y gh
```

**Then (claude shell)** — authenticate and create+push in one go:
```bash
sudo -u claude -H bash
cd /workspace
gh auth login          # choose GitHub.com → HTTPS → login with a browser or token
gh repo create <repo-name> --private --source=. --remote=origin --push
```
`gh` handles the remote, credentials, and push together.

---

## After it's up: everyday workflow

```bash
git status                 # what changed
git add -p                 # stage changes, reviewing each hunk
git commit -m "message"    # commit
git push                   # publish to GitHub

# risky experiment on a branch:
git checkout -b experiment
# ...work...
git checkout main && git merge experiment    # keep it
# or: git checkout main && git branch -D experiment   # discard it
```

Commit after each meaningful unit (a spec revision, a working pipeline change, a
chapter edit). Small, frequent commits make it easy to see what changed and roll
back a bad step.

---

## The one rule: never commit `.env`

`/workspace/.env` holds the instructor Anthropic API key. `.gitignore` already
excludes it, and the first commit is confirmed clean. If a key ever does land in
a commit:

1. **Rotate (regenerate) the key** in the Anthropic console immediately — assume
   it's compromised. Deleting the file or rewriting history is *not* enough on
   its own, especially once pushed.
2. Put the new key in `.env` (still git-ignored).
3. If it was only local and never pushed, you can also scrub history
   (`git filter-repo` / BFG), but rotating the key is what actually protects you.

Before flipping the repo to **public**, re-run the safety check above and skim
`git ls-files` once more.
