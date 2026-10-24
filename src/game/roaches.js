// The cockroaches on the floor. Each one is a row of the public `roaches` table
// plus local-only state. What it looks like follows from the row and the clock:
//   walk  – alive; crawls in from the nearest edge after a release or respawn
//   splat – smashed and waiting to respawn (or, for the winner, finished)
//   dying – finished by someone else, or self-destructed: flips over and fades
// Movement is shared (movement.js); flinching from the sandal is local only.
// Everything is drawn from cached sprites so 150 stay at 60 fps.

import { createArea, pathState, angleDiff } from './movement.js';
import {
  GAIT_FRAMES, antennaeSprite, bodySprite, shadowSprite, tintIndex, splatSprite, drawUpsideDown,
} from './roachArt.js';
import { drawSprite, blit } from './sprites.js';
import { createLabelSheet } from './labels.js';
import { hash2 } from './random.js';

const MAX_SHOWN = 150;       // above this, only the newest are drawn
const CROWDED = 60;          // above this, draw a little smaller
const CROWD_SCALE = 0.85;
const FLINCH_RADIUS = 80;    // px from the sandal
const FLEE_PUSH = 2800;      // px/s² at the sandal's centre
const FLEE_MAX = 420;        // px/s
const STRIDE = 20;           // px per gait cycle, same as movement.js
const SHADOW_DX = 4, SHADOW_DY = 5; // light from the top-left
const HIT_MARGIN = 10;       // px around the body
const TOUCH_HIT = 1.5;       // bigger hit area for fingers
const RESPAWN = 30;          // s, server rule: smash -> dead_until
const SPLAT_FADE = 1;        // s, the splat fades before the cockroach crawls back
const ENTRY_TIME = 1.6;      // s, crawling in from the nearest edge
const WIN_SPLAT_TIME = 6;    // s the winner's splat stays before fading for good
const DIE = { pale: 0.5, flip: 0.35, kick: 1, fade: 1 };
const DIE_TOTAL = DIE.pale + DIE.flip + DIE.kick + DIE.fade;
const TAU = Math.PI * 2;

export function createRoachLayer() {
  const byId = new Map();
  const labels = createLabelSheet();
  let shown = [];
  let living = 0;
  let dirty = true;
  let area = null;

  function add(row) {
    byId.set(row.id, {
      ...row,
      local: { ox: 0, oy: 0, vx: 0, vy: 0, flee: 0, fleeHeading: 0, cycles: 0, splat: null, dying: null, entry: null },
      state: { x: 0, y: 0, heading: 0, phase: 0, valid: false },
      view: 'walk',
    });
    dirty = true;
  }

  // Applies a row from the initial read or a Realtime event.
  function upsert(row, t) {
    const r = byId.get(row.id);
    if (!r) {
      if (row.status === 'alive') add(row);
      return;
    }
    const wasAlive = r.status === 'alive';
    Object.assign(r, row);
    const sp = r.local.splat;
    const mine = sp && (sp.pending || sp.won);
    if (sp && !mine && row.status === 'alive' && row.dead_until) sp.until = row.dead_until / 1000;
    if (wasAlive && row.status !== 'alive' && !mine) startDying(r, t);
    dirty = true;
  }

  function remove(id) {
    if (byId.delete(id)) dirty = true;
  }

  function startDying(r, t) {
    if (!r.state.valid && area) pathState(r, area, t, r.state);
    const from = r.local.splat || r.state;
    r.local.dying = { start: t, x: from.x, y: from.y, heading: from.heading, pale: r.status === 'exterminated' };
    r.local.splat = null;
  }

  function refresh() {
    const all = [...byId.values()];
    let alive = all.filter((r) => r.status === 'alive');
    living = alive.length;
    if (alive.length > MAX_SHOWN) alive = alive.sort((a, b) => b.created_at - a.created_at).slice(0, MAX_SHOWN);
    shown = alive.concat(all.filter((r) => r.status !== 'alive')); // finishing animations
    dirty = false;
  }

  function resize(width, height) {
    area = createArea(width, height);
    for (const r of byId.values()) r.local.entry = null;
  }

  // `sandal` is {x, y} in CSS px while a mouse sandal hovers the floor, else null.
  function update(t, dt, sandal) {
    if (!area) return;
    if (dirty) refresh();
    const gone = [];
    for (const r of shown) {
      const L = r.local;
      if (L.dying) {
        r.view = 'dying';
        if (t > L.dying.start + DIE_TOTAL) { r.view = 'gone'; gone.push(r.id); }
        continue;
      }
      if (L.splat) {
        const sp = L.splat;
        if (sp.until === null || t < sp.until + SPLAT_FADE) { r.view = 'splat'; continue; }
        L.splat = null;
      }
      if (r.status !== 'alive') { r.view = 'gone'; gone.push(r.id); continue; }

      // Smashed by someone else: everyone puts the splat where the shared path was at smash time.
      const dead = r.dead_until ? r.dead_until / 1000 : 0;
      if (t < dead + SPLAT_FADE) {
        const at = pathState(r, area, dead - RESPAWN, {});
        L.splat = { x: at.x, y: at.y, heading: at.heading, until: dead, seed: hash2(r.seed, r.smash_count), sprite: null };
        r.view = 'splat';
        continue;
      }

      const s = pathState(r, area, t, r.state);
      const entering = enter(r, s, t);
      flinch(r, s, sandal, dt, !entering);
      s.valid = true;
      r.view = 'walk';
    }
    for (const id of gone) remove(id);
  }

  // Crawling in from the nearest edge after a release or a respawn. Returns true while entering.
  function enter(r, s, t) {
    const start = Math.max(r.created_at / 1000, r.dead_until ? r.dead_until / 1000 + SPLAT_FADE : 0);
    if (t >= start + ENTRY_TIME) return false;
    const L = r.local;
    if (!L.entry || L.entry.start !== start) {
      const end = pathState(r, area, start + ENTRY_TIME, {});
      const edge = edgePoint(area, end);
      L.entry = { start, x: edge.x, y: edge.y, dist: Math.hypot(end.x - edge.x, end.y - edge.y) };
    }
    const f = Math.max(0, (t - start) / ENTRY_TIME);
    const e = 1 - (1 - f) * (1 - f);
    const x = L.entry.x + (s.x - L.entry.x) * e, y = L.entry.y + (s.y - L.entry.y) * e;
    const toward = Math.atan2(s.y - y, s.x - x);
    const w = f < 0.75 ? 0 : smoothstep((f - 0.75) / 0.25);
    s.heading = toward + angleDiff(toward, s.heading) * w;
    s.phase += ((e * L.entry.dist) / (STRIDE * (r.size || 1))) * TAU;
    s.x = x; s.y = y;
    return true;
  }

  function flinch(r, s, sandal, dt, keepOnScreen) {
    const L = r.local;
    const size = r.size || 1;
    if (sandal) {
      const dx = s.x + L.ox - sandal.x, dy = s.y + L.oy - sandal.y;
      const d = Math.hypot(dx, dy);
      if (d < FLINCH_RADIUS) {
        const push = (1 - d / FLINCH_RADIUS) * FLEE_PUSH * dt;
        const a = d > 0.5 ? Math.atan2(dy, dx) : s.heading;
        L.vx += Math.cos(a) * push;
        L.vy += Math.sin(a) * push;
      }
    }
    const v = Math.hypot(L.vx, L.vy);
    if (v > FLEE_MAX) { L.vx *= FLEE_MAX / v; L.vy *= FLEE_MAX / v; }

    // Flee, then slowly drift back onto the shared path.
    const back = 1 - Math.exp(-0.5 * dt);
    const mx = L.vx * dt - L.ox * back, my = L.vy * dt - L.oy * back;
    L.ox += mx; L.oy += my;
    const friction = Math.exp(-5 * dt);
    L.vx *= friction; L.vy *= friction;

    let x = s.x + L.ox, y = s.y + L.oy;
    if (keepOnScreen) {
      x = Math.max(12, Math.min(area.width - 12, x));
      y = Math.max(12, Math.min(area.height - 12, y));
      L.ox = x - s.x; L.oy = y - s.y;
    }
    s.x = x; s.y = y;

    // Face the escape direction while fleeing; legs follow the extra distance,
    // then finish their step so they rest in the same pose as everyone else's.
    const fast = Math.hypot(L.vx, L.vy) > 60;
    if (fast) L.fleeHeading = Math.atan2(L.vy, L.vx);
    L.flee = fast ? Math.min(1, L.flee + dt * 10) : Math.max(0, L.flee - dt * 2.5);
    const moved = Math.hypot(mx, my);
    if (moved > 0.05) L.cycles += moved / (STRIDE * size);
    else if (L.cycles !== Math.floor(L.cycles)) {
      const next = Math.ceil(L.cycles);
      L.cycles = L.cycles + dt * 2 >= next ? next : L.cycles + dt * 2;
    }
    if (L.flee > 0) s.heading += angleDiff(s.heading, L.fleeHeading) * L.flee;
    s.phase += (L.cycles % 1) * TAU;
  }

  const crowdScale = () => (living > CROWDED ? CROWD_SCALE : 1);

  // The walking cockroach under (x, y), or null. Hit area: body plus a margin.
  function hitTest(x, y, touch) {
    const crowd = crowdScale(), grow = touch ? TOUCH_HIT : 1;
    let best = null, bestD = 1;
    for (const r of shown) {
      if (r.view !== 'walk') continue;
      const s = r.state, k = (r.size || 1) * crowd;
      const dx = x - s.x, dy = y - s.y;
      const cos = Math.cos(s.heading), sin = Math.sin(s.heading);
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      const rx = (36 * k + HIT_MARGIN) * grow, ry = (16 * k + HIT_MARGIN) * grow;
      const d = ((lx + 6 * k) / rx) ** 2 + (ly / ry) ** 2;
      if (d <= bestD) { bestD = d; best = r; }
    }
    return best;
  }

  // Optimistic splat right where the cockroach was hit, before the server answers.
  function squash(r) {
    const s = r.state;
    r.local.splat = { x: s.x, y: s.y, heading: s.heading, until: null, pending: true, won: false, seed: hash2(r.seed, Date.now() | 0), sprite: null };
    r.local.vx = r.local.vy = 0;
    r.view = 'splat';
    return r.local.splat;
  }

  function confirmSmash(r, result, t) {
    const sp = r.local.splat;
    if (!sp) return;
    sp.pending = false;
    if (result.final) {
      sp.won = true;
      sp.until = t + WIN_SPLAT_TIME;
      r.status = 'exterminated'; // in case the Realtime event is late
    } else {
      const dead = r.dead_until ? r.dead_until / 1000 : 0;
      sp.until = dead > t ? dead : t + RESPAWN; // the Realtime event will correct it
    }
    dirty = true;
  }

  // The server refused: drop the optimistic splat and show whatever the row says.
  function cancelSmash(r, t) {
    r.local.splat = null;
    if (r.status !== 'alive' && !r.local.dying) startDying(r, t);
    dirty = true;
  }

  // The respawning splat nearest to (x, y), for the "Back in 12 s" hover.
  function splatNear(x, y) {
    let best = null, bestD = 45;
    for (const r of shown) {
      const sp = r.local.splat;
      if (r.view !== 'splat' || !sp || sp.pending || sp.won) continue;
      const d = Math.hypot(sp.x - x, sp.y - y);
      if (d < bestD) { bestD = d; best = sp; }
    }
    return best;
  }

  function draw(ctx, dpr, t, pointer) {
    const crowd = crowdScale();
    const n = shown.length;

    // Splats lie flat on the floor, under everything else.
    for (let i = 0; i < n; i++) {
      const r = shown[i];
      if (r.view !== 'splat') continue;
      const sp = r.local.splat;
      sp.sprite ||= splatSprite(sp.seed, r.tint || 0, dpr);
      ctx.globalAlpha = sp.until === null || t < sp.until ? 1 : Math.max(0, 1 - (t - sp.until) / SPLAT_FADE);
      drawSprite(ctx, sp.sprite, sp.x, sp.y, sp.heading, (r.size || 1) * crowd, dpr);
    }
    ctx.globalAlpha = 1;

    // All shadows first, so no shadow falls on another roach. Antennae cast none:
    // a translucent stroke over hundreds of curves costs ~20 fps at 150 roaches.
    for (let i = 0; i < n; i++) {
      const r = shown[i];
      if (r.view !== 'walk') continue;
      const s = r.state, k = (r.size || 1) * crowd;
      drawSprite(ctx, shadowSprite(frameOf(s.phase), dpr), s.x + SHADOW_DX * k, s.y + SHADOW_DY * k, s.heading, k, dpr);
    }
    for (let i = 0; i < n; i++) {
      const r = shown[i];
      if (r.view !== 'walk') continue;
      const s = r.state;
      drawSprite(ctx, bodySprite(tintIndex(r.tint || 0), frameOf(s.phase), dpr), s.x, s.y, s.heading, (r.size || 1) * crowd, dpr);
    }

    for (let i = 0; i < n; i++) if (shown[i].view === 'walk') drawAntennae(ctx, shown[i], crowd, t, dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const r = shown[i];
      if (r.view !== 'walk') continue;
      labels.draw(ctx, r, r.state.x, r.state.y + 34 * (r.size || 1) * crowd, dpr);
    }

    for (let i = 0; i < n; i++) if (shown[i].view === 'dying') drawDying(ctx, shown[i], t, dpr, crowd);
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (pointer) {
      const sp = splatNear(pointer.x, pointer.y);
      if (sp && sp.until > t) drawPill(ctx, `Back in ${Math.ceil(sp.until - t)} s`, sp.x, sp.y - 48);
    }
  }

  return {
    setRows(rows, t) { for (const row of rows) upsert(row, t); },
    upsert, remove, resize, update, draw, hitTest, squash, confirmSmash, cancelSmash,
    get: (id) => byId.get(id),
    all: () => [...byId.values()],
    // Living cockroaches released by `userId`, oldest first.
    ownedBy: (userId) => [...byId.values()]
      .filter((r) => r.owner_id === userId && r.status === 'alive')
      .sort((a, b) => a.created_at - b.created_at),
    get count() { if (dirty) refresh(); return living; },
  };
}

function smoothstep(x) {
  return x * x * (3 - 2 * x);
}

// Just outside the screen edge nearest to point p.
function edgePoint(area, p) {
  const OUT = 50;
  const d = [p.x, area.width - p.x, p.y, area.height - p.y];
  const i = d.indexOf(Math.min(...d));
  if (i === 0) return { x: -OUT, y: p.y };
  if (i === 1) return { x: area.width + OUT, y: p.y };
  if (i === 2) return { x: p.x, y: -OUT };
  return { x: p.x, y: area.height + OUT };
}

// Turns pale (final kill only), flips onto its back, kicks, fades.
function drawDying(ctx, r, t, dpr, crowd) {
  const d = r.local.dying, e = t - d.start, k = (r.size || 1) * crowd;
  const paleTime = d.pale ? DIE.pale : 0;
  const fadeStart = paleTime + DIE.flip + DIE.kick;
  const alpha = Math.max(0, Math.min(1, 1 - (e - fadeStart) / DIE.fade));
  const cos = Math.cos(d.heading) * k * dpr, sin = Math.sin(d.heading) * k * dpr;
  const tint = r.tint || 0;
  const flip = e < paleTime ? 0 : Math.min(1, (e - paleTime) / DIE.flip);
  const sy = Math.cos(Math.PI * flip); // 1 = right way up, -1 = on its back
  const ay = Math.max(0.05, Math.abs(sy));
  ctx.setTransform(cos, sin, -sin * ay, cos * ay, d.x * dpr, d.y * dpr);
  ctx.globalAlpha = alpha;
  if (sy > 0) {
    blit(ctx, bodySprite(tintIndex(tint), 0, dpr));
    if (d.pale) {
      ctx.globalAlpha = alpha * Math.min(1, e / DIE.pale);
      blit(ctx, bodySprite('pale', 0, dpr));
    }
  } else {
    const kick = 1 - Math.max(0, Math.min(1, (e - paleTime - DIE.flip) / (DIE.kick + DIE.fade)));
    drawUpsideDown(ctx, t, kick, d.pale, tint);
  }
}

function drawPill(ctx, text, x, y) {
  ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
  const w = ctx.measureText(text).width + 18, h = 24;
  ctx.fillStyle = 'rgba(25,15,8,.82)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

function frameOf(phase) {
  const f = Math.round((phase / TAU) * GAIT_FRAMES) % GAIT_FRAMES;
  return f < 0 ? f + GAIT_FRAMES : f;
}

// Stamps both twitching antennae of `r` in one go.
function drawAntennae(ctx, r, crowd, t, dpr) {
  const s = r.state;
  const tt = t + (r.seed % 1000) * 0.37; // each roach twitches on its own rhythm
  drawSprite(ctx, antennaeSprite(tt, dpr), s.x, s.y, s.heading, (r.size || 1) * crowd, dpr);
}
