// Shared game clock in seconds. Movement is computed from this, so once the
// offset to the server clock is known (Phase 5) every browser agrees on positions.

let offsetMs = 0;

export function setServerOffset(ms) {
  offsetMs = ms;
}

export function now() {
  return (performance.timeOrigin + performance.now() + offsetMs) / 1000;
}
