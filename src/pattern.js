// Pattern generator: picks a style from the kit and tempo, then samples its
// rules into a two-bar pattern on a 16th grid.
//
// Pattern: {
//   kit, style, length, swing, swingUnit,
//   steps: Array<Array<{ voice, vel, offset }>>   offset = fraction of a 16th, behind the beat
// }

import { STYLES } from './styles.js';

const BAR = 16;
const LENGTH = BAR * 2;
const TEMPO_FALLOFF = 12; // bpm outside a style's range before it is ruled out
const GHOST = 0.5; // velocities below this count as ghost notes

const FIXED_VEL = { X: 1, x: 0.8, '-': 0.6, o: 0.36 };
const GHOST_PROB = { ':': 0.5, ',': 0.25 };

function sampleStep(ch, rnd) {
  if (FIXED_VEL[ch]) return FIXED_VEL[ch];
  if (ch >= '1' && ch <= '9') return rnd() < Number(ch) / 10 ? 0.74 : 0;
  if (GHOST_PROB[ch]) return rnd() < GHOST_PROB[ch] ? 0.28 + rnd() * 0.12 : 0;
  return 0;
}

function pickWeighted(items, weightOf, rnd) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let r = rnd() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

function tempoFit(style, bpm) {
  const [lo, hi] = style.bpm;
  const outside = bpm < lo ? lo - bpm : bpm > hi ? bpm - hi : 0;
  return Math.max(0, 1 - outside / TEMPO_FALLOFF);
}

const lastStyle = { acoustic: null, electronic: null };

function pickStyle(kit, bpm, rnd) {
  const styles = STYLES[kit];
  const weight = (s) => tempoFit(s, bpm) * (s.name === lastStyle[kit] ? 0.25 : 1);
  const candidates = styles.filter((s) => weight(s) > 0);
  const style = candidates.length ? pickWeighted(candidates, weight, rnd) : styles[0];
  lastStyle[kit] = style.name;
  return style;
}

function sampleLayer(layer, bpm, rnd) {
  const rows = layer.rows
    .map((row) => (Array.isArray(row) ? row : [row, Infinity]))
    .filter(([, maxBpm]) => bpm <= maxBpm);
  if (!rows.length) return null;
  const [row] = rows[Math.floor(rnd() * rows.length)];

  const voice = Array.isArray(layer.voice)
    ? pickWeighted(layer.voice, ([, w]) => w, rnd)[0]
    : layer.voice;

  const bar1 = Array.from(row, (ch) => sampleStep(ch, rnd));
  const bar2 = bar1.slice();
  if (layer.vary && rnd() < layer.vary) {
    for (let i = BAR / 2; i < BAR; i++) bar2[i] = sampleStep(row[i], rnd);
  }
  if (layer.bar === 2) bar1.fill(0);
  return { voice, vels: [...bar1, ...bar2] };
}

/**
 * @param {{ kit: 'acoustic' | 'electronic', bpm: number }} context
 * @param {() => number} [rnd]
 */
export function generatePattern({ kit, bpm }, rnd = Math.random) {
  const style = pickStyle(kit, bpm, rnd);

  /** @type {Record<string, number[]>} */
  const grid = {};
  for (const layer of style.layers) {
    if (layer.chance !== undefined && rnd() >= layer.chance) continue;
    const sampled = sampleLayer(layer, bpm, rnd);
    if (!sampled) continue;
    const track = (grid[sampled.voice] ??= new Array(LENGTH).fill(0));
    sampled.vels.forEach((vel, i) => { track[i] = Math.max(track[i], vel); });
  }

  // Playability: one hat sound at a time, and no ghost notes under a kick.
  for (let i = 0; i < LENGTH; i++) {
    if (grid.hatOpen?.[i] && grid.hatClosed) grid.hatClosed[i] = 0;
    if (grid.kick?.[i] && grid.snare && grid.snare[i] < GHOST) grid.snare[i] = 0;
  }

  const steps = Array.from({ length: LENGTH }, () => []);
  for (const [voice, track] of Object.entries(grid)) {
    const layBack = style.layBack?.[voice] ?? 0;
    track.forEach((vel, i) => {
      // Only the main strokes sit back; ghost notes stay on the grid.
      if (vel) steps[i].push({ voice, vel, offset: vel >= GHOST ? layBack : 0 });
    });
  }

  const [swingMin, swingMax] = style.swing;
  return {
    kit,
    style: style.name,
    length: LENGTH,
    swing: swingMin + rnd() * (swingMax - swingMin),
    swingUnit: style.swingUnit ?? 16,
    steps,
  };
}
