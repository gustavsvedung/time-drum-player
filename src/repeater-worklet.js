// Beat repeat, audio side. Records everything that passes through into a ring
// buffer and, when told to, plays back slices of it on top of (or instead of)
// the live signal.
//
// Messages: { type: 'event', segments, ducks }  times in AudioContext seconds
//             segment: { at, len, src, rate, gain }  play the recording from src
//                       at speed rate (negative = reversed) during [at, at + len)
//             duck:    { from, to }  live signal muted in between
//           { type: 'clear' }

const RING_SECONDS = 12;
const FADE_IN = 0.001; // seconds, at the start of every segment and duck, against clicks
const FADE_OUT = 0.003;

class RepeaterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.ceil(RING_SECONDS * sampleRate);
    this.ring = [new Float32Array(this.size), new Float32Array(this.size)];
    this.fadeIn = Math.max(1, Math.round(FADE_IN * sampleRate));
    this.fadeOut = Math.max(1, Math.round(FADE_OUT * sampleRate));
    this.segments = [];
    this.ducks = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === 'clear') {
        this.segments = [];
        this.ducks = [];
      } else if (data.type === 'event') {
        for (const s of data.segments) {
          this.segments.push({
            at: s.at * sampleRate,
            end: (s.at + s.len) * sampleRate,
            src: s.src * sampleRate,
            rate: s.rate,
            gain: s.gain,
          });
        }
        for (const d of data.ducks) this.ducks.push({ from: d.from * sampleRate, to: d.to * sampleRate });
      }
    };
  }

  read(ch, pos) {
    const i = Math.floor(pos);
    const frac = pos - i;
    const ring = this.ring[ch];
    const a = ring[((i % this.size) + this.size) % this.size];
    const b = ring[(((i + 1) % this.size) + this.size) % this.size];
    return a + (b - a) * frac;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const n = output[0].length;
    const f0 = currentFrame;
    const f1 = f0 + n;
    const { fadeIn, fadeOut } = this;

    // Record first, so a slice can be read back the moment it has been written.
    for (let ch = 0; ch < 2; ch++) {
      const src = input[Math.min(ch, input.length - 1)];
      const ring = this.ring[ch];
      for (let i = 0; i < n; i++) ring[(f0 + i) % this.size] = src ? src[i] : 0;
    }

    this.segments = this.segments.filter((s) => s.end > f0);
    this.ducks = this.ducks.filter((d) => d.to > f0);
    const segments = this.segments.filter((s) => s.at < f1);
    const ducks = this.ducks.filter((d) => d.from < f1);

    for (let ch = 0; ch < output.length; ch++) {
      const live = input[Math.min(ch, input.length - 1)];
      const out = output[ch];
      const rc = Math.min(ch, 1);
      for (let i = 0; i < n; i++) {
        const f = f0 + i;
        let dry = 1;
        for (const d of ducks) {
          const inside = Math.min((f - d.from) / fadeIn, (d.to - f) / fadeOut);
          if (inside > 0) dry *= 1 - Math.min(1, inside);
        }
        let wet = 0;
        for (const s of segments) {
          if (f < s.at || f >= s.end) continue;
          const env = Math.min(1, (f - s.at) / fadeIn, (s.end - f) / fadeOut);
          wet += this.read(rc, s.src + (f - s.at) * s.rate) * env * s.gain;
        }
        out[i] = (live ? live[i] : 0) * dry + wet;
      }
    }
    return true;
  }
}

registerProcessor('repeater', RepeaterProcessor);
