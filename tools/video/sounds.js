// The showcase video's UI sounds: taps, the phone's buzz, the stop card's
// flags, salamat arriving, the ticket, a purchase, the switch, and the
// swipes between scenes. Each is made here from sine waves and noise, so
// there is nothing to license and nothing to download; render.js records
// when each happened on screen, and mix() lays them on one track.
//
// Only the interface's sounds. Music, the bus's engine and the street are
// for whoever edits the video, over or under this track, which is also
// written on its own (bus-tracker-ui-sounds.wav) so it can be turned down.
'use strict';

const RATE = 48000;

// A seeded noise, so the same render makes the same track.
function noise(seed){
  let x = seed >>> 0 || 1;
  return function(){ x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) / 4294967296) * 2 - 1; };
}
// A buffer of len seconds, filled by f(t, i).
function make(len, f){
  const n = Math.round(len * RATE), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f(i / RATE, i);
  return out;
}
const TAU = Math.PI * 2;
const decay = (t, k) => Math.exp(-t / k);
const attack = (t, k) => t < k ? t / k : 1;
// A struck bell: a few partials, each dying away, the higher ones sooner.
function bell(t, f, k, partials){
  let s = 0;
  partials.forEach(function(p){ s += p[1] * Math.sin(TAU * f * p[0] * t) * decay(t, k / p[0]); });
  return s * attack(t, .004);
}
// One pole low-pass, to take the edge off noise.
function lowpass(buf, cut){
  const a = Math.exp(-TAU * cut / RATE);
  let y = 0;
  for (let i = 0; i < buf.length; i++){ y = (1 - a) * buf[i] + a * y; buf[i] = y; }
  return buf;
}
// A band of noise whose centre moves from f0 to f1: a two-pole resonator.
function sweptNoise(len, f0, f1, q, seed){
  const r = noise(seed), n = Math.round(len * RATE), out = new Float32Array(n);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++){
    const u = i / n, f = f0 * Math.pow(f1 / f0, u), w = TAU * f / RATE;
    const rad = Math.exp(-w / (2 * q)), b1 = 2 * rad * Math.cos(w), b2 = -rad * rad;
    const y = r() * (1 - rad) + b1 * y1 + b2 * y2;
    y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

const SOUNDS = {
  // A finger on glass: a short, soft click.
  tap: function(){
    const r = noise(7);
    return make(.06, function(t){ return .5 * Math.sin(TAU * 1650 * t) * decay(t, .011) + .35 * r() * decay(t, .0025); });
  },
  // The phone buzzing to the app's own pattern: on, off, on, in ms.
  buzz: function(o){
    const pattern = o.pattern || [180, 90, 180];
    const total = pattern.reduce(function(s, x){ return s + x; }, 0) / 1000 + .03;
    const r = noise(11);
    const buf = make(total, function(t){
      let acc = 0, on = false, edge = 1;
      for (let i = 0; i < pattern.length; i++){
        const len = pattern[i] / 1000;
        if (t >= acc && t < acc + len){ on = i % 2 === 0; edge = Math.min(1, (t - acc) / .006, (acc + len - t) / .006); break; }
        acc += len;
      }
      if (!on) return 0;
      const f = 168;
      const body = Math.sign(Math.sin(TAU * f * t)) * .5 + Math.sin(TAU * 2 * f * t) * .35 + r() * .18;
      return body * edge * (.85 + .15 * Math.sin(TAU * 31 * t));
    });
    return lowpass(buf, 1400);
  },
  // "Malapit na!" coming up on the card: a quick rising pop.
  pop: function(){
    let ph = 0;
    return make(.2, function(t){
      const f = 480 + 820 * (1 - decay(t, .028));
      ph += TAU * f / RATE;
      return (Math.sin(ph) + .25 * Math.sin(2 * ph)) * decay(t, .05) * attack(t, .002);
    });
  },
  // "Sakay na!" and "Bababa na!": two bright bell notes, up a fifth.
  chime: function(){
    const P = [[1, 1], [2, .28], [3, .1]];
    return make(1.1, function(t){
      return .6 * bell(t, 784, .32, P) + (t > .12 ? .6 * bell(t - .12, 1175, .38, P) : 0);
    });
  },
  // Sharing goes live: the same bells, gentler and lower.
  start: function(){
    const P = [[1, 1], [2, .22]];
    return make(1, function(t){
      return .5 * bell(t, 659, .3, P) + (t > .1 ? .5 * bell(t - .1, 988, .35, P) : 0);
    });
  },
  // Salamat arriving: three quick high notes and a little shimmer.
  sparkle: function(){
    const P = [[1, 1], [2.01, .2]], r = noise(5);
    return make(.75, function(t){
      let s = 0;
      [[0, 1319], [.07, 1760], [.14, 2349]].forEach(function(n){ if (t > n[0]) s += .35 * bell(t - n[0], n[1], .16, P); });
      return s + .04 * r() * decay(t, .2) * attack(t, .05);
    });
  },
  // The ticket coming out: a printer's ticks over a small motor, then paper.
  ticket: function(){
    const r = noise(3);
    const ticks = make(.42, function(t){
      const k = (t % .028) / .028;
      return (k < .2 ? r() * (1 - k / .2) : 0) * .55 + .12 * Math.sin(TAU * 210 * t) * attack(t, .03);
    });
    const slide = sweptNoise(.32, 900, 3200, 1.2, 9);
    const out = new Float32Array(ticks.length + Math.round(.12 * RATE) + slide.length);
    out.set(ticks, 0);
    for (let i = 0; i < slide.length; i++) out[ticks.length + Math.round(.05 * RATE) + i] += slide[i] * .9 * Math.sin(Math.PI * i / slide.length);
    return out;
  },
  // Keep: a soft stamp.
  stamp: function(){
    const r = noise(13);
    let ph = 0;
    return make(.3, function(t){
      const f = 150 * Math.pow(.5, t / .1);
      ph += TAU * f / RATE;
      return Math.sin(ph) * decay(t, .07) * .9 + r() * decay(t, .004) * .4;
    });
  },
  // A sheet opening (My tickets): a short airy swish.
  open: function(){
    const s = sweptNoise(.26, 500, 2600, 1.5, 21);
    for (let i = 0; i < s.length; i++) s[i] *= Math.pow(Math.sin(Math.PI * i / s.length), 2) * 1.6;
    return s;
  },
  // Coins for the paint: two bright, slightly bent notes, the ring of metal.
  coins: function(){
    const P = [[1, 1], [2.76, .35], [5.4, .15]];
    return make(.9, function(t){
      return .45 * bell(t, 1976, .22, P) + (t > .085 ? .45 * bell(t - .085, 2637, .3, P) : 0);
    });
  },
  // The show switch going on: two clicks, the second higher.
  switch: function(){
    const r = noise(17);
    return make(.14, function(t){
      const c = function(u, f){ return u < 0 ? 0 : .5 * Math.sin(TAU * f * u) * decay(u, .008) + .25 * r() * decay(u, .002); };
      return c(t, 1150) + c(t - .055, 1700);
    });
  },
  // Between scenes: air going past.
  whoosh: function(){
    const s = sweptNoise(.42, 260, 2200, .9, 29);
    for (let i = 0; i < s.length; i++) s[i] *= Math.pow(Math.sin(Math.PI * i / s.length), 2) * 1.4;
    return s;
  },
  // The route board lighting up: a soft chord swelling in.
  board: function(){
    return make(1.4, function(t){
      const env = attack(t, .35) * decay(Math.max(0, t - .35), .5);
      return env * (.35 * Math.sin(TAU * 330 * t) + .25 * Math.sin(TAU * 495 * t) + .18 * Math.sin(TAU * 660 * t) +
                    .06 * Math.sin(TAU * 990 * t) * (1 + Math.sin(TAU * 6 * t)) / 2);
    });
  },
  // The end card: a warm rising arpeggio.
  outro: function(){
    const P = [[1, 1], [2, .25], [3, .08]];
    return make(2, function(t){
      let s = 0;
      [[0, 523], [.1, 659], [.2, 784], [.3, 1047]].forEach(function(n){ if (t > n[0]) s += .32 * bell(t - n[0], n[1], .6, P); });
      return s;
    });
  }
};
// How loud each sits in the mix, under music someone else will add.
const LEVEL = { tap:.45, buzz:.55, pop:.6, chime:.55, start:.45, sparkle:.5, ticket:.5, stamp:.7, open:.3,
                coins:.5, switch:.5, whoosh:.32, board:.45, outro:.55 };

// Every event, { t (seconds), kind, pattern for a buzz }, on one track of
// seconds length, peaking at -3 dBFS.
function mix(events, seconds){
  const out = new Float32Array(Math.ceil(seconds * RATE));
  events.forEach(function(e){
    if (!SOUNDS[e.kind]) throw new Error('no sound called ' + e.kind);
    const s = SOUNDS[e.kind](e), at = Math.round(e.t * RATE);
    // Each sound at the same peak first, so LEVEL alone says how loud it is.
    let p = 0;
    for (let i = 0; i < s.length; i++) p = Math.max(p, Math.abs(s[i]));
    const g = LEVEL[e.kind] * (e.gain || 1) / (p || 1);
    for (let i = 0; i < s.length && at + i < out.length; i++) if (at + i >= 0) out[at + i] += s[i] * g;
  });
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const k = peak > 0 ? .708 / peak : 1;
  for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}
// 16-bit stereo WAV, the same in both ears.
function wav(samples){
  const n = samples.length, data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++){
    const v = Math.max(-1, Math.min(1, samples[i])) * 32767 | 0;
    data.writeInt16LE(v, i * 4); data.writeInt16LE(v, i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

module.exports = { SOUNDS, mix, wav, RATE };
