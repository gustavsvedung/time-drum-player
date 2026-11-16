// Audio graph: two kit engines on separate buses, crossfaded by the kit switch,
// into a shared master limiter. Every hit goes to both engines so switching
// mid-pattern is seamless.

import { createAcousticKit } from './acoustic.js';
import { createElectronicKit } from './electronic.js';

const FADE = 0.03; // seconds, kit crossfade time constant

export function createAudio() {
  const ctx = new AudioContext({ latencyHint: 'interactive' });

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);

  const buses = {
    electronic: ctx.createGain(),
    acoustic: ctx.createGain(),
  };
  buses.electronic.connect(master);
  buses.acoustic.connect(master);

  const acoustic = createAcousticKit(ctx, buses.acoustic);
  const engines = {
    electronic: createElectronicKit(ctx, buses.electronic),
    acoustic: null, // set once its samples have loaded
  };

  let kit = 'electronic';

  function applyKit() {
    // Until the samples are in, the electronic kit covers for the acoustic one.
    const target = engines[kit] ? kit : 'electronic';
    for (const name of Object.keys(buses)) {
      buses[name].gain.setTargetAtTime(name === target ? 1 : 0, ctx.currentTime, FADE);
    }
  }

  const loadStart = performance.now();
  const ready = acoustic.ready.then(() => {
    console.info(`time: acoustic kit loaded in ${Math.round(performance.now() - loadStart)} ms`);
    engines.acoustic = acoustic;
    applyKit();
  });
  ready.catch((err) => console.error('time: acoustic kit failed to load', err));

  return {
    ctx,
    ready,
    setKit(name) {
      kit = name;
      applyKit();
    },
    trigger(voice, time, vel) {
      for (const engine of Object.values(engines)) {
        if (engine) engine.trigger(voice, time, vel);
      }
    },
  };
}
