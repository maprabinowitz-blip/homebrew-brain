# Homebrew Brain 🧠

A chatbot whose intelligence is written entirely from scratch — no ChatGPT, no Claude, no external AI APIs, no API keys. One shared brain for all visitors, stored in a Cloudflare D1 database that persists forever.

## How it thinks (in order)

1. **Shared memory** — TF-IDF keyword matching with stopword filtering, stemming, and an inverted index. "hmm so what's the best pizza??", "best pizza", and "pizzas" all find the same learned fact, instantly, even with thousands of facts.
2. **Rules** — ELIZA-style patterns with pronoun reflection ("I am sad" → "Why are you sad?").
3. **Math** — a small safe arithmetic evaluator (`12*(3+4)`).
4. **Web sight** — factual questions ("what is a quasar?") are looked up on Wikipedia's free public API, no key needed.
5. **AI digestion (Workers AI)** — anything still unanswered goes to an open-source Llama model running on YOUR Cloudflare account's GPUs. No API key — it's a binding like the database, with a free daily allowance. The homemade stages answer first, so the model is only called for the leftovers. If the allowance runs out, the bot falls back to improvising/learning instead of erroring.
6. **Markov generator** — improvises sentences from its corpus + everything learned.
7. **Learning** — if stumped, it asks for the answer and saves it for everyone. Or teach directly: `learn: question => answer`

## Setup (no terminal needed) — GitHub + Cloudflare auto-deploy

Everything happens in your web browser. Once set up, **every commit to GitHub automatically updates your live site** — which means you (or Claude, via tools that can commit to GitHub) can improve the bot just by committing.

### Step 1 — Put the code on GitHub
1. Create a free account at github.com
2. New repository → name it `homebrew-brain` → Public → Create
3. Click **uploading an existing file** and drag in ALL files from this folder: `wrangler.toml`, `schema.sql`, `package.json`, `.gitignore`, `README.md`, the `src` folder, and the `public` folder. Commit.

### Step 2 — Create your database (Cloudflare dashboard)
1. Create a free account at dash.cloudflare.com
2. Go to **Storage & Databases → D1 → Create database**, name it `homebrew-brain-db`
3. On the database page, copy its **Database ID**
4. Open the **Console** tab of the database and paste + run the contents of `schema.sql` (the CREATE TABLE statement). Your facts table now exists.

### Step 3 — Connect the ID
On GitHub, open `wrangler.toml`, click the pencil to edit, replace `PASTE_YOUR_DATABASE_ID_HERE` with your Database ID, commit.

### Step 4 — Deploy with Git integration
1. In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Connect to Git** (sign in with GitHub when prompted)
2. Pick your `homebrew-brain` repository
3. Accept the defaults (deploy command `npx wrangler deploy`) and create

Cloudflare builds and deploys. You get a live URL like `https://homebrew-brain.YOUR-SUBDOMAIN.workers.dev` — and from now on, **every commit to the repo redeploys automatically**. The database is never touched by redeploys; the brain's memory is safe.

## Alternative setup (terminal, no GitHub)

If you prefer the command line: install Node.js, then in this folder run
`npm install` → `npx wrangler login` → `npx wrangler d1 create homebrew-brain-db`
(paste the printed id into wrangler.toml) →
`npx wrangler d1 execute homebrew-brain-db --remote --file=schema.sql` → `npx wrangler deploy`

## Admin: wiping the brain

Visitors can't erase memory. To enable wiping, add a secret named `ADMIN_SECRET` to the Worker (dashboard: your Worker → Settings → Variables and secrets), then:

```bash
curl -X POST https://YOUR-URL/api/forget -H "x-admin-secret: YOUR_SECRET"
```

You can also browse and edit individual facts anytime in the dashboard: Storage & Databases → D1 → homebrew-brain-db → the `facts` table.

## A note on public learning

Anyone with your URL can teach the bot, and everyone sees it. Lengths are capped and the brain maxes out at 5,000 facts, but there's no content filter — keep that in mind before sharing widely, and prune the facts table if someone teaches it junk.

## API

| Method | Path          | Body / headers                  | What it does                |
|--------|---------------|---------------------------------|-----------------------------|
| GET    | `/api/memory` | —                               | Returns all learned facts   |
| POST   | `/api/teach`  | `{ "q": "...", "a": "..." }`    | Saves or updates a fact     |
| POST   | `/api/forget` | header `x-admin-secret`         | Wipes memory (if enabled)   |

## Project layout

```
wrangler.toml      Cloudflare configuration (name, assets, database)
schema.sql         The database table definition
src/index.js       The Worker: API endpoints + serves the frontend
public/index.html  The chatbot — UI and the entire "brain" logic
```
