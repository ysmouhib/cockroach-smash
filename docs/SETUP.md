# Setup and maintenance

Notes for running, deploying and looking after Cockroach Smash. Players never need any of this.

Everything is drawn in code on a canvas. The site is static (GitHub Pages); every
browser talks directly to [Supabase](https://supabase.com), which keeps the shared
data, checks every rule on the server and pushes live updates. `docs/PLAN.md` is the full
design.

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer.

```sh
npm install
npm run dev
```

Open the address it prints, usually http://localhost:5173/.

Without a `.env` file the game runs on a **fake in-memory backend**: nothing leaves
your browser and everything resets on reload. Add `?debug=1` to the address for a
frames-per-second counter and test buttons (switch to another fake visitor, skip
the 30-second respawn, add cockroaches).

To play against your Supabase project instead, copy `.env.example` to `.env` and fill
in the two values (see below), then restart `npm run dev`. `.env` is ignored by git.

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the site into `dist/` (paths prefixed with `/cockroach-smash/`) |
| `npm run preview` | Serves that build at http://localhost:4173/cockroach-smash/ |

## Set up the database (once)

The whole database (tables, security rules, server functions, live updates) is in
[`supabase/migrations/`](../supabase/migrations/), run in order: `001_init.sql`,
`002_clean_text.sql` (stricter cleaning of names and complaints), `003_hidden_text.sql`
(removes hidden "smuggled" text and cleans what is already stored),
`004_more_hidden_text.sql` (closes the gaps the tests found in 003).

1. At [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**.
   Choose a name, generate a database password and keep it, pick a region near your
   players (for example Central EU), then **Create new project**.
2. **Authentication → Sign In / Providers**: switch on **Allow anonymous sign-ins** and save.
   Every visitor gets an invisible anonymous ID; nobody has to make an account.
3. **SQL Editor → New query**: paste the whole of `supabase/migrations/001_init.sql`
   and click **Run**. If it warns about destructive statements (the `revoke` lines),
   confirm. It should end with "Success. No rows returned". Then do the same with
   `002`, `003` and `004`, each in a new query. (Already ran some earlier? Just run
   the ones after them, in order.)
4. **Database → Publications → supabase_realtime**: check that **roaches** is on, and
   no other table.
5. Copy two values:
   - **Project URL**: the **Connect** button at the top of the dashboard, or
     **Project Settings → Data API**.
   - **Publishable key** (starts with `sb_publishable_`): **Project Settings → API Keys**.

Put them in `.env` for local play:

```sh
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Each migration runs once, in order. To start over, create a new project (or drop the
tables and functions they created) and run them again.

### Check the rules against your project

[`scripts/simulate-smashers.js`](../scripts/simulate-smashers.js) signs in 10 anonymous
users, has them all smash one test cockroach, and checks the final kill, the Hall of
fame entry, the 30-second lock, that complaints can't be read directly, and that two
smashes at the same instant count once. Then it deletes everything it created.

It needs the **secret key** to delete the test data, so it reads it from the terminal
only, for that one command, never from `.env`. In PowerShell:

```powershell
$env:SUPABASE_SECRET_KEY = "sb_secret_..."   # Project Settings → API Keys → Secret keys
npm run simulate                             # add -- --real-wait to wait out each respawn (about 5 min)
Remove-Item Env:SUPABASE_SECRET_KEY
```

It uses 11 of the 30 anonymous sign-ins Supabase allows per hour from one IP address.

## Publish on GitHub Pages

The workflow in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) builds
the site and publishes it on every push to `main`.

1. In the repository on GitHub: **Settings → Secrets and variables → Actions →
   Variables → New repository variable**, twice:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your publishable key
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). When it is green,
   the site is at `https://<your-username>.github.io/<repo-name>/`.

The build stops with a clear error if the variables are missing, or if a secret key
was used by mistake.

## Keys: what is safe where

| Key | Where it may go |
| --- | --- |
| Publishable key (`sb_publishable_…`) | `.env`, repository **variables**, the public site. Safe: the database rules decide what anyone can do with it. |
| Secret key (`sb_secret_…`, or the legacy `service_role` key) | **Nowhere in this project.** Not in `.env`, not in the repo, not in GitHub variables or secrets. It bypasses every rule. If it ever leaks, rotate it in **Project Settings → API Keys**. |

The built page also carries a Content-Security-Policy (added in `vite.config.js`):
scripts only from the site itself, network only to the site and your Supabase project.

## CAPTCHA against bots (Cloudflare Turnstile)

Stops scripts from creating anonymous users in bulk. Real people rarely see it: a
box appears only when Cloudflare is unsure. **Order matters**: the site must send
CAPTCHA answers before Supabase starts requiring them, or new visitors are locked out.

1. At [dash.cloudflare.com](https://dash.cloudflare.com) (free account): **Turnstile →
   Add widget**. Name: `cockroach-smash`. Hostnames: `ysmouhib.github.io` (add
   `localhost` too for local testing). Widget mode: **Managed**. Create.
2. It shows a **Site key** (public) and a **Secret key** (private).
3. GitHub repo variable `VITE_TURNSTILE_SITE_KEY` = the site key. Push or re-run the
   workflow, and wait until the new site is live.
4. Only then, in Supabase: **Authentication → Attack Protection → Enable CAPTCHA
   protection**, provider **Cloudflare Turnstile**, paste the **secret key**, save.
   The Turnstile secret key goes only there, never in the repo or GitHub.

To switch it off again: disable it in Supabase first, then remove the variable.

## Good to know

- A free Supabase project **pauses after a week without visitors**. The site then
  shows "The cockroach database is taking a nap". Wake it by opening the project in
  the Supabase dashboard and clicking **Resume project**.
- Each browser counts as one person. A private window is a new person, so one
  determined visitor can release more than 2 cockroaches or count twice towards 10.
- Complaints go public as typed (length limit only). To remove one, delete its row
  from the `roaches` table in the Supabase **Table Editor**.

## Tests

| Command | What it does |
| --- | --- |
| `npm test` | Everything below on a local Postgres (PGlite): invisible-text attacks, access rules, game rules, fake backend |
| `npm run scan` | Fails if any file in the repo contains hidden characters |
| `npm run test:live` | The attacks against the deployed site (public key only; cleans up after itself) |
| `npm run simulate` | The 10-smasher rule check against the real project (needs the secret key, see above) |

The race tests (calls at the same instant) need a real PostgreSQL server: set
`DATABASE_URL=postgres://user:password@host:5432/postgres` and run `npm test`. They
create and drop their own throwaway database. Without `DATABASE_URL` they are skipped.

On GitHub, the deploy workflow runs `scan` and `test` (with a PostgreSQL 17 service
for the race tests) before building; a failure stops the deploy.

To test a new trick: add a payload to `tests/payloads.js` (built from code points,
never raw characters), run `npm test`, watch it fail, add the next numbered migration,
run it in the Supabase SQL Editor, then `npm run test:live`. Details:
[SECURITY-TESTS.md](SECURITY-TESTS.md).

## Project layout

| Path | What is in it |
| --- | --- |
| `src/game/` | Canvas, floor, cockroaches and their movement, sandals, effects, sound |
| `src/ui/` | Buttons, panels, dialogs, messages, the About link |
| `src/data/` | Backend access: Supabase, the fake backend, CAPTCHA, browser preferences |
| `supabase/migrations/` | The database, numbered; run in order |
| `tests/` | `npm test`: payloads, database and rule tests, race tests |
| `scripts/` | `test-invisible-prompts.js` (live attack), `scan-hidden-chars.js`, `simulate-smashers.js` |
| `docs/` | `SECURITY-TESTS.md`, this file, `PLAN.md` (the original game design) |
