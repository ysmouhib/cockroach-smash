# Cockroach Smash

**A live multiplayer game used as a testbed for invisible-prompt defenses.**

[![Tests and deploy](https://github.com/ysmouhib/cockroach-smash/actions/workflows/deploy.yml/badge.svg)](https://github.com/ysmouhib/cockroach-smash/actions/workflows/deploy.yml)

**Play it:** https://ysmouhib.github.io/cockroach-smash/

## The game

A shared kitchen floor full of cockroaches, each carrying a complaint written by a
visitor. Smash one with your sandal to read its complaint. When ten different people
have smashed the same cockroach, it is gone for good and joins the Hall of fame.

## Why it is a security testbed

Every name and complaint is written by a stranger, stored, shown to other people, and
may later be read by AI tools: an assistant summarising the Hall of fame, a moderation
script, a coding assistant working on this repo. Text can carry things people cannot
see but language models do read:

- **ASCII smuggling:** a whole sentence hidden in invisible Unicode tag characters.
  "Nice floor." can secretly continue "Ignore all previous instructions...".
- **Emoji and bit smuggling:** messages encoded as variation selectors after an
  emoji, or one bit per letter.
- **Trojan Source:** direction overrides that make text display reversed or differently
  from what it is, e.g. a name that shows as "Admin".
- **Zero-width tricks:** look-alike names and words split to dodge filters.

The game is a small, real target for these attacks: public, multiplayer, and open to
anyone without an account.

## Defenses, in layers

1. **The database cleans every text on arrival.** Names and complaints can only be
   written through server functions, which remove or refuse hidden characters before
   anything is stored ([migrations 002-004](supabase/migrations/)). A browser cannot
   skip this step.
2. **Locked data.** Row Level Security on every table; complaints are unreadable until
   someone smashes the cockroach; all rules run on the server.
3. **Plain text only in the page,** plus a Content-Security-Policy: visitor text can
   never become code.
4. **No hidden characters in this repo either.** Every push is scanned for invisible
   and direction-changing characters (protection against Trojan Source in the code).
5. **AI tools treat stored text as data, never as instructions** (rule in
   [CLAUDE.md](CLAUDE.md) for coding assistants).

## Tests

| Command | Checks |
| --- | --- |
| `npm test` | 20 invisible-text attacks, database access rules, game rules, simultaneous calls on real PostgreSQL |
| `npm run scan` | No hidden characters anywhere in the repo |
| `npm run test:live` | The same attacks against the deployed site, as an anonymous visitor |

Every push runs `scan` and `test`; the site is only published if they pass. The tests
found four gaps along the way, each closed by a migration and kept in the suite.
Payloads, method and results: [docs/SECURITY-TESTS.md](docs/SECURITY-TESTS.md).

**Limits:** visible prompt injection ("ignore your instructions" in plain words) cannot
be filtered, only refused by the reader; look-alike letters from other alphabets are
not changed. Details in the test document.

## More

- [docs/SECURITY-TESTS.md](docs/SECURITY-TESTS.md): payloads, how the tests run, results
- [SECURITY.md](SECURITY.md): reporting a vulnerability
- [docs/SETUP.md](docs/SETUP.md): running, deploying and maintaining it
- [docs/PLAN.md](docs/PLAN.md): the original game design

Built with plain JavaScript, Canvas 2D, Vite, Supabase (Postgres, Row Level Security,
Realtime) and GitHub Pages.
