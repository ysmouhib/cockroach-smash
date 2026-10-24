# Cockroach Smash: build plan for Claude Code

Oct 24, 2026

## What we're building

A live web page on GitHub Pages where every visitor shares one kitchen floor of realistic cockroaches. Each cockroach carries a hidden complaint written by a visitor. You smash cockroaches with a sandal cursor to read their complaint. A cockroach dies for good once 10 different people have smashed it, and the 10th person gets a winning message.

| Topic | Decision |
| --- | --- |
| Hosting | GitHub Pages (free static site) |
| Shared data | Supabase free tier: database, live updates, rules checked on the server |
| Cockroach look | Realistic, seen from the top in 2.5D: glossy shell, spiny legs, long antennae, soft shadow |
| Language | English |
| Red button, top left | "Release a cockroach" |
| Yellow button, top right | "Choose a sandal" |
| Sandals | Flip-flop, house slipper, wooden clog, sport sandal |
| Your name | Asked once, at your first release, then remembered in the browser. Smashing needs no name |
| Who counts as a different user | Each browser gets an invisible anonymous ID (Supabase anonymous sign-in) |
| Release limit | Max 2 living cockroaches per person. "Self-destruct" on one of yours frees a slot |
| Smashing your own cockroach | Allowed, and it counts |
| Respawn after a smash | 30 seconds |
| Final death | After 10 different smashers. The 10th gets a winning message |
| After final death | Leaves the floor and goes to a "Hall of fame" list |
| Complaint rules | Length limit only (280 characters) |
| Phones and tablets | Tap to smash: the sandal drops where you tap |

## Tech stack and architecture

GitHub Pages only serves the page files; every browser talks straight to Supabase, which checks the rules and pushes changes to all open pages. There is no server of your own to run or pay for.

```text
Your repo --push--> GitHub Actions --build--> GitHub Pages --page files--> Visitor's browser

Visitor's browser --sign in--> Supabase anonymous sign-in   (one ID per browser)
Visitor's browser --calls----> Supabase server functions    (check every rule)
Visitor's browser <--reads---- roaches table                (public, no complaints)
Visitor's browser <--updates-- Supabase Realtime            (sends roach changes)

Locked tables (complaints, smashes, profiles): only the server functions can read them.
```

The browser never sees a complaint until its own smash succeeds, because complaints sit in a locked table only the server functions can read.

- **Front end:** Vite + plain JavaScript, Canvas 2D for the floor, cockroaches, sandal and effects. No framework, so the code stays small.
- **Backend:** Supabase with `@supabase/supabase-js`: anonymous sign-in, Postgres tables, server functions, Realtime.
- **Movement sync:** cockroach positions are never sent over the network. Each browser computes them from the cockroach's `seed` and the server clock, so everyone sees the same thing.
- **Hit detection** happens in the browser. The server only checks whether the cockroach can be smashed right now and counts the smasher.
- **Deploy:** GitHub Actions builds the site on every push to `main` and publishes it to GitHub Pages.

## Database and server rules

Every rule lives in the database, so nobody can cheat by editing the page in their browser. The page reads one public table and calls five server functions. Complaints are stored in a separate locked table, so they stay secret until someone smashes the cockroach.

**Tables**

| Table | Who can read it | Columns |
| --- | --- | --- |
| `profiles` | Nobody directly | `id` (= the visitor's anonymous user ID), `name` (1 to 24 characters) |
| `roaches` | Everyone | `id`, `owner_id`, `owner_name`, `seed` (drives movement), `size` and `tint` (small random variation), `created_at`, `dead_until` (null when alive), `status` (`alive`, `exterminated`, `self_destructed`), `smash_count` (distinct smashers), `exterminated_at`, `finisher_id`, `finisher_name` |
| `roach_secrets` | Nobody directly | `roach_id`, `complaint` (1 to 280 characters) |
| `smashes` | Nobody directly | `roach_id`, `smasher_id`, `created_at`. Primary key on (`roach_id`, `smasher_id`), so each person counts once per cockroach |

**Security:** Row Level Security is on for every table. `roaches` allows `select` for everyone and nothing else. All writes go through `security definer` functions that identify the caller with `auth.uid()`. Every visitor signs in anonymously on page load, so every visitor has an ID.

**Server functions**

| Function | Who may call it | What it checks | What it returns |
| --- | --- | --- | --- |
| `release_roach(name, complaint)` | Any visitor | Name 1 to 24 characters, complaint 1 to 280 characters (trimmed), caller has fewer than 2 cockroaches with status `alive`. Saves the name in `profiles` | The new cockroach |
| `smash(roach_id)` | Any visitor | Cockroach is `alive` and not respawning (`dead_until` is null or past). Locks the row (`select … for update`) so two smashes at the same instant can't break the count | Complaint, owner name, `smash_count`, `final` (true or false) |
| `self_destruct(roach_id)` | The owner only | Caller is the owner and the cockroach is `alive` | OK |
| `hall_of_fame(limit, offset)` | Any visitor | Status `exterminated` | Owner name, complaint, finisher name, date, newest first |
| `set_finisher_name(roach_id, name)` | The finisher only | Caller is `finisher_id`, name 1 to 24 characters | OK |

**Smash logic, step by step**

1. Insert (`roach_id`, caller) into `smashes`; if it already exists, do nothing.
2. Recount distinct smashers into `smash_count`.
3. If `smash_count` reaches 10: set status `exterminated`, `exterminated_at` = now, `finisher_id` = caller, `finisher_name` = caller's profile name if they have one. Return `final: true`.
4. Otherwise set `dead_until` = now + 30 seconds. Return `final: false`.

**Live updates:** Supabase Realtime is turned on for `roaches` only. Every page listens for inserts and updates, so new cockroaches, splats, respawns and final kills appear for everyone within about a second. Nothing secret is in that table, so nothing secret is broadcast.

**Release limit:** It counts living cockroaches. A cockroach that self-destructs or gets exterminated frees its owner's slot.

## Gameplay and screen spec

The whole page is one floor with two buttons in the top corners; everything else is a panel that opens over the floor.

**Screen layout**

- The floor is a canvas filling the window. Cockroaches roam it and turn back at the edges.
- Top left: red button "Release a cockroach", with a small badge showing your living cockroaches ("1/2").
- Top right: yellow button "Choose a sandal".
- Bottom left: a small "Hall of fame" button. Bottom right: sound on/off.
- Over the floor, the normal cursor is hidden and the sandal follows the mouse. Over buttons and panels, the normal cursor returns.

**Releasing a cockroach**

1. Clicking the red button opens a panel under it.
2. First time only: a Name field (max 24 characters) above the complaint. Later the name is prefilled, with a small "Change" link.
3. A complaint box (max 280 characters) with a live counter ("212 left").
4. Enter or the "Release" button submits. Shift+Enter adds a new line. Escape or a click outside closes the panel. Empty or too long shows an inline message and keeps the panel open.
5. On success the panel closes and the new cockroach scuttles in from the nearest screen edge, its owner's name under it.
6. With 2 cockroaches already out, the panel lists "Your cockroaches" instead, each with a "Self-destruct" button. Once one is gone, the form appears.

**Choosing a sandal**

- The yellow button opens a dropdown of four picture tiles: Flip-flop, House slipper, Wooden clog, Sport sandal.
- The current one is outlined. Clicking another switches the cursor at once. The choice is saved in the browser. Default: Flip-flop.

**Smashing**

1. Click a cockroach. The hit area is its body plus a 10 px margin, 1.5 times bigger on touch screens.
2. The sandal slams down, the screen shakes slightly, and the cockroach squashes into a splat at once, without waiting for the server.
3. The page calls `smash()`. A card appears next to the splat: "\<Owner> complained:", the text, and "Smashed 4 of 10". It closes on click or after 10 seconds.
4. Other visitors see the splat through live updates, but not the complaint.
5. 30 seconds later the splat fades and the cockroach crawls back in from the nearest edge, for everyone.
6. A splat can't be hit while it waits. Hovering it shows "Back in 12 s".
7. If someone else hit it a split second earlier, the server refuses and the page shows "Too slow, someone got it first".
8. A miss makes a thud and leaves a faint sole print that fades.

**Final kill (the 10th different smasher)**

- The winner sees a big centered message: "You finished it! This cockroach is gone for good.", the complaint, and "Smashed by 10 people".
- If the winner has no name yet, the message offers an optional field: "Add your name to the Hall of fame".
- Everyone else sees that cockroach turn pale, flip on its back and fade away.

**Self-destruct**

- Available only from "Your cockroaches" in the release panel. Clicking your own cockroach on the floor smashes it (and counts).
- It asks "Self-destruct this cockroach? Its complaint will be lost." On yes, it flips on its back, kicks its legs and fades. It does not enter the Hall of fame.

**Hall of fame**

- The bottom-left button opens a side panel with one card per exterminated cockroach: owner name, complaint, "Finished by \<name or Anonymous>", and date.
- Newest first, 30 at a time, with "Show more".

**Phones and tablets**

- A tap smashes at that point: the sandal appears there, slams and fades. No hover effects.
- Panels open as full-width sheets from the bottom. Buttons stay in the top corners, at least 44 px tall.
- Double-tap zoom and page scrolling are blocked on the floor.

**Crowd control**

- Above 60 living cockroaches, draw them slightly smaller so the floor stays readable. Above 150, show the newest 150.

## Visual and sound spec

Everything is drawn in code on a 2D canvas, so there are no image files to find or license; the 2.5D feel comes from shading, shadows and leg animation. The reference code at the end of "Build phases" is the realistic cockroach chosen during design.

**The cockroach (realistic, seen from the top)**

- Oval abdomen with a radial gradient: amber highlight near the top-left, dark brown at the edges.
- Two slightly see-through wings over the abdomen, with thin vein lines.
- Pronotum (the shield behind the head) with a pale yellow rim and a dark center. Small dark head.
- Six legs with tiny spines, moving in a tripod gait (three legs at a time). Leg speed matches walking speed.
- Long, thin antennae that twitch all the time. Two short tail spikes (cerci) at the back.
- A soft shadow offset down and to the right, with light coming from the top-left. This sells the depth.
- A small white glint on the shell.
- About 70 px long on a laptop screen, with ±15% size and a slight colour variation per cockroach (from its `seed`).
- Owner name in small white text with a dark outline, under the cockroach.

**Movement**

- Behaviour: dart, stop, twitch, turn, dart again. Stay off the very edges and the button corners.
- Position is a function of the cockroach's `seed` and the current server time, so every visitor sees it in about the same place without sending positions over the network.
- Local only: cockroaches flinch away when the sandal comes within about 80 px. This makes them harder to hit and doesn't need syncing.
- Draw at the screen's real pixel density so it looks sharp on phones and Retina screens.

**Floor**

- Worn kitchen floor: cream tiles with grey grout, a few faint stains and crumbs, a soft dark vignette at the edges.
- Drawn once to an offscreen canvas and reused every frame.

**Sandals (the cursor, about 90 px)**

| Sandal | Look |
| --- | --- |
| Flip-flop | Teal rubber sole seen from above, Y-shaped strap |
| House slipper | Fluffy, closed toe, faded plaid fabric |
| Wooden clog | Pale wooden sole, dark leather top |
| Sport sandal | Thick black treaded sole, two velcro straps |

No brand names or logos. The click point is the middle of the sole. Tilt the sandal slightly in the direction the mouse moves.

**Effects**

- Slam: the sandal shrinks from 115% to 100% in about 100 ms, the floor shakes 4 px for 150 ms.
- Splat: the cockroach flattens with legs splayed, plus a brown-yellow splat stain with a few drips and specks. Stays until respawn.
- Respawn: the splat fades over 1 second, then the cockroach crawls in from the nearest edge.
- Final kill: the cockroach goes pale, flips on its back, fades out. The winner alone also gets a short burst of gold confetti.
- Self-destruct: flips on its back, legs kick for 1 second, fades.

**Sound** (on by default, mute button bottom right, choice saved)

- Smack on a hit, softer thud on a miss, quick scuttle when a cockroach is released, short fanfare for the winner.
- Generated with the Web Audio API, or small free CC0 sound files kept in the repo with their source noted.

## Build phases

Build it in 8 phases: the game runs fully offline with a fake backend first, then Supabase is plugged in, then it goes online. Testing the fun part before the database keeps each step small and easy to check.

**How to use this with Claude Code:** save this file as `PLAN.md` at the root of your repo. Open Claude Code in the repo folder. For each phase, start a fresh conversation, paste the prompt, try the result in your browser, and commit when you're happy.

**Phase 1: Project skeleton**

```text
Read PLAN.md. Set up a static site for GitHub Pages: Vite + plain JavaScript (no framework), ES modules, one index.html. Create folders src/game (canvas, cockroaches, sandals, effects), src/ui (buttons, panels) and src/data (backend access). Write a CLAUDE.md that sums up the key rules of PLAN.md in about 20 lines and keep it updated. Show a full-window canvas with the kitchen floor from PLAN.md, sharp on high-density screens. No game features yet. Tell me how to run it locally.
```

**Phase 2: Cockroaches and sandal (offline)**

```text
Following PLAN.md "Visual and sound spec", draw realistic top-down cockroaches using the reference code at the end of "Build phases" as the starting point. Spawn 8 fake cockroaches with random seeds and names. Implement the movement rules (dart, stop, twitch, turn; avoid edges and the top corners; flinch from the sandal locally). Make movement a pure function of seed and time so it can be synced later. Hide the cursor over the floor and draw the chosen sandal instead. Build the "Choose a sandal" dropdown with the 4 sandals drawn in code, saved in localStorage. Keep 60 fps with 150 cockroaches, and add an FPS counter when the URL has ?debug=1.
```

**Phase 3: Smash, respawn, final kill (offline)**

```text
Implement smashing from PLAN.md "Gameplay and screen spec" on an in-memory fake backend, src/data/fakeBackend.js. It must expose exactly the functions the real one will (release_roach, smash, self_destruct, hall_of_fame, set_finisher_name) and enforce the same rules: 30 s respawn, 10 distinct smashers, 2 living cockroaches per person, 24/280 character limits. Add the slam, splat, complaint card, "Back in 12 s" hover, miss print, final-kill message with optional name field, and flip-and-fade animations. With ?debug=1, add a control to switch the fake user ID so I can test the 10-smasher rule alone.
```

**Phase 4: Release panel, self-destruct, hall of fame (offline)**

```text
Build the "Release a cockroach" panel, the "Your cockroaches" list with Self-destruct and its confirmation, the 1/2 badge, and the Hall of fame side panel exactly as PLAN.md describes, still on the fake backend. Enter submits, Shift+Enter adds a line, Escape closes. Ask for the name only the first time, save it in localStorage, and let it be changed. Make every panel usable with the keyboard.
```

**Phase 5: Supabase backend**

```text
Create supabase/migrations/001_init.sql implementing PLAN.md "Database and server rules": the tables, Row Level Security on every table, the five security definer functions with all their checks, row locking in smash(), and Realtime on the roaches table only. A complaint must never be readable before its cockroach is smashed. Then write src/data/supabaseBackend.js with the same interface as the fake backend, using @supabase/supabase-js: signInAnonymously() on page load, the project URL and publishable key from VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, and a Realtime subscription that updates the floor. Sync movement time to the server clock. Choose fake or real backend with an env flag. Tell me exactly what to click in the Supabase dashboard.
```

**Phase 6: Phones, sound, polish**

```text
Add tap-to-smash for touch screens, bottom-sheet panels on narrow screens, buttons at least 44 px tall, and block double-tap zoom and scrolling on the floor. Add the sounds from PLAN.md with a mute button saved in localStorage. Add friendly messages for being offline, the database being paused, and "Too slow, someone got it first". Check performance in a phone-sized window.
```

**Phase 7: Publish on GitHub Pages**

```text
Add a GitHub Actions workflow that builds the site and deploys it to GitHub Pages on every push to main, reading VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from repository variables. Set Vite's base path to the repo name. Write a README with the live link, how to run it locally, and how to apply the database migration. Never put the Supabase secret key in the repo.
```

**Phase 8: Test pass**

```text
Go through the testing checklist in PLAN.md against the live site. Write scripts/simulate-smashers.js that signs in 10 anonymous users against the real project and smashes one test cockroach to verify the final-kill rule and the Hall of fame entry, then deletes the test data. Report what passes and what fails, and fix the failures.
```

**Reference code: the realistic cockroach chosen during design**

The canvas must already be moved to the cockroach's center and rotated so it faces right (+x). `phase` is the gait phase (advance it with distance walked); `t` is time in seconds. The shadow offset is not affected by rotation, so the light stays fixed at the top-left. In the design preview it was drawn with `scale(1.4)`.

```js
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }

function forEachLeg(phase, cb) {
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const tripod = ((i % 2 === 0) === (side > 0)) ? 0 : Math.PI;
    const swing = Math.sin(phase + tripod) * 0.35;
    const base = [0.75, 1.6, 2.35][i] + swing * (i === 1 ? 1 : 0.8);
    const root = [[18, 10, 2][i], side * 7];
    const L1 = [14, 14, 16][i], L2 = [16, 16, 22][i];
    const a2 = base + [-0.6, 0.15, 0.55][i];
    const knee = [root[0] + L1 * Math.cos(base), root[1] + side * L1 * Math.sin(base)];
    const foot = [knee[0] + L2 * Math.cos(a2), knee[1] + side * L2 * Math.sin(a2)];
    cb(root, knee, foot);
  }
}

function drawRealisticRoach(c, phase, t) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 10; c.shadowOffsetX = 5; c.shadowOffsetY = 7;
  c.lineCap = 'round'; c.strokeStyle = '#2a1409';
  forEachLeg(phase, (r, k, f) => {
    c.lineWidth = 1.8; c.beginPath(); c.moveTo(...r); c.lineTo(...k); c.lineTo(...f); c.stroke();
    c.lineWidth = 1;
    for (let j = 1; j < 4; j++) { // leg spines
      const px = k[0] + (f[0] - k[0]) * j / 4, py = k[1] + (f[1] - k[1]) * j / 4;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (f[1] - k[1]) * 0.12, py - (f[0] - k[0]) * 0.12); c.stroke();
    }
  });
  for (const s of [-1, 1]) { // twitching antennae
    const a = s * (0.35 + Math.sin(t * 6 + s) * 0.12 + Math.sin(t * 2.3 * s) * 0.08);
    c.beginPath(); c.moveTo(31, s * 3);
    c.quadraticCurveTo(31 + 35 * Math.cos(a * 0.4), s * 3 + 35 * Math.sin(a * 0.4), 31 + 70 * Math.cos(a), s * 3 + 70 * Math.sin(a));
    c.stroke();
  }
  c.beginPath(); c.moveTo(-32, -4); c.lineTo(-42, -8); c.moveTo(-32, 4); c.lineTo(-42, 8); c.stroke(); // cerci
  const g = c.createRadialGradient(-12, -6, 2, -8, 0, 28);
  g.addColorStop(0, '#b8692f'); g.addColorStop(0.6, '#6e3112'); g.addColorStop(1, '#3a170a');
  ellipse(c, -8, 0, 25, 15); c.fillStyle = g; c.fill();
  c.restore();
  for (const s of [-1, 1]) { // wings with veins
    c.beginPath(); c.ellipse(-10, s * 3.5, 22, 9, s * 0.08, 0, Math.PI * 2);
    c.fillStyle = 'rgba(125,58,22,.55)'; c.fill();
    c.strokeStyle = 'rgba(30,10,0,.5)'; c.lineWidth = 0.6; c.stroke();
    for (let v = 0; v < 3; v++) { c.beginPath(); c.moveTo(8, s * (2 + v * 2)); c.lineTo(-28, s * (3 + v * 3)); c.stroke(); }
  }
  ellipse(c, 15, 0, 9, 12); c.fillStyle = '#d4ad73'; c.fill(); // pronotum rim
  ellipse(c, 15, 0, 6, 8); c.fillStyle = '#4a200c'; c.fill();
  ellipse(c, 25, 0, 5, 6); c.fillStyle = '#3a1a0a'; c.fill(); // head
  ellipse(c, -13, -6, 9, 2.5); c.fillStyle = 'rgba(255,240,220,.45)'; c.fill(); // glints
  ellipse(c, 14, -4, 3, 1.5); c.fill();
}
```

## Your setup checklist

You need two free accounts, GitHub and Supabase, and about 20 minutes of clicking; Claude Code does the rest. Do the GitHub part before Phase 1 and the Supabase part before Phase 5.

**GitHub (before Phase 1)**

- [ ] Create a public repository, for example `cockroach-smash`. GitHub Pages is free for public repositories.
- [ ] Clone it to your computer and add this plan as `PLAN.md`.
- [ ] Install Claude Code and open it in that folder.

**Supabase (before Phase 5)**

- [ ] Create a free project. Pick an EU region close to Switzerland.
- [ ] In Authentication settings, turn on anonymous sign-ins.
- [ ] Run the migration file Claude Code writes (`supabase/migrations/001_init.sql`) in the SQL editor.
- [ ] Check that Realtime is on for the `roaches` table.
- [ ] Copy the project URL and the publishable key (it starts with `sb_publishable_`) into a local `.env` file, which must not be committed.
- [ ] Optional but recommended: turn on CAPTCHA protection (Cloudflare Turnstile) for sign-ins, so bots can't flood the database with fake visitors.

**Going live (Phase 7)**

- [ ] In the GitHub repo settings, add the URL and publishable key as Actions variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- [ ] In the Pages settings, set the source to "GitHub Actions".
- [ ] Never paste the Supabase secret key into the site, the repo or GitHub variables. The publishable key is safe in the browser because the database rules protect the data.

**Keep in mind:** a free Supabase project pauses after one week without any visitors, and you restore it with one click in the dashboard. The free plan allows 2 active projects and includes anonymous sign-ins.

## Testing checklist

Share the link only when every box below is ticked. Use two browsers side by side (a normal window and a private window count as two different people).

- [ ] A cockroach released in window A appears in window B within about 1 second, with the right name.
- [ ] The complaint is not visible anywhere before a smash, including the browser's network tab.
- [ ] Smashing in A shows the complaint in A only. B sees the splat.
- [ ] The cockroach comes back after 30 seconds in both windows, and can't be hit while it waits.
- [ ] A third release from the same browser is blocked. Self-destructing one allows a new release.
- [ ] A 281-character complaint and a 25-character name are refused, with a clear message.
- [ ] Enter submits, Shift+Enter adds a line, Escape closes the panel.
- [ ] The test script with 10 anonymous users exterminates a cockroach; the 10th gets the winning message; it appears in the Hall of fame; nobody can smash it afterwards.
- [ ] Two smashes at the same instant are counted correctly.
- [ ] All four sandals show and the choice survives a page reload.
- [ ] On a phone, tap-to-smash works, panels fit the screen, and the page doesn't zoom or scroll.
- [ ] With 150 cockroaches the page stays smooth on a laptop (the ?debug=1 counter shows about 60 fps).
- [ ] After a page reload, your name and your 2-cockroach count are remembered.

## Defaults I chose, and what you may want to change

These are choices made where you didn't decide; change any of them here before Phase 1 and Claude Code will follow the new text.

| Topic | What the plan says now | Why |
| --- | --- | --- |
| Removing your own cockroach | Labelled "Self-destruct" on screen (you called it the suicide option) | Same feature, lighter wording for a public page |
| Who sees a complaint | Only the person who smashed it, until it reaches the Hall of fame | Keeps the surprise for each smasher |
| Release limit | 2 *living* cockroaches; exterminated or self-destructed ones free a slot | Matches "remove one and replace it" |
| Winner's name | Taken from their profile if they ever released; otherwise optional field in the winning message | Smashing needs no name, but the Hall of fame is nicer with one |
| Text limits | Name 24 characters, complaint 280 | Fits on a card and under a cockroach |
| Sound | On by default, with a mute button | Easy to turn off |
| Floor | Worn kitchen tiles | Fits the realistic style |
| Fleeing the sandal | Local to each visitor | Makes smashing harder without network traffic |

**Known limits you accepted:**

- Opening a private window or another browser gives a new anonymous ID. One person could release more than 2 cockroaches or count twice toward the 10. Fine for a fun site; a real sign-in is the fix if it becomes a problem.
- With length limits only, anything typed goes public, including insults or links. You can delete a cockroach row in the Supabase dashboard. A word filter can be added later as one more check in `release_roach`.

**Sources**

- [Supabase pricing](https://supabase.com/pricing): free plan pauses after 1 week of inactivity, 2 active projects, anonymous sign-ins included
- [Supabase anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous): how it works, CAPTCHA recommendation
- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys): publishable key for browsers, secret key never public
