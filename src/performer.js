// The ad lib performer: sits between the generated pattern and the sound
// engines and decides, beat by beat, what is actually played.
//
// One slider value (0..1) drives several layers that fade in at different points:
//
//   feel     0.00 ->  ghost notes, hat openings, accent changes
//   move     0.20 ->  displaced / added / dropped kicks, flams, fills at phrase ends
//   stretch  0.50 ->  longer and more frequent fills, backbeat displacement,
//                     hat <-> ride switching, bursts of space or double-time
//   glitch   0.80 ->  stutters, ratchets, dropped beats, metric displacement
//
// Acoustic patterns get a drummer's vocabulary and human timing; electronic
// patterns get a machine's (mutes, rolls, retriggers) and stay on the grid.
// Variation choices follow the slider live; fills are planned at each bar line.
// The downbeat kick always survives, so the groove keeps coming home.

const BAR = 16;
const BEAT = 4;
const GHOST = 0.5;

const HATS = new Set(['hatClosed', 'hatOpen', 'ride']);
const PERC = new Set(['cowbell', 'rim', 'tomLow', 'tomMid', 'tomHigh']);
const RATCHETABLE = new Set(['snare', 'clap', 'rim', 'hatClosed', 'cowbell', 'tomLow', 'tomMid', 'tomHigh']);

// One-beat rhythm cells for fills: [cell, isDense]
const CELLS = [
  ['0010', false], ['0011', false], ['1010', false], ['1001', false], ['0110', false], ['0001', false],
  ['1011', true], ['1101', true], ['1110', true], ['0111', true], ['1111', true],
];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const ramp = (a, lo, hi) => clamp((a - lo) / (hi - lo), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {object} pattern  from generatePattern
 * @param {() => number} [rnd]
 */
export function createPerformer(pattern, rnd = Math.random) {
  const acoustic = pattern.kit === 'acoustic';

  const chance = (p) => rnd() < p;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 0.577;
  function weighted(pairs) {
    const total = pairs.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    let r = rnd() * total;
    for (const [item, w] of pairs) {
      r -= Math.max(0, w);
      if (r < 0) return item;
    }
    return pairs[pairs.length - 1][0];
  }

  const hit = (voice, vel, offset = 0, shift = 0) => ({ voice, vel, offset, shift });
  const clone = (h) => hit(h.voice, h.vel, h.offset ?? 0, h.shift ?? 0);

  // Which voice carries the backbeat in this pattern (snare, clap or rim)?
  const backbeatVoice = (() => {
    const strength = { snare: 0, clap: 0, rim: 0 };
    for (const step of pattern.steps) {
      for (const h of step) if (h.voice in strength && h.vel >= 0.6) strength[h.voice] += h.vel;
    }
    return Object.keys(strength).reduce((a, b) => (strength[b] > strength[a] ? b : a));
  })();
  const patternUsesRide = pattern.steps.some((step) => step.some((h) => h.voice === 'ride'));

  let barIndex = -1;
  let rideSwap = false;
  let pendingCrash = false;
  let lastCrashBar = -99;
  let lastCymbal = 1; // which of the two crash cymbals was hit last
  let plan = null;

  // --- fills -----------------------------------------------------------------

  function fillRhythm(len, intensity) {
    const density = 0.3 + 0.55 * intensity;
    const positions = [];
    for (let c = 0; c < len; c += BEAT) {
      if (len - c < BEAT) {
        const cell = weighted([['11', density], ['01', 1 - density], ['10', (1 - density) * 0.6]]);
        for (let i = 0; i < 2; i++) if (cell[i] === '1') positions.push({ step: c + i, offset: 0 });
        continue;
      }
      if (chance(0.14 * ramp(intensity, 0.4, 1))) {
        // Triplet figure across the beat
        const n = chance(0.5) ? 3 : 6;
        for (let k = 0; k < n; k++) {
          const pos = c + (k * BEAT) / n;
          positions.push({ step: Math.floor(pos), offset: pos - Math.floor(pos) });
        }
        continue;
      }
      const late = c + BEAT >= len ? 0.15 : 0;
      const cell = weighted(CELLS.map(([cells, dense]) => [cells, dense ? density + late : 1.05 - density - late]));
      for (let i = 0; i < BEAT; i++) if (cell[i] === '1') positions.push({ step: c + i, offset: 0 });
    }
    if (!positions.length) positions.push({ step: len - 1, offset: 0 });
    return positions;
  }

  /** Returns (k, n) => { voice, vel } for the k-th of n fill hits. */
  function acousticContour(intensity, len) {
    const kind = weighted([
      ['ghostBuild', 2 - 1.2 * intensity],
      ['snareAccents', 1 + intensity],
      ['tomsDown', 0.6 + intensity],
      ['kickSnare', 0.8 + intensity],
      ['linear', 2 * intensity],
      ['space', len >= BEAT ? 0.6 : 0],
    ]);
    switch (kind) {
      case 'ghostBuild':
        return { kind, at: (k, n) => ({ voice: 'snare', vel: lerp(0.26, 0.95, n > 1 ? (k / (n - 1)) ** 1.5 : 1) }) };
      case 'snareAccents':
        return { kind, at: (k, n) => ({ voice: 'snare', vel: k === n - 1 || chance(0.3) ? 0.95 : 0.3 + rnd() * 0.12 }) };
      case 'tomsDown': {
        const order = ['snare', 'tomHigh', 'tomMid', 'tomLow'];
        return { kind, at: (k, n) => {
          const from = n < 4 ? 1 : 0;
          const idx = Math.min(3, from + Math.floor((k / n) * (4 - from)));
          return { voice: order[idx], vel: lerp(0.7, 0.95, n > 1 ? k / (n - 1) : 1) };
        } };
      }
      case 'kickSnare': {
        let kicks = 0;
        return { kind, hasKick: true, at: (k, n) => {
          if (k < n - 1 && kicks < 2 && chance(0.38)) { kicks++; return { voice: 'kick', vel: 0.85 }; }
          kicks = 0;
          return { voice: 'snare', vel: k === n - 1 || chance(0.4) ? 0.92 : 0.34 };
        } };
      }
      case 'linear': {
        const voices = ['snare', 'snare', 'tomHigh', 'tomMid', 'tomLow', 'kick', 'hatClosed'];
        let prev = null;
        return { kind, hasKick: true, at: () => {
          let voice;
          do { voice = pick(voices); } while (voice === prev && chance(0.7));
          prev = voice;
          return { voice, vel: chance(0.35) ? 0.95 : 0.4 + rnd() * 0.3 };
        } };
      }
      default:
        return { kind: 'space' };
    }
  }

  function electronicContour(intensity, len) {
    const kind = weighted([
      ['snareRoll', 1.4],
      ['tomRun', 1.2],
      ['backbeatDouble', 1.2],
      ['dropout', len >= BEAT ? 1 : 0],
      ['kickRoll', len <= 8 ? ramp(intensity, 0.4, 0.8) : 0],
      ['percBurst', 0.8],
    ]);
    switch (kind) {
      case 'snareRoll':
        return { kind, everyStep: true, at: (k, n) => ({ voice: backbeatVoice === 'rim' ? 'snare' : backbeatVoice, vel: lerp(0.4, 1, n > 1 ? k / (n - 1) : 1) }) };
      case 'tomRun': {
        const order = ['tomHigh', 'tomMid', 'tomLow'];
        return { kind, at: (k, n) => ({ voice: order[Math.min(2, Math.floor((k / n) * 3))], vel: 0.85 }) };
      }
      case 'backbeatDouble':
        return { kind, at: (k) => ({ voice: k % 2 ? 'clap' : 'snare', vel: 0.9 }) };
      case 'kickRoll':
        return { kind, hasKick: true, everyStep: true, at: (k, n) => ({ voice: 'kick', vel: lerp(0.6, 1, n > 1 ? k / (n - 1) : 1) }) };
      case 'percBurst': {
        const voice = pick(['cowbell', 'rim', 'tomHigh']);
        return { kind, at: () => ({ voice, vel: 0.8 }) };
      }
      default:
        return { kind: 'dropout' };
    }
  }

  /** Builds `len` steps of fill ending at the bar line. */
  function makeFill(len, intensity, patternBarStart) {
    const steps = Array.from({ length: len }, () => []);
    const start = BAR - len;
    const source = (i) => pattern.steps[(patternBarStart + start + i) % pattern.length];
    const contour = acoustic ? acousticContour(intensity, len) : electronicContour(intensity, len);

    if (contour.kind === 'space') {
      // Leave air, then one setup note before the downbeat.
      steps[len - 2].push(hit(pick(['hatOpen', 'kick', 'tomLow', 'snare']), 0.8));
    } else if (contour.kind !== 'dropout') {
      const positions = contour.everyStep
        ? steps.map((_, i) => ({ step: i, offset: 0 }))
        : fillRhythm(len, intensity);
      if (contour.kind === 'snareRoll' && len >= BEAT && intensity > 0.6) {
        // The roll doubles up in its last beat
        for (let i = len - BEAT; i < len; i++) positions.push({ step: i, offset: 0.5 });
        positions.sort((a, b) => a.step + a.offset - (b.step + b.offset));
      }
      positions.forEach((pos, k) => {
        const { voice, vel } = contour.at(k, positions.length);
        steps[pos.step].push(hit(voice, vel, pos.offset));
      });
    }

    // What keeps going underneath the fill
    const keepKick = !contour.hasKick && chance(0.5);
    const keepHats = acoustic
      ? len <= BEAT && chance(0.5)
      : chance(contour.kind === 'dropout' ? 0.5 : 0.6);
    for (let i = 0; i < len; i++) {
      for (const h of source(i)) {
        if (h.voice === 'kick' && keepKick && !steps[i].some((f) => f.voice === 'kick')) steps[i].push(clone(h));
        if (HATS.has(h.voice) && keepHats && (!acoustic || !steps[i].length)) steps[i].push(clone(h));
      }
    }
    return steps;
  }

  // --- bar planning ------------------------------------------------------------

  // Below this tempo, acoustic grooves mark their phrases with a long, low crash.
  const SLOW_CRASH_BPM = 85;

  function planBar(a, bpm) {
    const pos = barIndex % 8;
    const slow = acoustic && bpm < SLOW_CRASH_BPM;
    // How much a fill "belongs" at the end of this bar: 8-bar ends most, then 4, then 2.
    const weight = pos === 7 ? 1 : pos === 3 ? 0.7 : pos % 2 === 1 ? 0.35 : 0.15;
    const cap = weight >= 0.7 ? 1 : weight === 0.35 ? 0.85 : 0.7;

    const next = { crash: pendingCrash, shift: 0, mutes: new Set(), fill: null, fillStart: BAR };
    pendingCrash = false;

    // Slow grooves: a crash at the top of the 8-bar phrase more often than not,
    // sometimes halfway through, rarely elsewhere. Never two bars running, so it can ring out.
    if (slow && barIndex - lastCrashBar <= 1) next.crash = false;
    if (slow && !next.crash && barIndex - lastCrashBar > 1) {
      const p = pos === 0 ? 0.5 : pos === 4 ? 0.3 : 0.03 + 0.08 * a;
      next.crash = chance(p);
    }
    if (next.crash) lastCrashBar = barIndex;

    if (chance(Math.min(cap, a * 2.2 - (1 - weight) * 1.4))) {
      const len = weighted([
        [2, (1 - a) * 1.2],
        [4, 1],
        [8, ramp(a, 0.3, 0.7) * weight * 1.2],
        [16, ramp(a, 0.6, 1) * weight * 0.8],
      ]);
      next.fill = makeFill(len, a, (barIndex % 2) * BAR);
      next.fillStart = BAR - len;
      let crashChance = len < BEAT ? 0.03 : 0.1 + 0.35 * (len / BAR) + (pos === 7 ? 0.2 : 0);
      if (!acoustic) crashChance *= 0.5;
      if (slow) crashChance = Math.min(0.9, crashChance * 1.4);
      pendingCrash = chance(crashChance);
    }

    if (acoustic) {
      if (a < 0.4) rideSwap = false;
      else if (pos % 4 === 0 && chance(rideSwap ? 0.5 : 0.35 * ramp(a, 0.45, 0.9))) rideSwap = !rideSwap;
    } else {
      if (chance(0.12 * ramp(a, 0.2, 0.6))) next.mutes.add(pick(['hats', 'perc']));
      if (chance(0.06 * ramp(a, 0.5, 0.85))) next.mutes.add('kick');
    }

    if (chance(0.18 * ramp(a, 0.8, 1))) next.shift = pick([1, 2, 3]);
    return next;
  }

  // --- per-beat variation --------------------------------------------------------

  function baseBeat(s) {
    const barStart = (barIndex % 2) * BAR;
    return Array.from({ length: BEAT }, (_, i) => {
      const shift = s >= BEAT ? plan.shift : 0;
      let hits = pattern.steps[(barStart + s + i + shift) % pattern.length].map(clone);
      if (rideSwap) {
        for (const h of hits) {
          if (h.voice === 'ride') h.voice = 'hatClosed';
          else if (h.voice === 'hatClosed' || h.voice === 'hatOpen') h.voice = 'ride';
        }
      }
      if (plan.mutes.size) {
        hits = hits.filter((h) => {
          if (plan.mutes.has('hats') && HATS.has(h.voice)) return false;
          if (plan.mutes.has('perc') && PERC.has(h.voice) && h.voice !== backbeatVoice) return false;
          if (plan.mutes.has('kick') && h.voice === 'kick' && s + i !== 0) return false;
          return true;
        });
      }
      return hits;
    });
  }

  function moveHit(steps, i, h, target) {
    if (target < 0 || target >= BEAT) return;
    if (steps[target].some((o) => o.voice === h.voice)) return;
    steps[i].splice(steps[i].indexOf(h), 1);
    steps[target].push(h);
  }

  function varyKicks(steps, s, g2, g3) {
    for (let i = 0; i < BEAT; i++) {
      const kick = steps[i].find((h) => h.voice === 'kick');
      if (s + i === 0) continue;
      if (kick) {
        const r = rnd();
        const drop = (acoustic ? 0.08 : 0.05) * g2;
        const move = acoustic ? 0.1 * g2 + 0.1 * g3 : 0.06 * g3;
        if (r < drop) steps[i].splice(steps[i].indexOf(kick), 1);
        else if (r < drop + move) moveHit(steps, i, kick, i + pick([-1, 1]));
      } else {
        const syncopated = (s + i) % 2 === 1 || (s + i) % 4 === 2;
        const busy = steps[i].some((h) => h.voice === backbeatVoice && h.vel >= GHOST);
        if (syncopated && !busy && chance(0.03 * g2 + (acoustic ? 0.04 : 0.05) * g3)) {
          steps[i] = steps[i].filter((h) => !(h.voice === 'snare' && h.vel < GHOST));
          steps[i].push(hit('kick', 0.74));
        }
      }
    }
  }

  function varyAcoustic(steps, s, a, bpm) {
    const g1 = ramp(a, 0, 0.35);
    const g2 = ramp(a, 0.2, 0.6);
    const g3 = ramp(a, 0.5, 0.85);
    const timekeeper = patternUsesRide !== rideSwap ? 'ride' : 'hatClosed';

    varyKicks(steps, s, g2, g3);

    for (let i = 0; i < BEAT; i++) {
      const pos = s + i;
      // Ghost notes come and go
      steps[i] = steps[i].filter((h) => !(h.voice === 'snare' && h.vel < GHOST && chance(0.25 * g1)));
      const hits = steps[i];
      const has = (voice) => hits.some((h) => h.voice === voice);
      if (!has('snare') && !has('kick') && !has(backbeatVoice)) {
        const p = pos % 2 === 1 ? 0.1 * g1 + 0.08 * g3 : pos % 4 === 2 ? 0.04 * g1 + 0.03 * g3 : 0;
        if (chance(p)) hits.push(hit('snare', 0.22 + rnd() * 0.14));
      }

      for (const h of hits) {
        if (HATS.has(h.voice)) h.vel *= 1 + (rnd() - 0.5) * 0.3 * g1;
        if (h.voice === 'hatClosed' && pos % 4 === 2 && chance(0.05 * g1 + 0.05 * g3)) h.voice = 'hatOpen';
      }

      // Flam on the backbeat
      const back = hits.find((h) => h.voice === 'snare' && h.vel >= 0.9);
      if (back && chance(0.06 * g2 + 0.1 * g3)) hits.push(hit('snare', 0.3, back.offset, -0.028));

      // A tom or rim comment on the last 16th of a beat
      if (pos % 4 === 3 && !back && chance(0.02 * g2 + 0.04 * g3)) {
        hits.push(hit(pick(['tomLow', 'tomHigh', 'rim']), 0.5));
      }
    }

    // Backbeat pushed or pulled by a 16th
    for (let i = 0; i < BEAT; i++) {
      const back = steps[i].find((h) => h.voice === backbeatVoice && h.vel >= 0.9);
      if (back && chance(0.05 * g3)) { moveHit(steps, i, back, i + pick([-1, 1])); break; }
    }

    // A beat of space, or a beat of double-time on the timekeeper
    if (chance(0.06 * g3)) {
      for (let i = 0; i < BEAT; i++) steps[i] = steps[i].filter((h) => !HATS.has(h.voice));
    } else if (bpm <= 125 && chance(0.08 * g3)) {
      for (let i = 0; i < BEAT; i++) {
        if (!steps[i].some((h) => HATS.has(h.voice))) steps[i].push(hit(timekeeper, 0.42));
      }
    }
  }

  function varyElectronic(steps, s, a) {
    const g1 = ramp(a, 0, 0.35);
    const g2 = ramp(a, 0.2, 0.6);
    const g3 = ramp(a, 0.5, 0.85);

    varyKicks(steps, s, g2, g3);

    for (let i = 0; i < BEAT; i++) {
      const pos = s + i;
      const hits = steps[i];
      const hat = hits.find((h) => HATS.has(h.voice));
      if (hat) {
        if (hat.voice === 'hatClosed' && pos % 4 === 2 && chance(0.06 * g1 + 0.06 * g3)) hat.voice = 'hatOpen';
      } else if (!plan.mutes.has('hats') && chance(0.06 * g1 + 0.1 * g3)) {
        hits.push(hit('hatClosed', 0.5));
      }

      const hasBackbeat = hits.some((h) => h.voice === backbeatVoice);
      if (!hasBackbeat && (pos === 7 || pos === 10 || pos === 15) && chance(0.04 * g2 + 0.06 * g3)) {
        hits.push(hit(backbeatVoice, 0.7));
      }
      if (pos % 2 === 1 && !plan.mutes.has('perc') && chance(0.02 * g2 + 0.04 * g3)) {
        hits.push(hit(pick(['cowbell', 'rim', 'tomHigh']), 0.7));
      }
    }
  }

  function glitch(steps, s, a) {
    const g = ramp(a, 0.8, 1) + 0.15 * ramp(a, 0.5, 0.85);

    if (s !== 0 && chance(0.08 * g)) return steps.map(() => []);

    if (chance(0.22 * g)) {
      const first = steps.findIndex((hits) => hits.length);
      if (first >= 0) {
        const unit = pick([1, 1, 2]);
        const src = unit === 1 ? [steps[first]] : [steps[0], steps[1]];
        // The first slice keeps its place; the rest of the beat repeats it.
        steps = steps.map((hits, i) => (i < (unit === 1 ? first : 0) ? hits : src[i % unit].map(clone)));
      }
    }

    for (const hits of steps) {
      for (const h of hits.slice()) {
        if (!RATCHETABLE.has(h.voice)) continue;
        const p = 0.1 * g + (!acoustic && h.voice === 'hatClosed' ? 0.03 * ramp(a, 0.5, 0.85) : 0);
        if (!chance(p)) continue;
        const n = pick([2, 2, 3, 4]);
        const rising = chance(0.4);
        const top = h.vel;
        if (rising) h.vel = top * 0.55;
        for (let k = 1; k < n; k++) {
          const vel = rising ? top * lerp(0.55, 1, k / (n - 1)) : top * 0.8 ** k;
          hits.push(hit(h.voice, vel, h.offset + k / n));
        }
      }
    }
    return steps;
  }

  function humanise(steps, a) {
    const velSpread = 0.04 + 0.05 * a;
    const timeSpread = 0.002 + 0.003 * a;
    for (const hits of steps) {
      for (const h of hits) {
        h.vel *= 1 + gauss() * velSpread;
        h.shift += clamp(gauss() * timeSpread, -0.012, 0.012);
      }
    }
  }

  // --- public --------------------------------------------------------------------

  return {
    /**
     * Call once per beat, on its first step.
     * @param {number} step   running 16th-note counter from the clock
     * @param {number} adLib  0..1, read live
     * @param {number} bpm
     * @returns {Array<Array<{ voice, vel, offset, shift }>>} four steps of hits;
     *   offset is in 16ths, shift in seconds
     */
    beat(step, adLib, bpm) {
      const a = clamp(adLib, 0, 1);
      const s = step % BAR;
      if (s === 0) {
        barIndex++;
        plan = planBar(a, bpm);
      }

      let steps = baseBeat(s);
      if (a > 0) {
        if (acoustic) varyAcoustic(steps, s, a, bpm);
        else varyElectronic(steps, s, a);
        steps = glitch(steps, s, a);
      }

      if (plan.fill) {
        for (let i = 0; i < BEAT; i++) {
          const f = s + i - plan.fillStart;
          if (f >= 0) steps[i] = plan.fill[f].map(clone);
        }
      }

      if (s === 0) {
        if (!steps[0].some((h) => h.voice === 'kick')) steps[0].push(hit('kick', 1));
        if (plan.crash) {
          steps[0] = steps[0].filter((h) => !HATS.has(h.voice));
          const long = acoustic && bpm < SLOW_CRASH_BPM;
          // Usually the other cymbal from last time, so a phrase hears both.
          lastCymbal = chance(0.65) ? 3 - lastCymbal : lastCymbal;
          const voice = (long ? 'crashLong' : 'crash') + (lastCymbal === 2 ? '2' : '');
          steps[0].push(hit(voice, long ? 0.92 : 0.85));
        }
      }

      if (acoustic) humanise(steps, a);
      for (const hits of steps) for (const h of hits) h.vel = clamp(h.vel, 0.05, 1);
      return steps;
    },
  };
}
