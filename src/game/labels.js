// Owner names in small white text with a dark outline, all packed onto one
// sheet so drawing 150 of them is a single GPU batch. Names are added as they
// first appear; when the sheet is full it starts over and names re-pack lazily.

const FONT = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
const H = 16;         // label height in CSS px
const SHEET_CSS = 1024;

export function createLabelSheet() {
  let dpr = 0, version = 0;
  let canvas = null, c = null;
  let x = 0, y = 0;

  function reset(nextDpr) {
    dpr = nextDpr;
    version++;
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(4096, Math.ceil(SHEET_CSS * dpr));
    c = canvas.getContext('2d');
    x = 0; y = 0;
  }

  function render(text) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = FONT;
    const w = Math.ceil(c.measureText(text).width) + 8;
    const sw = Math.ceil(w * dpr), sh = Math.ceil(H * dpr);
    if (x + sw > canvas.width) { x = 0; y += sh + 2; }
    if (y + sh > canvas.height) return null; // full
    c.setTransform(dpr, 0, 0, dpr, x, y);
    c.font = FONT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(25,15,8,.85)';
    c.strokeText(text, w / 2, H / 2);
    c.fillStyle = '#fff';
    c.fillText(text, w / 2, H / 2);
    const label = { version, text, sx: x, sy: y, sw, sh, w, h: H };
    x += sw + 2;
    return label;
  }

  // The label for roach `r`, cached on it until the sheet starts over.
  function labelFor(r, currentDpr) {
    if (currentDpr !== dpr) reset(currentDpr);
    const text = r.owner_name || '';
    const cached = r._label;
    if (cached && cached.version === version && cached.text === text) return cached;
    let label = render(text);
    if (!label) { reset(dpr); label = render(text); }
    r._label = label;
    return label;
  }

  return {
    // Draws the name centred horizontally on x, with its top at y (CSS px, transform = dpr).
    draw(ctx, r, x0, y0, currentDpr) {
      const l = labelFor(r, currentDpr);
      if (l) ctx.drawImage(canvas, l.sx, l.sy, l.sw, l.sh, x0 - l.w / 2, y0, l.w, l.h);
    },
  };
}
