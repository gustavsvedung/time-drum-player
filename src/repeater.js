// Beat repeat: the top of the ad lib slider (REPEAT_FROM and up).
//
// Like Ableton's Beat Repeat or Logic's Beat Breaker, it works on audio, not
// notes: the finished mix runs through a worklet that keeps recording. When a
// repeat starts, the first slice plays live (that is the recording), then the
// live sound is muted and the slice repeats until the bar line, where the
// groove comes back in. Repeats can roll (get shorter), drop in pitch, fade,
// be gated short or play backwards.

export const REPEAT_FROM = 0.8;
const PRE = 0.003; // seconds: slices start a hair early so the fade-in never touches an attack

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ramp = (a, lo, hi) => clamp((a - lo) / (hi - lo), 0, 1);

/**
 * Inserts the repeater between `input` and `output`. Until the worklet has
 * loaded (or if it can't), the signal passes straight through.
 * @param {AudioContext} ctx
 * @param {AudioNode} input
 * @param {AudioNode} output
 */
export function createRepeater(ctx, input, output) {
  input.connect(output);
  let node = null;

  const ready = ctx.audioWorklet
    .addModule(new URL('./repeater-worklet.js', import.meta.url))
    .then(() => {
      node = new AudioWorkletNode(ctx, 'repeater', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      input.disconnect(output);
      input.connect(node).connect(output);
    })
    .catch((err) => console.warn('time: beat repeat unavailable', err));

  return {
    ready,
    /** @param {{ segments: object[], ducks: object[] }} event */
    play(event) { node?.port.postMessage({ type: 'event', ...event }); },
    clear() { node?.port.postMessage({ type: 'clear' }); },
  };
}

/**
 * Decides, bar by bar, whether and how to repeat.
 * @param {() => number} [rnd]
 */
export function createRepeatPlanner(rnd = Math.random) {
  const chance = (p) => rnd() < p;
  function weighted(pairs) {
    const total = pairs.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    let r = rnd() * total;
    for (const [item, w] of pairs) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return pairs[pairs.length - 1][0];
  }

  let lastBar = false;

  return {
    /**
     * Call on each bar's first step.
     * @param {number} adLib 0..1
     * @returns {null | { start, length, grid, roll, pitch, decay, gate, reverse }}
     *   start, length and grid in 16th steps
     */
    planBar(adLib) {
      const t = ramp(adLib, REPEAT_FROM, 1);
      if (t <= 0) { lastBar = false; return null; }
      // From a few bars in eight at the bottom of the range to every other bar at the top
      const p = (0.1 + 0.4 * t) * (lastBar ? 0.4 : 1);
      if (!chance(p)) { lastBar = false; return null; }
      lastBar = true;

      // Where in the bar: mostly the end, so it lands back on the next downbeat
      const [start, length] = weighted([
        [[12, 4], 3],
        [[8, 8], 2.2],
        [[14, 2], 1.2],
        [[4, 4], 0.8],
        [[8, 4], 0.8],
        [[4, 12], 0.6 + 0.8 * t],
        [[0, 16], 0.5 * t],
      ]);

      // Slice length in 16ths: quarter, dotted 8th, 8th, 8th triplet, 16th, 32nd
      const grid = weighted([
        [4, length >= 8 ? 0.7 : 0],
        [3, length >= 8 ? 0.5 : 0],
        [2, 2.2],
        [4 / 3, 0.8],
        [1, 2],
        [0.5, 0.3 + 1.2 * t],
      ].filter(([g]) => g < length));

      return {
        start,
        length,
        grid,
        roll: length >= 4 && grid >= 1 && chance(0.2 + 0.3 * t),
        pitch: chance(0.2 + 0.35 * t) ? 0.985 - rnd() * (0.02 + 0.04 * t) : 1,
        decay: chance(0.35) ? 0.82 + rnd() * 0.13 : 1,
        gate: chance(0.3) ? 0.45 + rnd() * 0.35 : 1,
        reverse: chance(0.12 * t),
      };
    },
  };
}

/**
 * Turns a plan into worklet segments.
 * @param {object} plan  from planBar
 * @param {number} start AudioContext time of the plan's first step
 * @param {number} stepDur seconds per 16th
 */
export function repeatEvent(plan, start, stepDur) {
  const slice = plan.grid * stepDur;
  const end = start + plan.length * stepDur;
  const segments = [];
  let at = start + slice;
  let len = slice;
  let k = 1;
  while (at < end - 0.002) {
    // Rolls halve the slice each beat, down to a 32nd
    if (plan.roll) {
      const beat = Math.floor((at - start) / (4 * stepDur) + 1e-6);
      len = Math.max(slice / 2 ** beat, Math.min(slice, stepDur / 2));
    }
    const span = Math.min(len, end - at);
    const rate = plan.pitch ** k;
    segments.push({
      at: at - PRE,
      len: Math.max(0.004, span * plan.gate),
      src: plan.reverse ? start + len * rate : start - PRE,
      rate: plan.reverse ? -rate : rate,
      gain: plan.decay ** k,
    });
    at += len;
    k++;
  }
  return { segments, ducks: [{ from: start + slice - PRE, to: end }] };
}
