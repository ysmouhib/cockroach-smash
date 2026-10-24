// Sounds made with the Web Audio API, no files: a smack on a hit, a softer thud
// on a miss, a quick scuttle when a cockroach is released, and a short fanfare
// for the winner. Browsers only allow audio after a user gesture, so the audio
// context is created on the first tap, click or key press.

const VOLUME = 0.55;

export function createSound({ muted = false } = {}) {
  let ctx = null;
  let out = null;
  let noise = null;
  let isMuted = muted;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      out = ctx.createGain();
      out.gain.value = VOLUME;
      out.connect(ctx.destination);
      // One second of white noise, reused by every sound.
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const unlock = () => { if (!isMuted) ensure(); };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // A burst of filtered noise with a fast attack and exponential decay.
  function burst(t, { dur, gain, type = 'lowpass', freq, q = 0.7 }) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // A tone sliding from f0 to f1.
  function tone(t, { dur, gain, f0, f1 = f0, type = 'sine', attack = 0.004 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    smack(t) {
      tone(t, { dur: 0.16, gain: 0.9, f0: 150, f1: 50 });                    // body of the slap
      burst(t, { dur: 0.09, gain: 0.8, freq: 2400 });                       // crack
      burst(t + 0.02, { dur: 0.1, gain: 0.35, type: 'bandpass', freq: 700, q: 1.6 }); // squish
    },
    thud(t) {
      tone(t, { dur: 0.14, gain: 0.45, f0: 95, f1: 45 });
      burst(t, { dur: 0.07, gain: 0.2, freq: 500 });
    },
    scuttle(t) {
      for (let i = 0; i < 16; i++) {
        const at = t + i * 0.032 + Math.random() * 0.012;
        burst(at, { dur: 0.018, gain: 0.08 + Math.random() * 0.1, type: 'bandpass', freq: 3200 + Math.random() * 2500, q: 4 });
      }
    },
    fanfare(t) {
      const notes = [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36]];
      for (const [f, at] of notes) {
        const long = at === 0.36;
        tone(t + at, { dur: long ? 0.6 : 0.16, gain: 0.32, f0: f, type: 'triangle', attack: 0.01 });
        tone(t + at, { dur: long ? 0.6 : 0.16, gain: 0.07, f0: f * 2, type: 'square', attack: 0.01 });
      }
    },
  };

  return {
    play(name) {
      if (isMuted || !ensure()) return;
      SOUNDS[name](ctx.currentTime + 0.005);
    },
    get muted() { return isMuted; },
    setMuted(value) { isMuted = value; },
  };
}
