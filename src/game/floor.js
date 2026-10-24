// Worn kitchen floor: cream tiles, grey grout, faint stains and crumbs, dark vignette.
// Rendered once to an offscreen canvas (at device resolution) and reused every frame.

import { mulberry32, hash2 } from './random.js';

const TILE = 72;   // tile pitch in CSS px
const GROUT = 3;   // grout line width in CSS px

// Fixed seeds so the floor looks the same on every load and resize.
function tileRandom(col, row) {
  return mulberry32(hash2(col, row));
}

export function renderFloor(width, height, dpr) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Grout
  c.fillStyle = '#9a958c';
  c.fillRect(0, 0, width, height);

  // Center the grid so the edges look the same on both sides.
  const offX = ((width / 2) % TILE) - TILE;
  const offY = ((height / 2) % TILE) - TILE;
  const cols = Math.ceil(width / TILE) + 2;
  const rows = Math.ceil(height / TILE) + 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      drawTile(c, offX + col * TILE, offY + row * TILE, tileRandom(col - (cols >> 1), row - (rows >> 1)));
    }
  }

  const rand = mulberry32(1234);
  const area = width * height;
  drawStains(c, width, height, rand, Math.max(3, Math.round(area / 180000)));
  drawCrumbs(c, width, height, rand, Math.round(area / 9000));
  drawVignette(c, width, height);
  return canvas;
}

function drawTile(c, x, y, rand) {
  const s = TILE - GROUT;
  const tx = x + GROUT / 2, ty = y + GROUT / 2;

  // Slight colour variation per tile, like aged ceramic.
  const shade = (rand() - 0.5) * 10;
  const r = 236 + shade, g = 226 + shade, b = 203 + shade * 1.3;
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.fillRect(tx, ty, s, s);

  // Glaze: light from the top-left, soft darkening toward the bottom-right.
  const glaze = c.createLinearGradient(tx, ty, tx + s, ty + s);
  glaze.addColorStop(0, 'rgba(255,255,250,.35)');
  glaze.addColorStop(0.5, 'rgba(255,255,250,0)');
  glaze.addColorStop(1, 'rgba(90,70,40,.10)');
  c.fillStyle = glaze;
  c.fillRect(tx, ty, s, s);

  // Bevelled edges.
  c.fillStyle = 'rgba(255,255,255,.45)';
  c.fillRect(tx, ty, s, 1);
  c.fillRect(tx, ty, 1, s);
  c.fillStyle = 'rgba(80,65,45,.22)';
  c.fillRect(tx, ty + s - 1, s, 1);
  c.fillRect(tx + s - 1, ty, 1, s);

  // Wear: a few blotchy scuffs on some tiles.
  const scuffs = rand() < 0.45 ? 1 + Math.floor(rand() * 3) : 0;
  for (let i = 0; i < scuffs; i++) {
    const cx = tx + rand() * s, cy = ty + rand() * s, rad = 6 + rand() * 18;
    const w = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    w.addColorStop(0, `rgba(150,130,95,${0.05 + rand() * 0.06})`);
    w.addColorStop(1, 'rgba(150,130,95,0)');
    c.fillStyle = w;
    c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  // Rare hairline crack.
  if (rand() < 0.06) {
    c.strokeStyle = 'rgba(90,80,65,.35)';
    c.lineWidth = 0.6;
    c.beginPath();
    let px = tx + rand() * s, py = ty;
    c.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px = Math.min(tx + s, Math.max(tx, px + (rand() - 0.5) * 18));
      py += s / 4;
      c.lineTo(px, py);
    }
    c.stroke();
  }
}

function drawStains(c, width, height, rand, count) {
  for (let i = 0; i < count; i++) {
    const cx = rand() * width, cy = rand() * height;
    const rad = 25 + rand() * 60;
    const hue = rand() < 0.5 ? '120,85,40' : '95,90,70'; // coffee-brown or greyish grime
    const alpha = 0.05 + rand() * 0.07;
    // A few overlapping blobs make an irregular outline.
    for (let j = 0; j < 4; j++) {
      const bx = cx + (rand() - 0.5) * rad, by = cy + (rand() - 0.5) * rad;
      const br = rad * (0.4 + rand() * 0.6);
      const g = c.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, `rgba(${hue},${alpha})`);
      g.addColorStop(0.7, `rgba(${hue},${alpha * 0.6})`);
      g.addColorStop(1, `rgba(${hue},0)`);
      c.fillStyle = g;
      c.fillRect(bx - br, by - br, br * 2, br * 2);
    }
  }
}

function drawCrumbs(c, width, height, rand, count) {
  const colors = ['#c9a46a', '#b38650', '#8c6a43', '#e2c99a', '#6b5a48'];
  for (let i = 0; i < count; i++) {
    const x = rand() * width, y = rand() * height;
    const size = 0.6 + rand() * 1.8;
    c.save();
    c.translate(x, y);
    c.rotate(rand() * Math.PI);
    c.fillStyle = 'rgba(0,0,0,.18)'; // tiny shadow, light from the top-left
    c.fillRect(-size / 2 + 0.6, -size / 3 + 0.6, size, size * 0.7);
    c.fillStyle = colors[Math.floor(rand() * colors.length)];
    c.fillRect(-size / 2, -size / 3, size, size * 0.7);
    c.restore();
  }
}

function drawVignette(c, width, height) {
  const r = Math.hypot(width, height) / 2;
  const g = c.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
  g.addColorStop(0, 'rgba(20,12,5,0)');
  g.addColorStop(1, 'rgba(20,12,5,.55)');
  c.fillStyle = g;
  c.fillRect(0, 0, width, height);
}
