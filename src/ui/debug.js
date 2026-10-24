// ?debug=1 overlay: frames per second, frame time, a status line, and test buttons.

export function isDebug() {
  return new URLSearchParams(location.search).get('debug') === '1';
}

// `status()` returns extra text for the stats line; `actions` are [label, onClick] pairs.
export function createDebugOverlay(root, { status, actions }) {
  const box = document.createElement('div');
  box.className = 'debug';
  const stats = document.createElement('span');
  box.append(stats);
  for (const [label, onClick] of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    box.append(b);
  }
  root.append(box);

  let frames = 0, work = 0, since = performance.now();
  return {
    // Call once per animation frame with the milliseconds spent updating and drawing.
    tick(workMs) {
      frames++;
      work += workMs;
      const now = performance.now();
      if (now - since >= 500) {
        const fps = Math.round((frames * 1000) / (now - since));
        stats.textContent = `${fps} fps · ${(work / frames).toFixed(1)} ms · ${status()}`;
        frames = 0; work = 0; since = now;
      }
    },
  };
}
