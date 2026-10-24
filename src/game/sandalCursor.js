// The sandal that replaces the mouse cursor over the floor. It hovers above the
// floor (larger shadow offset) and tilts slightly toward the direction of motion.
// A slam pops it to 115% and brings it down to 100% in about 100 ms. On touch
// screens it only appears where you tap, slams and fades.

import { sandalSprites } from './sandals.js';
import { drawSprite } from './sprites.js';

const MAX_TILT = 0.35;     // radians
const HOVER_DX = 10, HOVER_DY = 14;
const CONTACT_DX = 2, CONTACT_DY = 3;
const SLAM_DOWN = 0.1;     // s from 115% to 100%
const SLAM_LIFT = 0.25;    // s to hover again
const TAP_SHOW = 0.45;     // s a tapped sandal stays before fading

export function createSandalCursor(canvas, initialId) {
  let id = initialId;
  let hovering = false;      // a mouse or pen is over the floor
  let x = 0, y = 0, lastX = 0;
  let vx = 0;
  let tilt = 0;
  let clock = 0;             // local seconds, advanced by update()
  let slamAt = -Infinity;
  let tapAt = -Infinity;     // last touch slam

  function onMove(e) {
    if (e.pointerType === 'touch') return;
    hovering = true;
    x = e.clientX; y = e.clientY;
  }
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerenter', onMove);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') hovering = false; });

  function update(dt) {
    clock += dt;
    if (dt <= 0) return;
    const instant = (x - lastX) / dt;
    lastX = x;
    vx += (instant - vx) * (1 - Math.exp(-dt * 20));
    const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 0.0006));
    tilt += (target - tilt) * (1 - Math.exp(-dt * 10));
  }

  function draw(ctx, dpr) {
    const sinceTap = clock - tapAt;
    const tapAlpha = sinceTap < TAP_SHOW ? 1 : Math.max(0, 1 - (sinceTap - TAP_SHOW) / 0.3);
    if (!hovering && tapAlpha <= 0) return;

    const since = clock - slamAt;
    let scale = 1, lift = 1; // lift: 1 = hovering, 0 = touching the floor
    if (since < SLAM_DOWN) {
      const f = since / SLAM_DOWN;
      scale = 1.15 - 0.15 * f * f;
      lift = 1 - f;
    } else if (since < SLAM_DOWN + SLAM_LIFT) {
      lift = (since - SLAM_DOWN) / SLAM_LIFT;
    }
    const res = Math.min(dpr, 3);
    const { body, shadow } = sandalSprites(id, res);
    ctx.globalAlpha = hovering ? 1 : tapAlpha;
    const sdx = CONTACT_DX + (HOVER_DX - CONTACT_DX) * lift, sdy = CONTACT_DY + (HOVER_DY - CONTACT_DY) * lift;
    drawSprite(ctx, shadow, x + sdx, y + sdy, tilt, scale, dpr);
    drawSprite(ctx, body, x, y, tilt, scale, dpr);
    ctx.globalAlpha = 1;
  }

  return {
    update,
    draw,
    setSandal(next) { id = next; },
    get sandalId() { return id; },
    get tilt() { return tilt; },
    slam(px, py, touch) {
      slamAt = clock;
      if (touch) {
        tapAt = clock;
        x = lastX = px; y = py; tilt = 0; vx = 0;
      }
    },
    // Position while a mouse sandal hovers the floor, for the cockroaches to flinch from.
    get position() { return hovering ? { x, y } : null; },
  };
}
