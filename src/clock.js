// Look-ahead step clock on the audio timeline.
// A worker provides the wake-up ticks so timing survives background tabs;
// the actual note times always come from AudioContext.currentTime.

const LOOKAHEAD = 0.12; // seconds scheduled ahead of "now"
const TICK_MS = 25;

const WORKER_SRC = `
  let id = null;
  onmessage = (e) => {
    if (e.data === 'start') { if (id === null) id = setInterval(() => postMessage(0), ${TICK_MS}); }
    else { clearInterval(id); id = null; }
  };
`;

function createTicker(onTick) {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    const worker = new Worker(url);
    worker.onmessage = onTick;
    return {
      start: () => worker.postMessage('start'),
      stop: () => worker.postMessage('stop'),
    };
  } catch {
    let id = null;
    return {
      start: () => { if (id === null) id = setInterval(onTick, TICK_MS); },
      stop: () => { clearInterval(id); id = null; },
    };
  }
}

/**
 * How far a step is pushed late, in 16ths.
 * unit 16: every other 16th is delayed (funk / hip-hop swing).
 * unit 8:  the beat is stretched so the off-beat 8th lands late (shuffle);
 *          amount 1/3 puts it exactly on the triplet.
 */
export function swingOffset(step, { amount, unit }) {
  if (!amount) return 0;
  if (unit === 8) {
    const pos = step % 4;
    return pos < 2 ? pos * amount : (4 - pos) * amount;
  }
  return step % 2 === 1 ? amount : 0;
}

/**
 * @param {AudioContext} ctx
 * @param {object} opts
 * @param {() => number} opts.getBpm    read on every step, so tempo changes are live
 * @param {() => { amount: number, unit: 8 | 16 }} opts.getSwing  amount 0..0.33
 * @param {(step: number, time: number, stepDur: number) => void} opts.onStep
 */
export function createClock(ctx, { getBpm, getSwing, onStep }) {
  let playing = false;
  let step = 0;
  let gridTime = 0;

  function tick() {
    if (!playing) return;
    while (gridTime < ctx.currentTime + LOOKAHEAD) {
      const dur = 60 / getBpm() / 4;
      onStep(step, gridTime + swingOffset(step, getSwing()) * dur, dur);
      gridTime += dur;
      step++;
    }
  }

  const ticker = createTicker(tick);

  return {
    start() {
      step = 0;
      gridTime = ctx.currentTime + 0.06;
      playing = true;
      ticker.start();
      tick();
    },
    stop() {
      playing = false;
      ticker.stop();
    },
    get playing() { return playing; },
  };
}
