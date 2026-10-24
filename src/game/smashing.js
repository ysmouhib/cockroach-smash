// What happens on a click or tap on the floor: the sandal slams, the floor
// shakes, and either a cockroach is squashed at once (then the server is asked)
// or the miss leaves a faint sole print.

import { now } from './clock.js';

const SMASHERS_TO_KILL = 10;

const ERROR_TEXT = {
  too_slow: 'Too slow, someone got it first',
  gone: 'Too slow, that cockroach is already gone',
  not_found: 'Too slow, that cockroach is already gone',
};

// `ui`: { showCard, hideCard, showFinal, toast, reportError }
export function createSmashing({ canvas, roaches, sandal, effects, sound, backend, ui }) {
  // A tap on a touch screen smashes right there; the sandal appears, slams and fades.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    smashAt(e.clientX, e.clientY, e.pointerType === 'touch');
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // long press

  async function smashAt(x, y, touch) {
    const t = now();
    sandal.slam(x, y, touch);
    effects.shake(t);
    const roach = roaches.hitTest(x, y, touch);
    if (!roach) {
      sound.play('thud');
      effects.addPrint(x, y, sandal.tilt, sandal.sandalId, t);
      return;
    }

    sound.play('smack');
    const splat = roaches.squash(roach);
    ui.hideCard();
    try {
      const result = await backend.smash(roach.id);
      const t2 = now();
      roaches.confirmSmash(roach, result, t2);
      if (result.final) {
        sound.play('fanfare');
        effects.burstConfetti(splat.x, splat.y, t2);
        ui.showFinal({
          id: roach.id,
          ownerName: result.owner_name,
          complaint: result.complaint,
          smashCount: result.smash_count,
          needsName: !(result.finisher_name ?? roach.finisher_name), // the Realtime update may arrive later
        });
      } else {
        ui.showCard({
          ownerName: result.owner_name,
          complaint: result.complaint,
          smashCount: result.smash_count,
          total: SMASHERS_TO_KILL,
          x: splat.x,
          y: splat.y,
        });
      }
    } catch (err) {
      roaches.cancelSmash(roach, now());
      if (ERROR_TEXT[err.code]) ui.toast(ERROR_TEXT[err.code]);
      else ui.reportError(err);
    }
  }
}
