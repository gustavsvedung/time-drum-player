import { createAudio } from './audio.js';
import { createClock } from './clock.js';
import { generatePattern } from './pattern.js';
import { createPerformer } from './performer.js';

const state = {
  bpm: 110,
  adLib: 0, // 0..1, read live by the performer
  kit: 'electronic',
  pattern: null,
};

const el = {
  start: document.getElementById('start'),
  tempo: document.getElementById('tempo'),
  bpm: document.getElementById('bpm'),
  adLib: document.getElementById('adlib'),
  kit: document.getElementById('kit'),
  led: document.getElementById('led'),
};

let audio = null;
let clock = null;
let performer = null;
let beat = null; // the four steps currently being played

function ensureAudio() {
  if (audio) return;
  audio = createAudio();
  audio.setKit(state.kit);
  clock = createClock(audio.ctx, {
    getBpm: () => state.bpm,
    getSwing: () => ({ amount: state.pattern?.swing ?? 0, unit: state.pattern?.swingUnit ?? 16 }),
    onStep,
  });
}

function onStep(step, time, stepDur) {
  if (step % 4 === 0) beat = performer.beat(step, state.adLib, state.bpm);
  for (const hit of beat[step % 4]) {
    audio.trigger(hit.voice, time + hit.offset * stepDur + hit.shift, hit.vel);
  }
  if (step % 4 === 0) flashLed(time, step % 16 === 0);
}

function flashLed(time, downbeat) {
  const delay = Math.max(0, (time - audio.ctx.currentTime) * 1000);
  setTimeout(() => {
    if (!clock.playing) return;
    el.led.classList.toggle('downbeat', downbeat);
    el.led.classList.add('on');
    setTimeout(() => el.led.classList.remove('on'), 70);
  }, delay);
}

async function toggle() {
  ensureAudio();
  if (clock.playing) {
    clock.stop();
  } else {
    await audio.ctx.resume();
    state.pattern = generatePattern({ kit: state.kit, bpm: state.bpm });
    performer = createPerformer(state.pattern);
    console.info(`time: ${state.kit} / ${state.pattern.style}, swing ${state.pattern.swing.toFixed(2)}`);
    clock.start();
  }
  el.start.setAttribute('aria-pressed', String(clock.playing));
  el.start.setAttribute('aria-label', clock.playing ? 'Stop' : 'Start');
}

function syncSlider(input) {
  const v = (input.value - input.min) / (input.max - input.min);
  input.style.setProperty('--v', v);
}

el.start.addEventListener('click', toggle);

el.tempo.addEventListener('input', () => {
  state.bpm = Math.round(el.tempo.value);
  el.bpm.textContent = state.bpm;
  syncSlider(el.tempo);
});

el.adLib.addEventListener('input', () => {
  state.adLib = el.adLib.value / 100;
  syncSlider(el.adLib);
});

el.kit.addEventListener('click', () => {
  state.kit = state.kit === 'electronic' ? 'acoustic' : 'electronic';
  el.kit.setAttribute('aria-checked', String(state.kit === 'electronic'));
  audio?.setKit(state.kit);
});

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  if (e.target instanceof HTMLButtonElement) return; // native button activation handles it
  e.preventDefault();
  toggle();
});

// Created up front (suspended until the first press) so the samples load right away.
ensureAudio();

el.tempo.value = state.bpm;
el.bpm.textContent = state.bpm;
syncSlider(el.tempo);
syncSlider(el.adLib);
