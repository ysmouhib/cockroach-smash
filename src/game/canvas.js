// Full-window canvas drawn at the screen's real pixel density.
// All drawing code works in CSS pixels; the transform maps them to device pixels.

export function createStage(canvas) {
  const ctx = canvas.getContext('2d');
  const listeners = [];
  const stage = { canvas, ctx, width: 0, height: 0, dpr: 1, onResize };

  function resize() {
    stage.dpr = Math.min(window.devicePixelRatio || 1, 3);
    stage.width = window.innerWidth;
    stage.height = window.innerHeight;
    canvas.width = Math.round(stage.width * stage.dpr);
    canvas.height = Math.round(stage.height * stage.dpr);
    // Not 100vh: on phones that is taller than the visible area while the address bar shows.
    canvas.style.width = `${stage.width}px`;
    canvas.style.height = `${stage.height}px`;
    ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    for (const cb of listeners) cb(stage);
  }

  function onResize(cb) {
    listeners.push(cb);
    cb(stage);
  }

  // Coalesce bursts of resize events (window dragging, browser zoom) into one per frame.
  let pending = false;
  window.addEventListener('resize', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; resize(); });
  });

  resize();
  return stage;
}
