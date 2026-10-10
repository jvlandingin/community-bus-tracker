'use strict';
// The demo videos' sound: interface sounds only, made here from sine waves
// and noise, and laid under the picture by tools/render-demo.js.
//
// The director notes a cue at the frame where something happens (a tap,
// a key, the wipe, the counter flipping, the board slamming in), so every
// sound sits on the frame of the thing it belongs to, by construction
// rather than by ear. Nothing is recorded or downloaded, so there is no
// licence to track and nothing to fetch, and the same cues make the same
// track on every run: the noise comes from a seeded generator.
//
// There is no music. A track under the whole video is the one thing a
// person posting it can choose better than a script, and these sounds are
// kept quiet and short so that one can go on top.

const RATE = 48000;

// ---- Small instruments ---------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
}
function buf(sec) { return new Float32Array(Math.ceil(sec * RATE)); }
// A sine whose pitch glides from f0 to f1, with an exponential decay.
function tone(out, at, o) {
  const n = Math.ceil((o.len || 0.3) * RATE), start = Math.round(at * RATE);
  let ph = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / RATE, f = o.f0 + (o.f1 === undefined ? 0 : (o.f1 - o.f0) * Math.min(1, t / (o.glide || o.len || 0.3)));
    ph += 2 * Math.PI * f / RATE;
    const attack = Math.min(1, t / (o.attack || 0.002));
    out[start + i] += Math.sin(ph) * (o.gain || 0.3) * attack * Math.exp(-t / (o.decay || 0.08));
  }
}
// A bell: a sine and its inharmonic partial, the way a small chime rings.
function bell(out, at, f, gain, decay) {
  tone(out, at, { f0: f, len: decay * 5, gain, decay, attack: 0.004 });
  tone(out, at, { f0: f * 2.76, len: decay * 3, gain: gain * 0.28, decay: decay * 0.45, attack: 0.002 });
}
// Noise through a band-pass whose centre moves from c0 to c1, under an
// envelope: a whoosh when the band rises, a click when it is short.
function noise(out, at, o, rand) {
  const n = Math.ceil(o.len * RATE), start = Math.round(at * RATE);
  let low = 0, band = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const p = i / n, c = o.c0 + (o.c1 - o.c0) * p;
    const f = 2 * Math.sin(Math.PI * Math.min(c, RATE / 6) / RATE), q = o.q || 0.7;
    const x = rand();
    low += f * band; const high = x - low - q * band; band += f * high;
    const env = o.shape === 'swell' ? Math.pow(Math.sin(Math.PI * p), 2) : Math.exp(-p * (o.sharp || 6));
    out[start + i] += band * env * o.gain;
  }
}

// ---- The sounds, one per kind of cue ---------------------------------------
const SOUNDS = {
  // a finger on glass: a short bright tick over a soft body
  tap(out, at, r) {
    tone(out, at, { f0: 1700, f1: 1300, len: 0.05, gain: 0.22, decay: 0.012 });
    tone(out, at, { f0: 210, len: 0.08, gain: 0.18, decay: 0.025 });
    noise(out, at, { len: 0.02, c0: 4000, c1: 3000, gain: 0.25, sharp: 9 }, r);
  },
  key(out, at, r) {
    tone(out, at, { f0: 2200 + r() * 250, len: 0.03, gain: 0.08, decay: 0.008 });
    noise(out, at, { len: 0.015, c0: 5000, c1: 4000, gain: 0.12, sharp: 9 }, r);
  },
  // the livery stripes crossing the frame
  whoosh(out, at, r) { noise(out, at, { len: 0.62, c0: 260, c1: 2400, gain: 0.55, shape: 'swell', q: 0.5 }, r); },
  whooshOut(out, at, r) { noise(out, at, { len: 0.55, c0: 2000, c1: 300, gain: 0.38, shape: 'swell', q: 0.5 }, r); },
  // a headline arriving, and the camera moving in
  swish(out, at, r) { noise(out, at, { len: 0.32, c0: 900, c1: 3200, gain: 0.16, shape: 'swell', q: 0.6 }, r); },
  drift(out, at, r) { noise(out, at, { len: 0.8, c0: 180, c1: 700, gain: 0.12, shape: 'swell', q: 0.5 }, r); },
  // a callout or a ring popping on
  pop(out, at) {
    tone(out, at, { f0: 620, f1: 1180, glide: 0.06, len: 0.14, gain: 0.2, decay: 0.05 });
  },
  // a split-flap card falling
  flap(out, at, r) {
    noise(out, at, { len: 0.012, c0: 3200, c1: 2500, gain: 0.5, sharp: 8 }, r);
    tone(out, at, { f0: 950, len: 0.03, gain: 0.1, decay: 0.008 });
    noise(out, at + 0.045, { len: 0.016, c0: 2400, c1: 1800, gain: 0.35, sharp: 8 }, r);
  },
  // the LED board slamming in: a thump, and the board lighting up
  slam(out, at, r) {
    tone(out, at, { f0: 120, f1: 55, glide: 0.12, len: 0.4, gain: 0.55, decay: 0.12 });
    noise(out, at, { len: 0.06, c0: 1800, c1: 600, gain: 0.35, sharp: 7 }, r);
    for (const [f, d] of [[1047, 0.03], [1319, 0.06], [1568, 0.09]]) bell(out, at + d, f, 0.07, 0.22);
  },
  sparkle(out, at) {
    [1568, 1760, 2093, 2349, 2637, 3136].forEach((f, i) => bell(out, at + 0.05 + i * 0.045, f, 0.05, 0.12));
  },
  // the chip that says a stretch is sped up or skipped
  tick(out, at) {
    tone(out, at, { f0: 1400, len: 0.05, gain: 0.12, decay: 0.012 });
    tone(out, at + 0.07, { f0: 1900, len: 0.05, gain: 0.12, decay: 0.012 });
  },
  // salamat, sent
  chime(out, at) { bell(out, at, 1319, 0.16, 0.16); bell(out, at + 0.12, 1976, 0.14, 0.2); },
  // the ticket sliding up: paper, then a small fanfare
  ticket(out, at, r) {
    noise(out, at, { len: 0.38, c0: 2500, c1: 5000, gain: 0.16, shape: 'swell', q: 0.9 }, r);
    [1047, 1319, 1568, 2093].forEach((f, i) => bell(out, at + 0.25 + i * 0.09, f, 0.1, 0.18));
  },
  // the cover and the close
  chord(out, at) { [523, 659, 784, 1047].forEach((f, i) => bell(out, at + i * 0.07, f, 0.09, 0.45)); }
};

// Every cue, {t, kind}, laid on one track `seconds` long, as a 48 kHz
// 16-bit stereo WAV.
function synth(cues, seconds) {
  const out = buf(seconds + 1), r = rng(20261012);
  for (const c of cues) {
    const s = SOUNDS[c.kind];
    if (!s) throw new Error('no sound called ' + c.kind);
    s(out, c.t, r);
  }
  const n = Math.ceil(seconds * RATE);
  const wav = Buffer.alloc(44 + n * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 4, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    // a soft limiter, so stacked sounds round off instead of clipping
    const v = Math.round(Math.tanh(out[i] * 1.1) * 0.89 * 32767);
    wav.writeInt16LE(v, 44 + i * 4); wav.writeInt16LE(v, 46 + i * 4);
  }
  return wav;
}

module.exports = { synth, SOUNDS, RATE };
