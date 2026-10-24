// Realistic top-down cockroach, adapted from the reference code in PLAN.md.
// Art units: about 72 units from cerci to head, facing +x. Antennae are drawn
// live by roaches.js (they twitch every frame); everything else is cached per
// gait phase and tint level.

import { makeSprite, renderSprite, makeShadow, packAtlas } from './sprites.js';
import { mulberry32 } from './random.js';

export const GAIT_FRAMES = 12;
export const TINT_LEVELS = [-1, -0.5, 0, 0.5, 1];
export const BODY_BOX = { x: -48, y: -42, w: 100, h: 84 };
export const MAX_SIZE = 1.15; // largest per-roach size, so sprites never upscale

const BASE = {
  leg: [42, 20, 9],
  shell: [[184, 105, 47], [110, 49, 18], [58, 23, 10]],
  wing: [125, 58, 22],
  rim: [212, 173, 115],
  pronotum: [74, 32, 12],
  head: [58, 26, 10],
};

// tint -1 = darker and redder, +1 = lighter and more amber.
function tinted([r, g, b], tint, alpha = 1) {
  const k = 1 + 0.16 * tint;
  const ch = (v, extra) => Math.max(0, Math.min(255, Math.round(v * k * extra)));
  return `rgba(${ch(r, 1)},${ch(g, 1 + 0.05 * tint)},${ch(b, 1 - 0.04 * tint)},${alpha})`;
}

// Washed-out colours for a cockroach that has been finished for good.
const paled = ([r, g, b]) => [r + (226 - r) * 0.6, g + (212 - g) * 0.6, b + (190 - b) * 0.6];

function palette(tint, pale = false) {
  const col = (rgb, alpha) => (pale ? tinted(paled(rgb), 0, alpha) : tinted(rgb, tint, alpha));
  return {
    leg: col(BASE.leg),
    shell: BASE.shell.map((c) => col(c)),
    wing: col(BASE.wing, 0.55),
    rim: col(BASE.rim),
    pronotum: col(BASE.pronotum),
    head: col(BASE.head),
    belly: pale ? ['#ece2cf', '#cdbb9b'] : [tinted([168, 104, 52], tint), tinted([104, 52, 22], tint)],
  };
}

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

function drawBody(c, phase, p) {
  c.lineCap = 'round';
  c.strokeStyle = p.leg;
  forEachLeg(phase, (r, k, f) => {
    c.lineWidth = 1.8; c.beginPath(); c.moveTo(...r); c.lineTo(...k); c.lineTo(...f); c.stroke();
    c.lineWidth = 1;
    for (let j = 1; j < 4; j++) { // leg spines
      const px = k[0] + (f[0] - k[0]) * j / 4, py = k[1] + (f[1] - k[1]) * j / 4;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (f[1] - k[1]) * 0.12, py - (f[0] - k[0]) * 0.12); c.stroke();
    }
  });
  c.beginPath(); c.moveTo(-32, -4); c.lineTo(-42, -8); c.moveTo(-32, 4); c.lineTo(-42, 8); c.stroke(); // cerci
  const g = c.createRadialGradient(-12, -6, 2, -8, 0, 28);
  g.addColorStop(0, p.shell[0]); g.addColorStop(0.6, p.shell[1]); g.addColorStop(1, p.shell[2]);
  ellipse(c, -8, 0, 25, 15); c.fillStyle = g; c.fill();
  for (const s of [-1, 1]) { // wings with veins
    c.beginPath(); c.ellipse(-10, s * 3.5, 22, 9, s * 0.08, 0, Math.PI * 2);
    c.fillStyle = p.wing; c.fill();
    c.strokeStyle = 'rgba(30,10,0,.5)'; c.lineWidth = 0.6; c.stroke();
    for (let v = 0; v < 3; v++) { c.beginPath(); c.moveTo(8, s * (2 + v * 2)); c.lineTo(-28, s * (3 + v * 3)); c.stroke(); }
  }
  ellipse(c, 15, 0, 9, 12); c.fillStyle = p.rim; c.fill(); // pronotum rim
  ellipse(c, 15, 0, 6, 8); c.fillStyle = p.pronotum; c.fill();
  ellipse(c, 25, 0, 5, 6); c.fillStyle = p.head; c.fill(); // head
  ellipse(c, -13, -6, 9, 2.5); c.fillStyle = 'rgba(255,240,220,.45)'; c.fill(); // glints
  ellipse(c, 14, -4, 3, 1.5); c.fill();
}

// Antennae twitch all the time, left and right out of step. The twitch is a
// seamless loop of ANTENNA_FRAMES pre-drawn pairs, so both antennae cost one
// stamp per cockroach (draw calls, not pixels, limit phones).
const ANTENNA_FRAMES = 32;
const ANTENNA_LOOP = 2.2; // seconds
const ANTENNA_BOX = { x: 28, y: -46, w: 76, h: 92 };

// Spread of the left and right antenna from straight ahead (radians) at loop position u in [0, 1).
function antennaSpreads(u) {
  const a = Math.PI * 2 * u;
  return [
    0.35 + 0.12 * Math.sin(2 * a) + 0.08 * Math.sin(a + 1),
    0.35 + 0.12 * Math.sin(2 * a + 1.3) + 0.08 * Math.sin(3 * a + 0.4),
  ];
}

function drawAntennae(c, u) {
  c.lineCap = 'round'; c.lineWidth = 1; c.strokeStyle = tinted(BASE.leg, 0);
  const spreads = antennaSpreads(u);
  for (const [i, side] of [[0, -1], [1, 1]]) {
    const a = spreads[i];
    c.beginPath(); c.moveTo(31, side * 3);
    c.quadraticCurveTo(31 + 35 * Math.cos(a * 0.4), side * (3 + 35 * Math.sin(a * 0.4)), 31 + 70 * Math.cos(a), side * (3 + 70 * Math.sin(a)));
    c.stroke();
  }
}

// Every gait frame of every tint (plus the pale variant) and the antennae on one
// sheet, and the shadows on another, so each drawing pass is one GPU batch.
// Rebuilt when the pixel density changes. Resolution stops at 2x: on a 3x phone
// the difference is invisible at this size and the sheet stays well inside
// mobile canvas memory limits.
let atlas = null; // { dpr, bodies: Map(tint index | 'pale' -> frames), antennae, shadows }

function atlasFor(dpr) {
  if (atlas && atlas.dpr === dpr) return atlas;
  const res = Math.min(dpr, 2) * MAX_SIZE;
  const keys = [...TINT_LEVELS.keys(), 'pale'];
  const raw = [];
  for (const key of keys) {
    const p = key === 'pale' ? palette(0, true) : palette(TINT_LEVELS[key]);
    for (let f = 0; f < GAIT_FRAMES; f++) {
      raw.push(renderSprite(BODY_BOX, res, (c) => drawBody(c, (f / GAIT_FRAMES) * Math.PI * 2, p)));
    }
  }
  for (let f = 0; f < ANTENNA_FRAMES; f++) {
    raw.push(renderSprite(ANTENNA_BOX, res, (c) => drawAntennae(c, f / ANTENNA_FRAMES)));
  }
  const packed = packAtlas(raw);
  const bodies = new Map(keys.map((key, i) => [key, packed.slice(i * GAIT_FRAMES, (i + 1) * GAIT_FRAMES)]));
  const antennae = packed.slice(keys.length * GAIT_FRAMES);
  const middle = TINT_LEVELS.indexOf(0) * GAIT_FRAMES;
  const shadows = packAtlas(raw.slice(middle, middle + GAIT_FRAMES).map((s) => makeShadow(s, res / 2, 4, 0.45)));
  atlas = { dpr, bodies, antennae, shadows };
  return atlas;
}

// Both antennae at time t (seconds) in the twitch loop.
export function antennaeSprite(t, dpr) {
  const u = t / ANTENNA_LOOP - Math.floor(t / ANTENNA_LOOP);
  return atlasFor(dpr).antennae[Math.floor(u * ANTENNA_FRAMES) % ANTENNA_FRAMES];
}

// `tintIndex` indexes TINT_LEVELS, or is 'pale' for a finished cockroach.
export function bodySprite(tintIndex, frame, dpr) {
  return atlasFor(dpr).bodies.get(tintIndex)[frame];
}

export function shadowSprite(frame, dpr) {
  return atlasFor(dpr).shadows[frame];
}

export function tintIndex(tint) {
  const i = Math.round((tint + 1) * 2);
  return Math.max(0, Math.min(TINT_LEVELS.length - 1, i));
}

// ---------------------------------------------------------------------------
// Splat: a flattened cockroach, legs splayed, in a brown-yellow stain with drips
// and specks. One sprite per smash (each splat looks a little different).

const SPLAT_BOX = { x: -78, y: -78, w: 156, h: 156 };

export function splatSprite(seed, tint, dpr) {
  return makeSprite(SPLAT_BOX, Math.min(dpr, 2.5), (c) => drawSplat(c, seed, tint));
}

function drawSplat(c, seed, tint) {
  const r = mulberry32(seed);
  const p = palette(tint);

  // Stain: many overlapping blobs filled as one shape, so the colour stays even.
  const stain = (count, spread, minR, maxR, color) => {
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread, rad = minR + r() * (maxR - minR);
      const x = Math.cos(a) * d - 6, y = Math.sin(a) * d;
      c.moveTo(x + rad, y); c.arc(x, y, rad, 0, Math.PI * 2);
    }
    c.fillStyle = color; c.fill();
  };
  // Drips: tapering streaks thrown outward.
  c.beginPath();
  for (let i = 0; i < 6 + Math.floor(r() * 4); i++) {
    const a = r() * Math.PI * 2, len = 34 + r() * 30;
    for (let j = 0; j <= 30; j++) { // close enough to blend into a smooth streak
      const f = j / 30, d = 14 + f * len, rad = 5.5 * (1 - f) + 1;
      const x = Math.cos(a) * d - 6, y = Math.sin(a) * d;
      c.moveTo(x + rad, y); c.arc(x, y, rad, 0, Math.PI * 2);
    }
  }
  c.fillStyle = 'rgba(158,124,44,.55)'; c.fill();
  stain(16, 24, 8, 17, 'rgba(165,130,48,.62)');
  stain(10, 14, 6, 12, 'rgba(112,78,26,.5)');
  // Specks.
  c.fillStyle = 'rgba(110,78,24,.75)';
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = 36 + r() * 36, rad = 0.7 + r() * 2;
    c.beginPath(); c.arc(Math.cos(a) * d - 6, Math.sin(a) * d, rad, 0, Math.PI * 2); c.fill();
  }
  // Wet shine.
  c.fillStyle = 'rgba(255,245,210,.22)';
  for (let i = 0; i < 4; i++) { ellipse(c, -20 + r() * 26, -14 + r() * 10, 3 + r() * 4, 1.5 + r() * 1.5); c.fill(); }

  // Flattened body: legs splayed out straight, shell wide and cracked.
  c.lineCap = 'round'; c.strokeStyle = p.leg;
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const root = [[18, 10, 2][i], side * 9];
    const a = side * ([0.55, 1.5, 2.45][i] + (r() - 0.5) * 0.5);
    const len1 = 14 + r() * 4, len2 = 16 + r() * 8, bend = (r() - 0.5) * 0.9;
    const kx = root[0] + Math.cos(a) * len1, ky = root[1] + Math.sin(a) * len1;
    c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(...root); c.lineTo(kx, ky); c.lineTo(kx + Math.cos(a + bend) * len2, ky + Math.sin(a + bend) * len2); c.stroke();
  }
  c.lineWidth = 1;
  for (const s of [-1, 1]) { // bent, broken antennae
    const a = s * (0.5 + r() * 0.6);
    c.beginPath(); c.moveTo(31, s * 3);
    c.lineTo(31 + Math.cos(a) * 22, s * 3 + Math.sin(a) * 22);
    c.lineTo(31 + Math.cos(a) * 22 + Math.cos(a + s * (0.6 + r())) * 26, s * 3 + Math.sin(a) * 22 + Math.sin(a + s * (0.6 + r())) * 26);
    c.stroke();
  }
  const g = c.createRadialGradient(-12, -6, 2, -8, 0, 30);
  g.addColorStop(0, p.shell[1]); g.addColorStop(1, p.shell[2]);
  ellipse(c, -8, 0, 28, 19); c.fillStyle = g; c.fill();
  for (const s of [-1, 1]) { // wings knocked askew
    c.beginPath(); c.ellipse(-12 + r() * 4, s * (6 + r() * 4), 22, 10, s * (0.2 + r() * 0.3), 0, Math.PI * 2);
    c.fillStyle = p.wing; c.fill();
  }
  c.strokeStyle = 'rgba(20,8,0,.6)'; c.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) { // cracks
    let x = -8 + (r() - 0.5) * 20, y = (r() - 0.5) * 16;
    c.beginPath(); c.moveTo(x, y);
    for (let j = 0; j < 3; j++) { x += (r() - 0.5) * 14; y += (r() - 0.5) * 10; c.lineTo(x, y); }
    c.stroke();
  }
  ellipse(c, 16, 0, 11, 13); c.fillStyle = p.rim; c.fill();
  ellipse(c, 16, 0, 7.5, 9); c.fillStyle = p.pronotum; c.fill();
  ellipse(c, 27, (r() - 0.5) * 4, 5.5, 6.5); c.fillStyle = p.head; c.fill();
  c.fillStyle = 'rgba(200,170,90,.55)'; // squeezed-out insides
  for (let i = 0; i < 3; i++) { ellipse(c, -34 + r() * 8, (r() - 0.5) * 12, 3 + r() * 3, 2 + r() * 2); c.fill(); }
}

// ---------------------------------------------------------------------------
// Upside-down cockroach for the flip-and-fade animations. Drawn live (only a
// few at a time): `kick` 0..1 is how hard the legs flail, `t` drives them.

export function drawUpsideDown(c, t, kick, pale, tint) {
  const p = palette(tint, pale);
  c.fillStyle = 'rgba(0,0,0,.22)';
  ellipse(c, -4, 4, 30, 17); c.fill();
  c.lineCap = 'round'; c.strokeStyle = p.leg;
  forEachLeg(t * 26 * kick + kick * 3, (r, k, f) => {
    c.lineWidth = 1.8; c.beginPath(); c.moveTo(...r); c.lineTo(...k); c.lineTo(...f); c.stroke();
  });
  c.lineWidth = 1;
  for (const s of [-1, 1]) {
    const a = s * (0.5 + Math.sin(t * 9 + s) * 0.15 * kick);
    c.beginPath(); c.moveTo(29, s * 3);
    c.quadraticCurveTo(29 + 30 * Math.cos(a * 0.5), s * 3 + 30 * Math.sin(a * 0.5), 29 + 60 * Math.cos(a), s * 3 + 60 * Math.sin(a));
    c.stroke();
  }
  const g = c.createLinearGradient(-8, -15, -8, 15);
  g.addColorStop(0, p.belly[1]); g.addColorStop(0.5, p.belly[0]); g.addColorStop(1, p.belly[1]);
  ellipse(c, -8, 0, 24, 14); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(60,30,10,.35)'; c.lineWidth = 0.8;
  for (let x = -26; x <= 4; x += 5) { // abdomen segments
    const h = 13 * Math.sqrt(Math.max(0, 1 - ((x + 8) / 24) ** 2));
    c.beginPath(); c.moveTo(x, -h); c.quadraticCurveTo(x + 3, 0, x, h); c.stroke();
  }
  ellipse(c, 14, 0, 8, 10); c.fillStyle = p.belly[1]; c.fill();
  ellipse(c, 24, 0, 5, 5.5); c.fillStyle = p.head; c.fill();
}
