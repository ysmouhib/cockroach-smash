// Phone viewport details: no pinch or double-tap zoom, no page scroll, and the
// on-screen keyboard height as --kb so bottom sheets can sit above it.

export function setUpPhoneViewport() {
  // iOS Safari ignores user-scalable=no; its own gesture events still zoom.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', `${covered}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
