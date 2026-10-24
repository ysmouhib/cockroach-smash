// Short-lived effects: screen shake on a slam, faint sole prints on a miss,
// and the winner's gold confetti.

import { printSprite } from './sandals.js';
import { drawSprite } from './sprites.js';

const SHAKE_PX = 4;
const SHAKE_TIME = 0.15;
const PRINT_ALPHA = 0.2;
const PRINT_TIME = 3;
const CONFETTI_TIME = 2.6;
const GOLD = ['#ffd700', '#f5c518', '#ffe680', '#d4a017', '#fff3b0', '#e8b923'];

export function createEffects() {
  let shakeUntil = 0;
  let prints = [];
  let confetti = [];

  return {
    shake(t) {
      shakeUntil = t + SHAKE_TIME;
    },

    // Offset for the whole floor scene, fading out over the shake.
    shakeOffset(t) {
      const left = shakeUntil - t;
      if (left <= 0) return [0, 0];
      const k = (left / SHAKE_TIME) * SHAKE_PX;
      return [(Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k];
    },

    addPrint(x, y, angle, sandalId, t) {
      prints.push({ x, y, angle, sandalId, start: t });
      if (prints.length > 30) prints.shift();
    },

    burstConfetti(x, y, t) {
      for (let i = 0; i < 140; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 250 + Math.random() * 550;
        confetti.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          w: 4 + Math.random() * 5, h: 2 + Math.random() * 3,
          spin: (Math.random() - 0.5) * 18, angle: Math.random() * Math.PI,
          color: GOLD[i % GOLD.length], start: t, flutter: Math.random() * 6,
        });
      }
    },

    update(t, dt) {
      prints = prints.filter((p) => t - p.start < PRINT_TIME);
      confetti = confetti.filter((c) => t - c.start < CONFETTI_TIME);
      const drag = Math.exp(-1.8 * dt);
      for (const c of confetti) {
        c.vy += 900 * dt;
        c.vx *= drag; c.vy *= drag;
        c.x += (c.vx + Math.sin(t * 8 + c.flutter) * 30) * dt;
        c.y += c.vy * dt;
        c.angle += c.spin * dt;
      }
    },

    // Drawn on the floor, under the cockroaches.
    drawUnder(ctx, dpr, t) {
      if (!prints.length) return;
      const res = Math.min(dpr, 2);
      for (const p of prints) {
        ctx.globalAlpha = PRINT_ALPHA * (1 - (t - p.start) / PRINT_TIME);
        drawSprite(ctx, printSprite(p.sandalId, res), p.x, p.y, p.angle, 1, dpr);
      }
      ctx.globalAlpha = 1;
    },

    // Drawn above everything on the floor.
    drawOver(ctx, dpr, t) {
      if (!confetti.length) return;
      for (const c of confetti) {
        const life = (t - c.start) / CONFETTI_TIME;
        ctx.globalAlpha = life > 0.7 ? (1 - life) / 0.3 : 1;
        const cos = Math.cos(c.angle) * dpr, sin = Math.sin(c.angle) * dpr;
        ctx.setTransform(cos, sin, -sin * Math.abs(Math.cos(t * 7 + c.flutter)), cos * Math.abs(Math.cos(t * 7 + c.flutter)), c.x * dpr, c.y * dpr);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}
