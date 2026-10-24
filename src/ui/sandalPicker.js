// Yellow "Choose a sandal" button (top right) with a dropdown of four picture tiles.

import { SANDALS, sandalSprites } from '../game/sandals.js';
import { drawSprite } from '../game/sprites.js';
import { closeOnOutsidePointer } from './dom.js';

const PREVIEW = 72; // CSS px

export function createSandalPicker(root, { current, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'corner corner-right';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-yellow';
  button.textContent = 'Choose a sandal';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'sandal-menu');

  const menu = document.createElement('div');
  menu.id = 'sandal-menu';
  menu.className = 'dropdown sandal-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Sandals');

  const tiles = SANDALS.map((sandal) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'sandal-tile';
    tile.dataset.id = sandal.id;
    const label = document.createElement('span');
    label.textContent = sandal.label;
    tile.append(preview(sandal.id), label);
    tile.addEventListener('click', () => {
      select(sandal.id);
      close();
    });
    menu.append(tile);
    return tile;
  });

  function select(id) {
    current = id;
    for (const tile of tiles) {
      const on = tile.dataset.id === id;
      tile.classList.toggle('selected', on);
      tile.setAttribute('aria-pressed', String(on));
    }
    onChange(id);
  }

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (tiles.find((t) => t.dataset.id === current) || tiles[0]).focus();
  }

  function close({ refocus = true } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    const i = tiles.indexOf(document.activeElement);
    if (i < 0) return;
    const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[e.key];
    if (step) {
      e.preventDefault();
      tiles[(i + step + tiles.length) % tiles.length].focus();
    }
  });
  closeOnOutsidePointer(wrap, () => !menu.hidden, () => close({ refocus: false }));

  wrap.append(button, menu);
  root.append(wrap);
  select(current);
}

function preview(id) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW * dpr;
  canvas.height = PREVIEW * dpr;
  canvas.style.width = canvas.style.height = `${PREVIEW}px`;
  canvas.setAttribute('aria-hidden', 'true');
  const c = canvas.getContext('2d');
  const { body, shadow } = sandalSprites(id, dpr);
  const angle = 0.6, scale = 0.68, mid = PREVIEW / 2;
  drawSprite(c, shadow, mid + 4, mid + 5, angle, scale, dpr);
  drawSprite(c, body, mid, mid, angle, scale, dpr);
  return canvas;
}
