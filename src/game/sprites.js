// Offscreen sprites. Drawing a detailed cockroach with a blurred shadow 150 times
// per frame is too slow, so art is pre-rendered once and stamped with drawImage.

const SHADOW_SHIFT = 10000; // device px: draws the shape off-canvas so only its shadow lands
const ATLAS_MAX_WIDTH = 4096;
const ATLAS_GUTTER = 2;     // px between cells so smoothing never bleeds into a neighbour

// `box` is in art units ({x, y, w, h}); `res` is device pixels per art unit.
export function renderSprite(box, res, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(box.w * res));
  canvas.height = Math.max(1, Math.ceil(box.h * res));
  const c = canvas.getContext('2d');
  c.setTransform(res, 0, 0, res, -box.x * res, -box.y * res);
  draw(c);
  return { canvas, image: canvas, x: box.x, y: box.y, w: box.w, h: box.h };
}

export function makeSprite(box, res, draw) {
  return freeze(renderSprite(box, res, draw));
}

// Small canvases live in main memory and are re-uploaded to the GPU on every
// draw. An ImageBitmap is immutable, so the browser uploads it once. Until the
// bitmap is ready, the canvas itself is drawn.
export function freeze(sprite) {
  if (typeof createImageBitmap === 'function') {
    createImageBitmap(sprite.canvas).then((bitmap) => { sprite.image = bitmap; }, () => {});
  }
  return sprite;
}

// Packs sprites into one sheet. Consecutive draws from the same sheet are
// batched by the GPU, which matters with 150 cockroaches on screen.
export function packAtlas(sprites) {
  const cellW = Math.max(...sprites.map((s) => s.canvas.width)) + ATLAS_GUTTER;
  const cellH = Math.max(...sprites.map((s) => s.canvas.height)) + ATLAS_GUTTER;
  const cols = Math.max(1, Math.min(sprites.length, Math.floor(ATLAS_MAX_WIDTH / cellW)));
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = Math.ceil(sprites.length / cols) * cellH;
  const c = canvas.getContext('2d');
  const sheet = { canvas, image: canvas };
  const packed = sprites.map((s, i) => {
    const sx = (i % cols) * cellW, sy = Math.floor(i / cols) * cellH;
    c.drawImage(s.canvas, sx, sy);
    return { sheet, sx, sy, sw: s.canvas.width, sh: s.canvas.height, x: s.x, y: s.y, w: s.w, h: s.h };
  });
  freeze(sheet); // only once everything is drawn: the bitmap is a snapshot
  return packed;
}

// A soft, uniform drop shadow from a sprite's silhouette, as its own sprite.
export function makeShadow(sprite, res, blur, alpha) {
  const pad = blur * 1.5;
  const box = { x: sprite.x - pad, y: sprite.y - pad, w: sprite.w + pad * 2, h: sprite.h + pad * 2 };
  return renderSprite(box, res, (c) => {
    c.shadowColor = `rgba(0,0,0,${alpha})`;
    c.shadowBlur = blur * res;
    c.shadowOffsetX = SHADOW_SHIFT; // shadow offsets ignore the transform
    c.drawImage(sprite.canvas, sprite.x - SHADOW_SHIFT / res, sprite.y, sprite.w, sprite.h);
  });
}

// Draws a sprite in art units with the current transform.
export function blit(ctx, sprite) {
  if (sprite.sheet) ctx.drawImage(sprite.sheet.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh, sprite.x, sprite.y, sprite.w, sprite.h);
  else ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h);
}

// Stamps a sprite centred on (x, y) in CSS px, rotated and scaled. Leaves the transform changed.
export function drawSprite(ctx, sprite, x, y, angle, scale, dpr) {
  const k = scale * dpr;
  const cos = Math.cos(angle) * k, sin = Math.sin(angle) * k;
  ctx.setTransform(cos, sin, -sin, cos, x * dpr, y * dpr);
  blit(ctx, sprite);
}
