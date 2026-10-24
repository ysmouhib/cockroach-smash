// The sandals (and one bare foot), seen from above and drawn in code. Art units: about 90 long,
// toe pointing up (-y), centred on the middle of the sole (the click point).

import { makeSprite, makeShadow, freeze } from './sprites.js';
import { mulberry32 } from './random.js';

export const SANDALS = [
  { id: 'flipflop', label: 'Flip-flop', draw: drawFlipFlop },
  { id: 'slipper', label: 'House slipper', draw: drawSlipper },
  { id: 'clog', label: 'Wooden clog', draw: drawClog },
  { id: 'sport', label: 'Sport sandal', draw: drawSport },
  { id: 'foot', label: 'Bare foot (eww)', draw: drawBareFoot },
];
export const DEFAULT_SANDAL = 'flipflop';

const H = 45; // half length
const W = 34; // overall width

// A right-foot sole outline: wide forefoot, narrow arch, rounded heel.
function solePath(c, inset = 1) {
  c.save();
  c.scale(inset, inset);
  c.beginPath();
  c.moveTo(-2, -H);
  c.bezierCurveTo(W * 0.5, -H, W * 0.6, -H * 0.5, W * 0.52, -H * 0.15);
  c.bezierCurveTo(W * 0.44, H * 0.12, W * 0.3, H * 0.28, W * 0.36, H * 0.55);
  c.bezierCurveTo(W * 0.42, H * 1.08, -W * 0.42, H * 1.08, -W * 0.38, H * 0.55);
  c.bezierCurveTo(-W * 0.36, H * 0.25, -W * 0.48, H * 0.05, -W * 0.5, -H * 0.25);
  c.bezierCurveTo(-W * 0.54, -H * 0.62, -W * 0.38, -H, -2, -H);
  c.closePath();
  c.restore();
}

// Light from the top-left: a soft highlight over whatever was just filled.
function sheen(c, alpha = 0.25) {
  const g = c.createLinearGradient(-W / 2, -H, W / 2, H);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${alpha * 0.6})`);
  c.fillStyle = g;
  c.fill();
}

function drawFlipFlop(c) {
  solePath(c);
  c.fillStyle = '#137a72'; c.fill();
  c.strokeStyle = '#0b524d'; c.lineWidth = 1.5; c.stroke();
  // Footbed: lighter top layer with a faint toe and heel imprint.
  solePath(c, 0.9);
  c.fillStyle = '#25a89d'; c.fill();
  sheen(c, 0.3);
  c.fillStyle = 'rgba(8,70,66,.18)';
  c.beginPath(); c.ellipse(1, -H * 0.55, 10, 12, 0.1, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(-1, H * 0.62, 8, 10, 0, 0, Math.PI * 2); c.fill();
  // Y-shaped strap from the toe post to both sides.
  const post = [-3, -H * 0.5];
  c.lineCap = 'round';
  for (const [w, color] of [[6.5, '#0a4a46'], [4.5, '#0f6b65']]) {
    c.lineWidth = w; c.strokeStyle = color;
    c.beginPath();
    c.moveTo(-W * 0.45, H * 0.08); c.quadraticCurveTo(-W * 0.32, -H * 0.38, ...post);
    c.quadraticCurveTo(W * 0.34, -H * 0.36, W * 0.47, H * 0.04);
    c.stroke();
  }
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.35)';
  c.beginPath(); c.moveTo(-W * 0.42, H * 0.02); c.quadraticCurveTo(-W * 0.31, -H * 0.38, post[0] - 1, post[1] - 1); c.stroke();
  c.fillStyle = '#083f3c';
  c.beginPath(); c.arc(...post, 3.2, 0, Math.PI * 2); c.fill();
}

function drawSlipper(c) {
  // Soft fabric sole edge.
  solePath(c);
  c.fillStyle = '#b9ad98'; c.fill();
  c.strokeStyle = '#8c806c'; c.lineWidth = 1.2; c.stroke();
  // Visible lining inside the heel opening.
  solePath(c, 0.86);
  c.fillStyle = '#ece2cf'; c.fill();
  c.fillStyle = 'rgba(120,100,70,.15)';
  c.beginPath(); c.ellipse(-1, H * 0.55, 9, 11, 0, 0, Math.PI * 2); c.fill();

  // Closed upper over the front, in faded plaid.
  const openY = H * 0.12;
  c.save();
  solePath(c, 0.97); c.clip();
  c.beginPath();
  c.moveTo(-W, -H - 2); c.lineTo(W, -H - 2); c.lineTo(W, openY);
  c.quadraticCurveTo(0, openY - 16, -W, openY);
  c.closePath();
  c.clip();
  c.fillStyle = '#a8706a'; c.fillRect(-W, -H - 2, W * 2, H * 2);
  c.fillStyle = 'rgba(70,80,105,.32)';
  for (let x = -W; x < W; x += 12) c.fillRect(x, -H, 5, H * 2);
  for (let y = -H; y < openY; y += 12) c.fillRect(-W, y, W * 2, 5);
  c.fillStyle = 'rgba(240,225,200,.35)';
  for (let x = -W + 8; x < W; x += 12) c.fillRect(x, -H, 1, H * 2);
  for (let y = -H + 8; y < openY; y += 12) c.fillRect(-W, y, W * 2, 1);
  c.beginPath(); c.rect(-W, -H - 2, W * 2, H * 2);
  sheen(c, 0.28);
  c.restore();

  // Fluffy collar along the opening (same curve as above: x = -W..W, dip of 8 at the middle).
  const collar = (u) => [-W + 2 * W * u, openY - 32 * u * (1 - u)];
  const r = mulberry32(7);
  for (let i = 0; i <= 26; i++) {
    const [x, y] = collar(0.27 + (i / 26) * 0.46);
    const rad = 3 + r() * 1.8;
    c.fillStyle = `rgb(${215 + r() * 25},${205 + r() * 25},${190 + r() * 25})`;
    c.beginPath(); c.arc(x, y + (r() - 0.5) * 2, rad, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.5)';
  for (let i = 0; i < 12; i++) {
    const [x, y] = collar(0.28 + r() * 0.44);
    c.beginPath(); c.arc(x - 0.8, y - 1.3, 1.2, 0, Math.PI * 2); c.fill();
  }
}

function drawClog(c) {
  // Pale wooden sole with grain.
  solePath(c);
  const wood = c.createLinearGradient(-W / 2, 0, W / 2, 0);
  wood.addColorStop(0, '#e2c795'); wood.addColorStop(1, '#c7a56f');
  c.fillStyle = wood; c.fill();
  c.strokeStyle = '#8f6c3c'; c.lineWidth = 1.4; c.stroke();
  c.save();
  solePath(c); c.clip();
  const r = mulberry32(11);
  c.strokeStyle = 'rgba(130,85,40,.28)'; c.lineWidth = 0.7;
  for (let x = -W / 2; x < W / 2; x += 3 + r() * 3) {
    c.beginPath(); c.moveTo(x, -H);
    c.bezierCurveTo(x + (r() - 0.5) * 6, -H / 3, x + (r() - 0.5) * 6, H / 3, x + (r() - 0.5) * 3, H);
    c.stroke();
  }
  c.fillStyle = 'rgba(110,70,30,.25)';
  c.beginPath(); c.ellipse(4, H * 0.62, 2.5, 4, 0.3, 0, Math.PI * 2); c.fill(); // knot
  c.restore();

  // Dark leather top over the front, with stitching and two rivets.
  const openY = H * 0.18;
  c.save();
  solePath(c, 0.92); c.clip();
  c.beginPath();
  c.moveTo(-W, -H - 2); c.lineTo(W, -H - 2); c.lineTo(W, openY);
  c.quadraticCurveTo(0, openY - 14, -W, openY);
  c.closePath();
  const leather = c.createRadialGradient(-6, -H * 0.5, 2, 0, -H * 0.2, H);
  leather.addColorStop(0, '#6a4330'); leather.addColorStop(0.6, '#3e2519'); leather.addColorStop(1, '#22130c');
  c.fillStyle = leather; c.fill();
  c.restore();
  c.save();
  solePath(c, 0.84); c.clip();
  c.setLineDash([2.5, 2]);
  c.strokeStyle = 'rgba(214,190,150,.8)'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(-W, openY - 3.5); c.quadraticCurveTo(0, openY - 17.5, W, openY - 3.5); c.stroke();
  solePath(c, 0.88); c.stroke();
  c.restore();
  for (const x of [-W * 0.36, W * 0.36]) {
    const u = (x + W) / (2 * W), y = openY - 28 * u * (1 - u) - 6.5; // just above the leather edge
    const g = c.createRadialGradient(x - 0.7, y - 0.7, 0.2, x, y, 2.2);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(1, '#a8842e');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 2.1, 0, Math.PI * 2); c.fill();
  }
}

function drawSport(c) {
  // Thick black sole with tread lugs showing at the rim.
  c.save(); c.scale(1.04, 1.02);
  solePath(c);
  c.fillStyle = '#151515'; c.fill();
  c.setLineDash([3, 2.5]);
  c.strokeStyle = '#2f2f2f'; c.lineWidth = 3; c.stroke();
  c.restore();
  // Contoured footbed.
  solePath(c, 0.86);
  c.fillStyle = '#2c2a28'; c.fill();
  sheen(c, 0.18);
  c.save();
  solePath(c, 0.86); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1;
  for (let y = -H; y < H; y += 4) { c.beginPath(); c.moveTo(-W, y); c.lineTo(W, y + 3); c.stroke(); }
  c.restore();

  // Two velcro straps, overhanging the sole a little.
  for (const [y, w] of [[-H * 0.32, W * 1.1], [H * 0.2, W * 0.98]]) {
    c.save();
    c.translate(0, y); c.rotate(-0.06);
    c.fillStyle = '#1f1f1f';
    roundRect(c, -w / 2, -5.5, w, 11, 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.6;
    for (let x = -w / 2 + 3; x < w / 2 - 3; x += 2.5) { c.beginPath(); c.moveTo(x, -4.5); c.lineTo(x, 4.5); c.stroke(); }
    c.fillStyle = '#3d3d3d';
    roundRect(c, w * 0.08, -4.5, w * 0.36, 9, 2); c.fill(); // velcro tab
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 18; i++) c.fillRect(w * 0.1 + (i % 9) * w * 0.035, -3 + Math.floor(i / 9) * 4, 1, 1.5);
    c.strokeStyle = '#8a8a8a'; c.lineWidth = 1.4;
    roundRect(c, -w / 2 - 1, -4, 4, 8, 1.2); c.stroke(); // D-ring
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-w / 2 + 2, -5.5, w - 4, 1);
    c.restore();
  }
}

// --- Bare foot: a right foot from above, toes up. Grubby on purpose. ---

// Toes from big to little: centre x, centre y, half width, half length.
const TOES = [
  [-W * 0.29, -H * 0.66, 9, 11],
  [-W * 0.02, -H * 0.76, 6.4, 7.8],
  [W * 0.19, -H * 0.7, 5.8, 7],
  [W * 0.36, -H * 0.59, 5.1, 6.1],
  [W * 0.5, -H * 0.44, 4.3, 5.1],
];

function footPath(c) {
  c.beginPath();
  c.moveTo(-W * 0.48, -H * 0.46);
  c.bezierCurveTo(-W * 0.58, -H * 0.05, -W * 0.44, H * 0.35, -W * 0.37, H * 0.62);
  c.bezierCurveTo(-W * 0.33, H * 1.04, W * 0.35, H * 1.04, W * 0.37, H * 0.6);
  c.bezierCurveTo(W * 0.41, H * 0.3, W * 0.52, H * 0.0, W * 0.52, -H * 0.32);
  c.bezierCurveTo(W * 0.5, -H * 0.52, -W * 0.4, -H * 0.6, -W * 0.48, -H * 0.46);
  c.closePath();
}

function drawBareFoot(c) {
  const r = mulberry32(31);
  const skin = c.createLinearGradient(-W / 2, -H, W / 2, H);
  skin.addColorStop(0, '#efc6a4'); skin.addColorStop(0.6, '#d9a582'); skin.addColorStop(1, '#b98463');

  // Toes first; the foot overlaps their bases. Grimy, darker tips.
  for (const [x, y, rx, ry] of TOES) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = skin; c.fill();
    const tip = c.createRadialGradient(x, y - ry, 0, x, y - ry, ry * 1.2);
    tip.addColorStop(0, 'rgba(70,55,35,.55)'); tip.addColorStop(1, 'rgba(70,55,35,0)');
    c.fillStyle = tip; c.fill();
    c.strokeStyle = 'rgba(100,60,40,.6)'; c.lineWidth = 0.8; c.stroke();
  }
  footPath(c);
  c.fillStyle = skin; c.fill();
  c.strokeStyle = 'rgba(120,70,45,.4)'; c.lineWidth = 0.9; c.stroke();

  c.save();
  footPath(c); c.clip();
  // Grime: grey-brown patches, worst along the outer edge and the heel.
  for (const [x, y, rad, a] of [[W * 0.45, H * 0.1, 16, 0.55], [0, H * 0.9, 18, 0.6], [-W * 0.48, H * 0.3, 12, 0.45], [W * 0.1, -H * 0.2, 10, 0.3], [-W * 0.2, H * 0.55, 8, 0.3]]) {
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(95,80,55,${a})`); g.addColorStop(1, 'rgba(95,80,55,0)');
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Faint veins on top.
  c.strokeStyle = 'rgba(110,130,170,.35)'; c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(-W * 0.1, H * 0.7); c.bezierCurveTo(-W * 0.2, H * 0.3, W * 0.05, H * 0.05, -W * 0.05, -H * 0.3); c.stroke();
  c.beginPath(); c.moveTo(-W * 0.1, H * 0.2); c.bezierCurveTo(W * 0.1, H * 0.05, W * 0.2, -H * 0.1, W * 0.25, -H * 0.35); c.stroke();
  c.restore();
  // Creases where the toes join.
  c.strokeStyle = 'rgba(110,60,40,.35)'; c.lineWidth = 0.8;
  for (const [x, y, rx, ry] of TOES) { c.beginPath(); c.arc(x, y + ry * 0.7, rx * 0.8, 0.3, Math.PI - 0.3); c.stroke(); }

  // Thick, yellowed toenails with dirt under the tips.
  for (const [x, y, rx, ry] of TOES) {
    const nx = x, ny = y - ry * 0.42, nrx = rx * 0.62, nry = ry * 0.4;
    c.beginPath(); c.ellipse(nx, ny, nrx, nry, 0, 0, Math.PI * 2);
    const nail = c.createLinearGradient(nx, ny - nry, nx, ny + nry);
    nail.addColorStop(0, '#a99a3c'); nail.addColorStop(1, '#d9c878'); // thick, yellow-green
    c.fillStyle = nail; c.fill();
    c.strokeStyle = 'rgba(100,80,25,.8)'; c.lineWidth = 0.7; c.stroke();
    c.fillStyle = 'rgba(120,110,40,.6)'; // fungal patch
    c.beginPath(); c.ellipse(nx + nrx * 0.25, ny, nrx * 0.35, nry * 0.4, 0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(nx, ny - nry * 0.55, nrx * 0.85, nry * 0.45, 0, Math.PI, Math.PI * 2);
    c.fillStyle = '#3b2a1a'; c.fill(); // black crescent of dirt
    c.fillStyle = 'rgba(255,255,230,.35)';
    c.beginPath(); c.ellipse(nx - nrx * 0.3, ny + nry * 0.1, nrx * 0.25, nry * 0.3, 0, 0, Math.PI * 2); c.fill();
  }

  // Hair on the toes and the top of the foot.
  c.strokeStyle = 'rgba(55,38,25,.85)'; c.lineWidth = 0.55; c.lineCap = 'round';
  const tuft = (cx, cy, n, spread) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * spread, y = cy + (r() - 0.5) * spread * 0.6, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + 0.6) * 2, y + Math.sin(a + 0.6) * 2, x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5);
      c.stroke();
    }
  };
  tuft(TOES[0][0], TOES[0][1] + 4, 14, 11);
  tuft(TOES[1][0], TOES[1][1] + 3, 6, 7);
  tuft(TOES[2][0], TOES[2][1] + 3, 5, 6);
  tuft(TOES[3][0], TOES[3][1] + 2, 3, 5);
  tuft(-W * 0.12, -H * 0.2, 18, 20);
  tuft(W * 0.12, -H * 0.05, 8, 14);
  // Dirt worn into the edge of the foot.
  footPath(c);
  c.strokeStyle = 'rgba(60,45,30,.55)'; c.lineWidth = 2.2; c.stroke();

  // A blister by the little toe and a dark speck of something.
  c.beginPath(); c.ellipse(W * 0.38, -H * 0.22, 3.2, 2.6, 0.4, 0, Math.PI * 2);
  c.fillStyle = '#e8c3a2'; c.fill();
  c.strokeStyle = 'rgba(150,80,60,.6)'; c.lineWidth = 0.7; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.6)';
  c.beginPath(); c.arc(W * 0.37, -H * 0.24, 0.9, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a3220';
  c.beginPath(); c.ellipse(-W * 0.25, H * 0.42, 1.6, 1.1, 0.5, 0, Math.PI * 2); c.fill();

  footPath(c); sheen(c, 0.2);
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

const BOX = { x: -W * 0.75, y: -H - 4, w: W * 1.5, h: H * 2 + 8 };
const cache = new Map(); // `${id}@${res}` -> { body, shadow }

// The faint sole print a miss leaves on the floor: the sole outline with a tread
// texture punched out of it. Drawn at low opacity by effects.js.
export function printSprite(id, res) {
  const key = `print:${id}@${res}`;
  if (!cache.has(key)) {
    const r = mulberry32(id.length * 977);
    cache.set(key, makeSprite(BOX, res, (c) => {
      c.fillStyle = 'rgb(70,55,40)';
      if (id === 'foot') {
        // A footprint: ball and heel pads, no arch, and five toe marks.
        c.beginPath(); c.ellipse(0, -H * 0.3, W * 0.45, H * 0.24, 0.1, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(-W * 0.02, H * 0.68, W * 0.3, H * 0.27, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(W * 0.3, H * 0.2, W * 0.12, H * 0.32, -0.15, 0, Math.PI * 2); c.fill();
        for (const [x, y, rx, ry] of TOES) { c.beginPath(); c.ellipse(x, y - 2, rx * 0.8, ry * 0.75, 0, 0, Math.PI * 2); c.fill(); }
      } else {
        solePath(c, id === 'sport' ? 1.04 : 1);
        c.fill();
      }
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,.6)';
      for (let i = 0; i < 160; i++) {
        c.beginPath(); c.arc((r() - 0.5) * W, (r() - 0.5) * H * 2, 0.6 + r() * 1.6, 0, Math.PI * 2); c.fill();
      }
      if (id !== 'foot') { solePath(c, 0.7); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill(); } // arch barely touches the floor
    }));
  }
  return cache.get(key);
}

export function sandalSprites(id, res) {
  const key = `${id}@${res}`;
  if (!cache.has(key)) {
    const sandal = SANDALS.find((s) => s.id === id) || SANDALS[0];
    const body = makeSprite(BOX, res, sandal.draw);
    cache.set(key, { body, shadow: freeze(makeShadow(body, res / 2, 6, 0.4)) });
  }
  return cache.get(key);
}
