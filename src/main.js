import { createStage } from './game/canvas.js';
import { renderFloor } from './game/floor.js';
import { now, setServerOffset } from './game/clock.js';
import { createRoachLayer } from './game/roaches.js';
import { createSandalCursor } from './game/sandalCursor.js';
import { SANDALS, DEFAULT_SANDAL } from './game/sandals.js';
import { createEffects } from './game/effects.js';
import { createSmashing } from './game/smashing.js';
import { createSandalPicker } from './ui/sandalPicker.js';
import { createComplaintCard } from './ui/complaintCard.js';
import { createFinalMessage } from './ui/finalMessage.js';
import { createToast } from './ui/toast.js';
import { createConfirmDialog } from './ui/confirmDialog.js';
import { createReleasePanel } from './ui/releasePanel.js';
import { createHallOfFame } from './ui/hallOfFame.js';
import { isDebug, createDebugOverlay } from './ui/debug.js';
import { createSoundToggle } from './ui/soundToggle.js';
import { createBanner } from './ui/banner.js';
import { setUpPhoneViewport } from './ui/viewport.js';
import { createSound } from './game/sound.js';
import { connectBackend } from './data/backend.js';
import { MESSAGES } from './data/messages.js';
import { loadPref, savePref } from './data/prefs.js';

// --- The floor and the sandal start at once; the rest waits for the backend. ---

const stage = createStage(document.getElementById('floor'));
const ui = document.getElementById('ui');
let floor = null;

setUpPhoneViewport();
const roaches = createRoachLayer();
const effects = createEffects();
const toast = createToast(ui);
const banner = createBanner(ui);
const sound = createSound({ muted: loadPref('sound', 'on') === 'off' });

const savedSandal = loadPref('sandal', DEFAULT_SANDAL);
const sandalId = SANDALS.some((s) => s.id === savedSandal) ? savedSandal : DEFAULT_SANDAL;
const sandal = createSandalCursor(stage.canvas, sandalId);

stage.onResize(() => {
  floor = renderFloor(stage.width, stage.height, stage.dpr);
  roaches.resize(stage.width, stage.height);
});

let debug = null;
let last = performance.now();
let lastShake = '';
function frame(ms) {
  requestAnimationFrame(frame); // first, so one bad frame can't stop the game
  const dt = Math.min(0.1, Math.max(0, (ms - last) / 1000));
  last = ms;
  const t = now();
  const workStart = performance.now();
  const { ctx, width, height, dpr } = stage;

  sandal.update(dt);
  roaches.update(t, dt, sandal.position);
  effects.update(t, dt);

  const [sx, sy] = effects.shakeOffset(t);
  const shake = sx || sy ? `translate(${sx}px, ${sy}px)` : '';
  if (shake !== lastShake) { stage.canvas.style.transform = shake; lastShake = shake; }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (floor) ctx.drawImage(floor, 0, 0, width, height);
  else ctx.clearRect(0, 0, width, height);
  effects.drawUnder(ctx, dpr, t);
  roaches.draw(ctx, dpr, t, sandal.position);
  effects.drawOver(ctx, dpr, t);
  sandal.draw(ctx, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (debug) debug.tick(performance.now() - workStart);
}
requestAnimationFrame(frame);

// --- Backend: sign in, sync the clock, then the panels, smashing and live updates. ---

const retry = { label: 'Try again', onClick: () => location.reload() };

// Connection problems get the banner (they last); anything else a toast.
function reportError(err) {
  if (err.code === 'paused') banner.show('paused', err.message, retry);
  else if (err.code === 'offline' || !navigator.onLine) banner.show('offline', MESSAGES.offline);
  else toast.show(err.message || 'Something went wrong. Try again.');
}

let backend;
try {
  backend = await connectBackend();
} catch (err) {
  if (err.code === 'paused' || err.code === 'offline') reportError(err);
  else banner.show('connect', err.message || 'Could not connect. Reload the page to try again.', retry);
  throw err;
}
setServerOffset(backend.clockOffset ?? 0);

const confirm = createConfirmDialog(ui);
// Order matters for Tab: top left, top right, then bottom left and right.
const releasePanel = createReleasePanel(ui, {
  backend, confirm, reportError,
  getMine: () => roaches.ownedBy(backend.getUserId()),
});
createSandalPicker(ui, {
  current: sandalId,
  onChange(id) {
    sandal.setSandal(id);
    savePref('sandal', id);
  },
});
const hallOfFame = createHallOfFame(ui, { backend });
createSoundToggle(ui, {
  muted: sound.muted,
  onChange(muted) {
    sound.setMuted(muted);
    savePref('sound', muted ? 'off' : 'on');
  },
});
const card = createComplaintCard(ui);
const finalMessage = createFinalMessage(ui, {
  onSaveName: async (id, name) => {
    await backend.set_finisher_name(id, name);
    hallOfFame.refresh();
  },
});
// Escape with focus outside any panel (e.g. after clicking the floor) still closes things.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  card.hide();
  releasePanel.close({ refocus: false });
  hallOfFame.close({ refocus: false });
});

// The whole floor from a fresh read: add or update every row, drop the ones that are gone.
function resetFloor(rows) {
  const t = now();
  const alive = new Set(rows.map((r) => r.id));
  for (const r of roaches.all()) if (r.status === 'alive' && !alive.has(r.id)) roaches.remove(r.id);
  roaches.setRows(rows, t);
  releasePanel.refresh();
}

let lastScuttle = 0;
backend.subscribe((event) => {
  if (event.type === 'RESET') { resetFloor(event.rows); return; }
  const { type, row } = event;
  if (type === 'DELETE') roaches.remove(row.id);
  else {
    const isNew = type === 'INSERT' && !roaches.get(row.id);
    roaches.upsert(row, now());
    // A new cockroach scuttles in; one sound even if many arrive together.
    if (isNew && performance.now() - lastScuttle > 400) { lastScuttle = performance.now(); sound.play('scuttle'); }
  }
  releasePanel.refresh();
  if (row.status === 'exterminated') hallOfFame.refresh();
});
backend.listRoaches().then(resetFloor, reportError);

// Offline and back: only matters with a real server.
if (backend.kind === 'supabase') {
  if (!navigator.onLine) banner.show('offline', MESSAGES.offline);
  window.addEventListener('offline', () => banner.show('offline', MESSAGES.offline));
  window.addEventListener('online', () => {
    banner.hide('offline');
    toast.show('Back online');
    backend.listRoaches().then(resetFloor, reportError); // catch up on what was missed
  });
}

createSmashing({
  canvas: stage.canvas, roaches, sandal, effects, sound, backend,
  ui: { showCard: card.show, hideCard: card.hide, showFinal: finalMessage.show, toast: toast.show, reportError },
});

if (isDebug()) {
  const fake = backend.debug; // test helpers exist only in the fake backend
  debug = createDebugOverlay(ui, {
    status: () => `${backend.kind} · ${roaches.count} roaches · user ${backend.getUserId().slice(0, 4)}`,
    actions: fake ? [
      ['Switch user', () => {
        toast.show(`You are now user ${fake.switchUser().slice(0, 4)}`);
        releasePanel.refresh();
      }],
      ['Respawn all', () => fake.respawnAll()],
      ['−10', () => fake.removeNewest(10)],
      ['+10', () => fake.spawn(10)],
      ['+50', () => fake.spawn(50)],
    ] : [],
  });
  window.cockroachDebug = { roaches, backend, sound }; // for poking at from the console
}
