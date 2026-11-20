// Synthesised drum machine voices, modelled loosely on the analog classics
// (808-style kick/snare/toms/cowbell, 606/808-style metallic hats).
// Everything is built from oscillators, noise and filters. Nearly dry.

const METAL_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800]; // 808 cymbal oscillator bank

function makeNoise(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function softClipCurve(k) {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Percussive envelope: fast attack, exponential decay to silence. */
function perc(param, t, peak, decay, attack = 0.001) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/**
 * @param {AudioContext} ctx
 * @param {AudioNode} out
 */
export function createElectronicKit(ctx, out) {
  const noiseBuf = makeNoise(ctx);

  // Kit bus: gentle saturation for warmth and glue.
  const bus = ctx.createGain();
  bus.gain.value = 0.8;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.4);
  drive.oversample = '2x';
  bus.connect(drive).connect(out);

  // Always-running metallic oscillator bank shared by hats and cymbals.
  const metal = ctx.createGain();
  metal.gain.value = 1 / METAL_FREQS.length;
  for (const f of METAL_FREQS) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(metal);
    o.start();
  }
  const hatTone = ctx.createBiquadFilter();
  hatTone.type = 'highpass';
  hatTone.frequency.value = 7200;
  hatTone.Q.value = 0.9;
  const hatBand = ctx.createBiquadFilter();
  hatBand.type = 'bandpass';
  hatBand.frequency.value = 10000;
  hatBand.Q.value = 0.6;
  metal.connect(hatBand).connect(hatTone);

  const cymTone = ctx.createBiquadFilter();
  cymTone.type = 'highpass';
  cymTone.frequency.value = 3800;
  cymTone.Q.value = 0.5;
  metal.connect(cymTone);

  const rideTone = ctx.createBiquadFilter();
  rideTone.type = 'bandpass';
  rideTone.frequency.value = 6200;
  rideTone.Q.value = 1.4;
  metal.connect(rideTone);

  let openHatChoke = null; // GainNode of the currently ringing open hat

  // --- helpers -------------------------------------------------------------

  function osc(type, t, stopAt) {
    const o = ctx.createOscillator();
    o.type = type;
    o.start(t);
    o.stop(stopAt);
    return o;
  }

  function noise(t, stopAt) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    n.start(t, Math.random() * 1.5);
    n.stop(stopAt);
    return n;
  }

  function filter(type, freq, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  /** Gate a shared, always-running source; cleans itself up afterwards. */
  function gated(source, t, peak, decay, attack = 0.001) {
    const g = ctx.createGain();
    g.gain.value = 0;
    perc(g.gain, t, peak, decay, attack);
    source.connect(g);
    const ms = (t - ctx.currentTime + attack + decay + 0.1) * 1000;
    setTimeout(() => { source.disconnect(g); g.disconnect(); }, ms);
    return g;
  }

  function chokeOpenHat(t) {
    if (!openHatChoke) return;
    openHatChoke.gain.setValueAtTime(1, t);
    openHatChoke.gain.linearRampToValueAtTime(0, t + 0.012);
    openHatChoke = null;
  }

  // --- voices --------------------------------------------------------------

  function kick(t, v) {
    const end = t + 0.8;
    const o = osc('sine', t, end);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(43, t + 0.6);
    const g = ctx.createGain();
    perc(g.gain, t, v, 0.4 + 0.3 * v, 0.002);
    o.connect(g).connect(bus);

    // Beater click
    const n = noise(t, t + 0.03);
    const ng = ctx.createGain();
    perc(ng.gain, t, 0.22 * v, 0.012, 0.0005);
    n.connect(filter('lowpass', 2600)).connect(ng).connect(bus);
  }

  function snare(t, v) {
    const end = t + 0.35;
    const body = ctx.createGain();
    perc(body.gain, t, 0.5 * v, 0.11);
    for (const [f, amt] of [[186, 1], [332, 0.55]]) {
      const o = osc('triangle', t, end);
      o.frequency.setValueAtTime(f * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.025);
      const og = ctx.createGain();
      og.gain.value = amt;
      o.connect(og).connect(body);
    }
    body.connect(bus);

    const n = noise(t, end);
    const ng = ctx.createGain();
    perc(ng.gain, t, 0.55 * v, 0.16 + 0.08 * v);
    n.connect(filter('highpass', 1500)).connect(filter('lowpass', 9000)).connect(ng).connect(bus);
  }

  function clap(t, v) {
    const end = t + 0.5;
    const n = noise(t, end);
    const g = ctx.createGain();
    const peak = 1.3 * v;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const bt = t + i * 0.0105;
      g.gain.setValueAtTime(peak, bt);
      g.gain.exponentialRampToValueAtTime(peak * 0.15, bt + 0.009);
    }
    const tail = t + 0.032;
    g.gain.setValueAtTime(peak * 0.8, tail);
    g.gain.exponentialRampToValueAtTime(0.0001, tail + 0.28);
    n.connect(filter('bandpass', 1150, 1.3)).connect(filter('highpass', 600)).connect(g).connect(bus);
  }

  function rim(t, v) {
    const end = t + 0.08;
    const g = ctx.createGain();
    perc(g.gain, t, 0.4 * v, 0.035, 0.0005);
    const a = osc('triangle', t, end);
    a.frequency.value = 1720;
    const b = osc('square', t, end);
    b.frequency.value = 478;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    const hp = filter('highpass', 420);
    a.connect(hp);
    b.connect(bg).connect(hp);
    hp.connect(g).connect(bus);
  }

  function tom(freq) {
    return (t, v) => {
      const end = t + 0.6;
      const o = osc('sine', t, end);
      o.frequency.setValueAtTime(freq * 1.7, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(freq * 0.9, t + 0.5);
      const g = ctx.createGain();
      perc(g.gain, t, 0.75 * v, 0.38, 0.002);
      o.connect(g).connect(bus);
    };
  }

  function hatClosed(t, v) {
    chokeOpenHat(t);
    gated(hatTone, t, 0.75 * v, 0.045 + 0.03 * v).connect(bus);
  }

  function hatOpen(t, v) {
    chokeOpenHat(t);
    const choke = ctx.createGain();
    gated(hatTone, t, 0.7 * v, 0.42, 0.002).connect(choke).connect(bus);
    openHatChoke = choke;
    setTimeout(() => {
      choke.disconnect();
      if (openHatChoke === choke) openHatChoke = null;
    }, (t - ctx.currentTime + 0.7) * 1000);
  }

  function ride(t, v) {
    gated(rideTone, t, 0.55 * v, 0.7, 0.001).connect(bus);
    gated(hatTone, t, 0.25 * v, 0.05).connect(bus); // stick ping
  }

  function crash(t, v) {
    gated(cymTone, t, 0.6 * v, 1.7, 0.002).connect(bus);
    const n = noise(t, t + 1.4);
    const ng = ctx.createGain();
    perc(ng.gain, t, 0.22 * v, 1.1, 0.002);
    n.connect(filter('highpass', 6500)).connect(ng).connect(bus);
  }

  function cowbell(t, v) {
    const end = t + 0.45;
    const g = ctx.createGain();
    const peak = 0.2 * v;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.001);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const bp = filter('bandpass', 2640, 1.2);
    for (const f of [540, 800]) {
      const o = osc('square', t, end);
      o.frequency.value = f;
      o.connect(bp);
    }
    bp.connect(g).connect(bus);
  }

  const voices = {
    kick,
    snare,
    clap,
    rim,
    hatClosed,
    hatOpen,
    ride,
    crash,
    crashLong: crash,
    crash2: crash,
    crashLong2: crash,
    cowbell,
    tomLow: tom(88),
    tomMid: tom(124),
    tomHigh: tom(168),
  };

  return {
    /** @param {string} voice @param {number} time @param {number} vel 0..1 */
    trigger(voice, time, vel) {
      const fn = voices[voice];
      if (fn) fn(time, Math.pow(Math.min(1, Math.max(0, vel)), 1.4));
    },
  };
}
