// Cockroach movement as a pure function of (seed, time, viewport size).
// No state and no history: any browser computing pathState() for the same
// seed and server time gets the same position, heading and gait phase.
//
// Time is cut into fixed segments. Segment k starts resting at waypoint k,
// twitches, turns, darts (sometimes in two hops with a stop) to waypoint k+1
// and rests there. Waypoints are absolute (seed + k), scattered around a
// "home" point that drifts slowly, so darts stay short and local.

import { mulberry32, hash2 } from './random.js';

const SEGMENT = 3.5;      // seconds per segment
const STRIDE = 20;        // px walked per full gait cycle at size 1
const EDGE = 56;          // keep waypoints this far from the window edges
const CORNER_W = 300;     // top corners hold the buttons
const CORNER_H = 96;
const TAU = Math.PI * 2;

export function createArea(width, height) {
  return {
    width, height,
    reach: Math.min(width, height) * 0.16 + 40,                   // waypoint scatter radius
    speed: Math.max(0.6, Math.min(1.2, Math.min(width, height) / 800)),
  };
}

// Per-roach constants, computed once from the seed.
function traits(roach) {
  if (roach._traits) return roach._traits;
  const r = mulberry32(roach.seed);
  roach._traits = {
    offset: r() * SEGMENT * 100,                                 // desyncs roaches
    fx: [0.004 + r() * 0.01, 0.011 + r() * 0.02], px: [r() * TAU, r() * TAU],
    fy: [0.004 + r() * 0.01, 0.011 + r() * 0.02], py: [r() * TAU, r() * TAU],
    twitch: r() * TAU,
  };
  return roach._traits;
}

function clampToFloor(area, x, y) {
  const { width: w, height: h } = area;
  x = Math.max(EDGE, Math.min(w - EDGE, x));
  y = Math.max(EDGE, Math.min(h - EDGE, y));
  const cornerW = Math.min(CORNER_W, w / 2);
  if (y < CORNER_H + EDGE / 2 && (x < cornerW || x > w - cornerW)) y = CORNER_H + EDGE / 2;
  return { x, y };
}

function waypoint(roach, area, k) {
  const tr = traits(roach);
  const T = k * SEGMENT;
  const hx = 0.5 + 0.3 * Math.sin(T * tr.fx[0] + tr.px[0]) + 0.15 * Math.sin(T * tr.fx[1] + tr.px[1]);
  const hy = 0.5 + 0.3 * Math.sin(T * tr.fy[0] + tr.py[0]) + 0.15 * Math.sin(T * tr.fy[1] + tr.py[1]);
  const r = mulberry32(hash2(roach.seed, k));
  const ang = r() * TAU, rad = Math.sqrt(r()) * area.reach;
  return clampToFloor(area, hx * area.width + Math.cos(ang) * rad, hy * area.height + Math.sin(ang) * rad);
}

// The points walked during segment k: waypoint k, an optional stop, waypoint k+1.
function hops(roach, area, k) {
  const a = waypoint(roach, area, k), b = waypoint(roach, area, k + 1);
  const r = mulberry32(hash2(roach.seed, k) ^ 0x51ed27);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (r() < 0.4 && d > 120) {
    const f = 0.35 + r() * 0.3, side = (r() - 0.5) * 0.7;
    const mx = a.x + (b.x - a.x) * f - (b.y - a.y) * side;
    const my = a.y + (b.y - a.y) * f + (b.x - a.x) * side;
    return { pts: [a, clampToFloor(area, mx, my), b], r };
  }
  return { pts: [a, b], r };
}

function headingOf(p, q) {
  return Math.atan2(q.y - p.y, q.x - p.x);
}

// Signed shortest turn from angle a to angle b, in [-π, π).
export function angleDiff(a, b) {
  const d = (b - a + Math.PI) % TAU;
  return (d < 0 ? d + TAU : d) - Math.PI;
}

const MIN_HOP = 2; // px; shorter hops are skipped

// Heading a roach rests with at the start of segment k: the direction of the
// last hop it actually walked (looking back past segments where it stayed put).
function arrivalHeading(roach, area, k) {
  for (let j = k - 1; j > k - 40; j--) {
    const { pts } = hops(roach, area, j);
    for (let i = pts.length - 1; i > 0; i--) {
      const p = pts[i - 1], q = pts[i];
      if (Math.hypot(q.x - p.x, q.y - p.y) >= MIN_HOP) return headingOf(p, q);
    }
  }
  return mulberry32(roach.seed ^ 0x2c1b)() * TAU;
}

// Builds the timeline of segment k: rest, then per hop a turn and a dart, with a pause between hops.
function plan(roach, area, k) {
  const { pts, r } = hops(roach, area, k);
  const size = roach.size || 1;
  const steps = [];
  const h0 = arrivalHeading(roach, area, k);
  let heading = h0;
  let rest = 0.2 + r() * 1.3;
  const speed = (150 + r() * 230) * area.speed;

  let fixed = 0, moving = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < MIN_HOP) continue;
    const h = heading + angleDiff(heading, headingOf(p, q));
    const turn = Math.min(0.4, 0.08 + Math.abs(h - heading) * 0.12);
    const pause = i < pts.length - 2 ? 0.15 + r() * 0.5 : 0;
    steps.push(
      { kind: 'turn', dur: turn, p, h0: heading, h1: h, cycles: Math.round(Math.abs(h - heading) / 1.4) },
      { kind: 'move', dur: len / speed, p, q, h0: h, h1: h, cycles: Math.max(1, Math.round(len / (STRIDE * size))) },
    );
    if (pause) steps.push({ kind: 'rest', dur: pause, p: q, h0: h, h1: h, cycles: 0 });
    fixed += turn + pause; moving += len / speed;
    heading = h;
  }

  // Everything must fit in the segment: shorten the first rest, then speed up the darts.
  const budget = SEGMENT * 0.94 - fixed;
  if (rest + moving > budget) rest = Math.max(0.15, budget - moving);
  const squeeze = moving > budget - rest ? (budget - rest) / moving : 1;
  for (const s of steps) if (s.kind === 'move') s.dur *= squeeze;

  let t = rest;
  for (const s of steps) { s.t0 = t; t += s.dur; }
  return { start: pts[0], h0, steps };
}

// Dart easing: starts and stops quickly, peaks at twice the average speed.
function dart(x) {
  return x - Math.sin(TAU * x) / TAU;
}

// Small, intermittent head-twitches while standing still.
function twitch(tr, t) {
  return 0.07 * Math.sin(t * 13 + tr.twitch) * Math.max(0, Math.sin(t * 1.7 + tr.twitch * 2));
}

// Position, heading and gait phase of `roach` at time `t` (seconds) on `area`.
// The returned phase is always a multiple of 2π while standing still, so the
// legs never snap between segments.
export function pathState(roach, area, t, out = {}) {
  const tr = traits(roach);
  const u = t + tr.offset;
  const k = Math.floor(u / SEGMENT);
  const s = u - k * SEGMENT;

  let cache = roach._plan;
  if (!cache || cache.k !== k || cache.area !== area) {
    cache = roach._plan = { k, area, plan: plan(roach, area, k) };
  }
  const p = cache.plan;

  out.x = p.start.x; out.y = p.start.y; out.heading = p.h0; out.phase = 0; out.moving = false;
  // Twitching fades out just before and after any motion so the heading never snaps.
  let lastMotionEnd = -Infinity, nextMotionStart = Infinity, inMotion = false;
  for (const step of p.steps) {
    const motion = step.kind !== 'rest';
    if (s < step.t0) {
      if (motion) { nextMotionStart = step.t0; break; }
      continue;
    }
    const f = Math.min(1, (s - step.t0) / step.dur);
    if (step.kind === 'move') {
      const e = dart(f);
      out.x = step.p.x + (step.q.x - step.p.x) * e;
      out.y = step.p.y + (step.q.y - step.p.y) * e;
      out.phase = step.cycles * TAU * e;
      out.moving = f < 1;
    } else {
      out.x = step.p.x; out.y = step.p.y;
      out.phase = step.cycles * TAU * f;
    }
    out.heading = step.h0 + (step.h1 - step.h0) * (step.kind === 'turn' ? f * f * (3 - 2 * f) : 1);
    if (motion) {
      if (f < 1) inMotion = true;
      else { inMotion = false; lastMotionEnd = step.t0 + step.dur; }
    }
  }
  if (!inMotion) {
    const amp = Math.min(1, (s - lastMotionEnd) / 0.3, (nextMotionStart - s) / 0.3);
    out.heading += twitch(tr, t) * amp;
  }
  return out;
}
