// Sampled acoustic kit (Big Rusty Drums by Karoryfer Samples, CC0) shaped
// towards a damped, warm 70s sound: shortened drum decays, rolled-off top,
// tape-style saturation, bus compression and a short dark room.
//
// Each hit picks a velocity layer and one of several alternating takes, so
// repeated notes never sound identical.

const SAMPLE_ROOT = 'samples/';

// level: mix trim           close/oh: microphone blend
// maxLen: seconds kept      damp: [hold, decay time constant] towel-style damping / shortened ring
// room: reverb send         lowpass: per-voice tone (Hz)
// pan: close-mic position, -1 left .. 1 right, from the drummer's seat (matches the overheads)
// samples: borrow another voice's recordings   rate: playback speed (below 1 = lower and longer)
// sustain: [from s, dB per s, max dB] lifts the tail so the cymbal decays more slowly
const VOICES = {
  kick:      { level: 1.0,  close: 1.0, oh: 0.45, maxLen: 1.0, damp: [0.09, 0.11], room: 0.05, lowpass: 6500, pan: 0 },
  snare:     { level: 1.9,  close: 1.0, oh: 0.8,  maxLen: 1.2, damp: [0.07, 0.11], room: 0.24, lowpass: 8500, pan: -0.05 },
  rim:       { level: 2.6,  close: 1.0, oh: 0.7,  maxLen: 0.8, damp: [0.05, 0.08], room: 0.26, pan: -0.05 },
  hatClosed: { level: 0.54, close: 1.0, oh: 0.55, maxLen: 0.5, damp: [0.05, 0.06], room: 0.03, pan: -0.45 },
  hatOpen:   { level: 0.5,  close: 1.0, oh: 0.55, maxLen: 1.2, damp: [0.18, 0.18], room: 0.03, pan: -0.45 },
  tomHigh:   { level: 0.85, close: 1.0, oh: 0.7,  maxLen: 1.8, damp: [0.1, 0.16], room: 0.2, pan: -0.25 },
  tomMid:    { level: 0.95, close: 1.0, oh: 0.7,  maxLen: 1.8, damp: [0.1, 0.18], room: 0.2, pan: 0.15 },
  tomLow:    { level: 0.72, close: 1.0, oh: 0.7,  maxLen: 1.8, damp: [0.12, 0.2], room: 0.18, pan: 0.45 },
  ride:      { level: 0.4, close: 1.0, oh: 0.4,  maxLen: 5.0, damp: [1.1, 1.5], room: 0.04, pan: 0.5 },
  crash:     { level: 0.6, close: 1.0, oh: 0.3,  maxLen: 3.0, damp: [0.35, 0.5], room: 0.03, pan: -0.4 },
  // The slow-groove crash: the same cymbal played lower and left to hang over the bar
  crashLong: { level: 0.45,close: 1.0, oh: 0.8,  maxLen: 8.0, damp: [3.5, 1.5], room: 0.05, lowpass: 7000, pan: -0.4, samples: 'crash', rate: 0.6, sustain: [0.25, 5, 10] },
  // Second cymbal: a 17" sizzle crash on the drummer's right. Its rivets keep it ringing on their own.
  crash2:     { level: 0.25, close: 1.0, oh: 0.3,  maxLen: 3.5, damp: [0.5, 0.6], room: 0.03, pan: 0.3 },
  crashLong2: { level: 0.26,close: 1.0, oh: 0.8,  maxLen: 8.0, damp: [3.5, 1.5], room: 0.05, lowpass: 7000, pan: 0.3, samples: 'crash2', rate: 0.65, sustain: [0.25, 4, 8] },
};

// Voices the electronic patterns use that a drum kit doesn't have
const ALIAS = { clap: ['snare', 0.9], cowbell: ['rim', 0.9] };

const LAYER_CURVE = 1.2;   // how velocity spreads across the sampled layers
const LEVEL_LIFT = 0.15;   // lifts quiet layers a little so ghost notes stay audible
const FADE_OUT = 0.05;

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

/** A short, dark room: a few early reflections and a fast filtered-noise tail. */
function roomImpulse(ctx, seconds = 0.5, rt60 = 0.38) {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  const early = [[0.007, 0.5], [0.011, -0.42], [0.017, 0.36], [0.023, -0.3], [0.031, 0.24]];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      lp += (Math.random() * 2 - 1 - lp) * 0.3;
      d[i] = t < 0.012 ? 0 : lp * Math.exp((-6.9 * t) / rt60);
    }
    for (const [t, amp] of early) d[Math.floor((t + ch * 0.0013) * sr)] += amp * 0.25;
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
    const norm = 1 / Math.sqrt(energy);
    for (let i = 0; i < len; i++) d[i] *= norm;
  }
  return buf;
}

/** Blend the mono close mic and stereo overheads into one trimmed stereo buffer. */
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function mixTake(ctx, close, oh, spec) {
  const sr = close.sampleRate;
  const len = Math.min(close.length, oh.length, Math.floor(spec.maxLen * sr));
  const out = ctx.createBuffer(2, len, sr);
  const c = close.getChannelData(0);
  const fade = Math.floor(FADE_OUT * sr);
  let lift = null;
  if (spec.sustain) {
    const [from, dbPerSec, maxDb] = spec.sustain;
    lift = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const db = Math.min(maxDb, Math.max(0, i / sr - from) * dbPerSec);
      lift[i] = 10 ** (db / 20);
    }
  }
  // Equal-power pan of the mono close mic; unity gain in the centre.
  const angle = ((clamp(spec.pan ?? 0, -1, 1) + 1) * Math.PI) / 4;
  const closeGain = [Math.cos(angle) * Math.SQRT2 * spec.close, Math.sin(angle) * Math.SQRT2 * spec.close];
  let peak = 0;
  for (let ch = 0; ch < 2; ch++) {
    const o = oh.getChannelData(Math.min(ch, oh.numberOfChannels - 1));
    const d = out.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const tail = (i > len - fade ? (len - i) / fade : 1) * (lift ? lift[i] : 1);
      d[i] = (c[i] * closeGain[ch] + o[i] * spec.oh) * tail;
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  return { buffer: out, peak };
}

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @returns {{ trigger(voice: string, time: number, vel: number): void, ready: Promise<void> }}
 */
export function createAcousticKit(ctx, out) {
  // --- kit bus: tone -> saturation -> glue compression -------------------------
  const bus = ctx.createGain();
  bus.gain.value = 0.42;

  const warmth = ctx.createBiquadFilter();
  warmth.type = 'peaking';
  warmth.frequency.value = 170;
  warmth.Q.value = 0.8;
  warmth.gain.value = 2.5;

  const boxCut = ctx.createBiquadFilter();
  boxCut.type = 'peaking';
  boxCut.frequency.value = 420;
  boxCut.Q.value = 1.1;
  boxCut.gain.value = -2.5;

  const top = ctx.createBiquadFilter();
  top.type = 'highshelf';
  top.frequency.value = 8000;
  top.gain.value = -5;

  const tape = ctx.createWaveShaper();
  tape.curve = softClipCurve(1.5);
  tape.oversample = '2x';

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -10;
  glue.knee.value = 6;
  glue.ratio.value = 2;
  glue.attack.value = 0.012;
  glue.release.value = 0.14;

  const makeup = ctx.createGain();
  makeup.gain.value = 1.35;

  bus.connect(warmth).connect(boxCut).connect(top).connect(tape).connect(glue).connect(makeup).connect(out);

  // --- room -----------------------------------------------------------------------
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const roomTone = ctx.createBiquadFilter();
  roomTone.type = 'lowpass';
  roomTone.frequency.value = 5200;
  const roomLevel = ctx.createGain();
  roomLevel.gain.value = 0.9;
  room.connect(roomTone).connect(roomLevel).connect(bus);

  // --- per-voice strips --------------------------------------------------------------
  const strips = {};
  for (const [name, spec] of Object.entries(VOICES)) {
    const input = ctx.createGain();
    input.gain.value = spec.level;
    let tail = input;
    if (spec.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = spec.lowpass;
      lp.Q.value = 0.5;
      input.connect(lp);
      tail = lp;
    }
    tail.connect(bus);
    const send = ctx.createGain();
    send.gain.value = spec.room;
    tail.connect(send).connect(room);
    strips[name] = input;
  }

  // --- samples ------------------------------------------------------------------------
  /** @type {Record<string, { takes: { buffer: AudioBuffer }[], lift: number, last: number }[]>} */
  const kit = {};

  async function load() {
    const manifest = await (await fetch(SAMPLE_ROOT + 'manifest.json')).json();
    const decode = async (path) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(SAMPLE_ROOT + path);
          if (!res.ok) throw new Error(`sample ${path}: ${res.status}`);
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch (err) {
          if (attempt >= 3) throw err;
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    };
    await Promise.all(Object.entries(VOICES).map(async ([voice, spec]) => {
      const layers = manifest[spec.samples ?? voice];
      if (!layers) return;
      const loaded = await Promise.all(layers.map(async (takes) => {
        const mixed = await Promise.all(takes.map(async (take) => {
          const [close, oh] = await Promise.all([decode(take.close), decode(take.oh)]);
          return mixTake(ctx, close, oh, spec);
        }));
        return { takes: mixed, peak: Math.max(...mixed.map((m) => m.peak)), lift: 1, last: -1 };
      }));
      const loudest = loaded[loaded.length - 1].peak;
      for (const layer of loaded) layer.lift = Math.pow(loudest / layer.peak, LEVEL_LIFT);
      kit[voice] = loaded;
    }));
  }

  let openHat = null;

  function trigger(voice, time, vel) {
    if (ALIAS[voice]) {
      const [target, scale] = ALIAS[voice];
      voice = target;
      vel *= scale;
    }
    const layers = kit[voice];
    if (!layers) return;
    const spec = VOICES[voice];
    vel = Math.min(1, Math.max(0.02, vel));

    // Velocity layer, with a little dither so neighbouring layers blend
    const n = layers.length;
    const pos = Math.pow(vel, LAYER_CURVE) * (n - 1) + (Math.random() - 0.5) * 0.6;
    const idx = Math.min(n - 1, Math.max(0, Math.round(pos)));
    const layer = layers[idx];

    // Alternate takes, never the same one twice in a row
    let take = Math.floor(Math.random() * layer.takes.length);
    if (take === layer.last && layer.takes.length > 1) take = (take + 1) % layer.takes.length;
    layer.last = take;

    // The layer already carries most of the dynamics; trim the remainder.
    const layerVel = Math.pow(Math.max(idx, 0.35) / (n - 1), 1 / LAYER_CURVE);
    const level = layer.lift * Math.min(1.5, Math.max(0.55, vel / layerVel));

    const src = ctx.createBufferSource();
    src.buffer = layer.takes[take].buffer;
    src.playbackRate.value = (spec.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.008);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, time);
    src.connect(g).connect(strips[voice]);
    src.start(time);

    if (spec.damp) {
      const [hold, tc] = spec.damp;
      g.gain.setTargetAtTime(0, time + hold, tc);
      src.stop(time + hold + tc * 7);
    }

    if (voice === 'hatClosed' || voice === 'hatOpen') {
      if (openHat) openHat.gain.setTargetAtTime(0, time, 0.012);
      openHat = voice === 'hatOpen' ? g : null;
    }
  }

  return { trigger, ready: load() };
}
