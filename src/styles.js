// Style rules for the pattern generator.
//
// Each style is a stack of layers. A layer picks one row at random and samples it.
// A row is one bar of 16th notes:
//
//   X  accent, always          x  normal, always        -  soft, always
//   o  ghost, always           .  rest
//   1-9  normal hit with 10-90 % probability
//   :  ghost with 50 % probability      ,  ghost with 25 % probability
//
// Layer options:
//   voice    a voice name, or [[voice, weight], ...] to pick one
//   rows     candidate rows; a row may be [row, maxBpm] to exclude it at fast tempos
//   chance   probability that the layer is used at all (default 1)
//   vary     probability that the second half of bar 2 is re-rolled (A A' phrasing)
//   bar      2 = the layer only sounds in bar 2 (turnarounds)
//
// Style options:
//   bpm        tempo range where the style is at home
//   swing      [min, max] amount, 0 = straight, 0.33 = full triplet feel
//   swingUnit  16 (default) swings the 16ths, 8 swings the 8ths (shuffle)
//   layBack    { voice: fraction of a 16th } to play a voice behind the beat

const BACKBEAT = '....X.......X...';
const EIGHTHS = 'X.x.X.x.X.x.X.x.';
const TIMEKEEPER = [['hatClosed', 3], ['ride', 1]];

export const STYLES = {
  acoustic: [
    {
      name: 'pocket',
      bpm: [84, 118],
      swing: [0.04, 0.14],
      layBack: { snare: 0.04 },
      layers: [
        { voice: 'kick', vary: 0.6, rows: [
          'X..3..x...5..3..',
          'X.....x3..x.....',
          'X..x....3.x..3..',
          'X.3....x..x....2',
          'X.....x...x..5..',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: 'snare', chance: 0.85, vary: 0.7, rows: [
          '.,.....:.:...,.:',
          '.......:.,.....:',
          '..,....:.:.,...,',
        ] },
        { voice: 'hatClosed', rows: [
          EIGHTHS,
          'x.X.x.X.x.X.x.X.',
          ['X-x-X-x-X-x-X-x-', 100],
          ['X.x-X.x.X.x-X.x.', 108],
        ] },
        { voice: 'hatOpen', chance: 0.5, rows: ['..............5.', '......3.......5.'] },
      ],
    },
    {
      name: 'backbeat',
      bpm: [70, 112],
      swing: [0, 0.06],
      layBack: { snare: 0.07 },
      layers: [
        { voice: 'kick', vary: 0.4, rows: [
          'X.....5.x.x.....',
          'X.......x.x.....',
          'X.....x.x.....3.',
          'X..3....x.x.....',
          'X.......x..x....',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: 'snare', chance: 0.5, vary: 0.5, rows: ['.......,.......:', '.........,.....,'] },
        { voice: TIMEKEEPER, rows: [EIGHTHS, 'x.x.x.x.x.x.x.x.', 'X.-.X.-.X.-.X.-.'] },
        { voice: 'hatOpen', chance: 0.25, bar: 2, rows: ['..............x.'] },
      ],
    },
    {
      name: 'shuffle',
      bpm: [70, 126],
      swing: [0.24, 0.33],
      swingUnit: 8,
      layBack: { snare: 0.04 },
      layers: [
        { voice: 'kick', vary: 0.5, rows: [
          'X.......x.3.....',
          'X.5.....x.....3.',
          'X.....x.x.......',
          'X.....x.x.5.....',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: 'snare', chance: 0.7, vary: 0.6, rows: ['..,...:...,...:.', '......:.......:.'] },
        { voice: TIMEKEEPER, rows: [EIGHTHS, 'X...X.x.X...X.x.', 'X.-.X.-.X.-.X.-.'] },
      ],
    },
    {
      name: 'halftime',
      bpm: [40, 84],
      swing: [0.08, 0.2],
      layBack: { snare: 0.08, rim: 0.05 },
      layers: [
        { voice: 'kick', vary: 0.6, rows: [
          'X.....3..3x.....',
          'X..x......3..3..',
          'X.....x......5..',
          'X.3.......x3....',
          'X......x..x.....',
        ] },
        { voice: [['snare', 3], ['rim', 1]], rows: ['........X.......'] },
        { voice: 'snare', chance: 0.75, vary: 0.7, rows: [
          '....,..:.....,.:',
          '...,...:......,:',
          '.......:.....:..',
        ] },
        { voice: 'hatClosed', rows: [
          'X-x-X-x-X-x-X-x-',
          'x.x.x.x.x.x.x.x.',
          'X.x-X.x.X.x-X.x.',
          'X.x.X.x-X.x.X-x-',
        ] },
        { voice: 'hatOpen', chance: 0.4, rows: ['......3.......3.', '..............5.'] },
      ],
    },
    {
      name: 'ballad',
      bpm: [40, 76],
      swing: [0, 0.1],
      layBack: { rim: 0.05 },
      layers: [
        { voice: 'kick', vary: 0.4, rows: [
          'X.......x.3.....',
          'X.....3.x.......',
          'X.........x.....',
          'X.....x.x.....2.',
        ] },
        { voice: 'rim', rows: ['....x.......x...'] },
        { voice: TIMEKEEPER, rows: ['x.-.x.-.x.-.x.-.', 'x.-.x.-.x.-.x.--', ['x-o-x-o-x-o-x-o-', 70]] },
        { voice: 'tomLow', chance: 0.2, bar: 2, rows: ['..............-.', '.............-.-'] },
      ],
    },
    {
      name: 'breakbeat',
      bpm: [96, 180],
      swing: [0, 0.1],
      layers: [
        { voice: 'kick', vary: 0.6, rows: [
          'X.x.......x.....',
          'X.x.......3x....',
          'X..x......x..3..',
          'X.x....3..x.....',
          'X.....x...x.5...',
          'X.x.......xx....',
        ] },
        { voice: 'snare', rows: [BACKBEAT, BACKBEAT, '....X..3.5..X...', '....X.....3.X...'] },
        { voice: 'snare', chance: 0.7, vary: 0.7, rows: [
          ['.......:.:.....,', 150],
          ['.......:.......:', 165],
          '.........:......',
        ] },
        { voice: TIMEKEEPER, rows: [EIGHTHS, 'x.X.x.X.x.X.x.X.', 'X.x.X.x.X.x.X.xx'] },
        { voice: 'hatOpen', chance: 0.4, rows: ['..........3...3.', '..............x.'] },
      ],
    },
    {
      name: 'driving',
      bpm: [120, 180],
      swing: [0, 0],
      layers: [
        { voice: 'kick', vary: 0.4, rows: [
          'X.......x.x.....',
          'X...x...x...x...',
          'X.x.....x.x.....',
          'X.....x.x.......',
          'X.......x.x...3.',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: [['hatClosed', 4], ['ride', 2], ['tomLow', 1]], rows: [
          'X.X.X.X.X.X.X.X.',
          EIGHTHS,
          'X...X...X...X...',
        ] },
        { voice: 'hatOpen', chance: 0.3, bar: 2, rows: ['..............x.'] },
      ],
    },
  ],

  electronic: [
    {
      name: 'sparse808',
      bpm: [40, 90],
      swing: [0, 0.08],
      layers: [
        { voice: 'kick', vary: 0.5, rows: [
          'X.........3..5..',
          'X......x..3.....',
          'X..3......x.....',
          'X.....3...x....2',
          'X.....x......x..',
        ] },
        { voice: [['snare', 2], ['clap', 2], ['rim', 1]], rows: [BACKBEAT, BACKBEAT, '........X.......'] },
        { voice: 'hatClosed', rows: [
          'x.x.x.x.x.x.x.x.',
          'x..x..x.x..x..x.',
          '..x...x...x...x.',
          'x.x.x.x.x.xxx.x.',
          'x-x-x-x-x-x-x-x-',
        ] },
        { voice: 'hatOpen', chance: 0.35, rows: ['..............5.', '......3.........'] },
        { voice: [['cowbell', 1], ['rim', 1], ['tomHigh', 1]], chance: 0.35, vary: 0.8, rows: [
          '......2....3..2.',
          '...3.....3......',
        ] },
      ],
    },
    {
      name: 'cr78',
      bpm: [50, 118],
      swing: [0, 0.12],
      layers: [
        { voice: 'kick', vary: 0.3, rows: [
          'X.....x.x.......',
          'X..x..x...x.....',
          'X.......x.x.....',
          'X..x....x..x....',
        ] },
        { voice: 'snare', chance: 0.6, rows: ['....-.......-...'] },
        { voice: 'rim', rows: [
          '....x..5..x.x...',
          '..x...x...x...x.',
          '...x..x.....x...',
          '....x.......x..5',
        ] },
        { voice: 'hatClosed', rows: [
          'x.xxx.xxx.xxx.xx',
          'x.x.x.x.x.x.x.x.',
          'xoxoxoxoxoxoxoxo',
          'x.o.x.o.x.o.x.o.',
        ] },
        { voice: [['cowbell', 1], ['tomHigh', 1], ['tomMid', 1]], chance: 0.3, rows: [
          '......3.......3.',
          '..3.......3.....',
        ] },
      ],
    },
    {
      name: 'synthpop',
      bpm: [100, 136],
      swing: [0, 0],
      layers: [
        { voice: 'kick', rows: ['X...x...x...x...'] },
        { voice: 'kick', chance: 0.4, bar: 2, rows: ['..............5.', '.......3......3.'] },
        { voice: [['snare', 2], ['clap', 1]], rows: [BACKBEAT] },
        { voice: 'clap', chance: 0.35, rows: [BACKBEAT, '............X...'] },
        { voice: 'hatClosed', rows: [
          '..x...x...x...x.',
          'x.x.x.x.x.x.x.x.',
          'x.xxx.xxx.xxx.xx',
          '-.x.-.x.-.x.-.x.',
        ] },
        { voice: 'hatOpen', chance: 0.4, rows: ['..x...x...x...x.', '..............x.', '......x.......x.'] },
      ],
    },
    {
      name: 'electro',
      bpm: [104, 136],
      swing: [0, 0],
      layers: [
        { voice: 'kick', vary: 0.5, rows: [
          'X.....x...x.....',
          'X..x..x...x..3..',
          'X.....x..3x.....',
          'X..3....x.x..3..',
          'X..x......x.x...',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: 'clap', chance: 0.5, rows: [BACKBEAT, '............X...'] },
        { voice: 'hatClosed', rows: ['xoxoxoxoxoxoxoxo', 'x.xxx.xxx.xxx.xx', 'x-x-x-x-x-x-x-x-', 'x.x.x.x.x.x.x.x.'] },
        { voice: 'hatOpen', chance: 0.3, rows: ['..............x.', '......5.......5.'] },
        { voice: [['cowbell', 2], ['tomHigh', 1]], chance: 0.35, vary: 0.6, rows: [
          '..5..5....5..5..',
          '...5..5.......5.',
          '..........5.5..5',
        ] },
      ],
    },
    {
      name: 'indie606',
      bpm: [84, 150],
      swing: [0, 0.06],
      layers: [
        { voice: 'kick', vary: 0.5, rows: [
          'X.....x...x.....',
          'X..x......x.....',
          'X.....x.x..x....',
          'X.......x.x.....',
          'X.x.......x..3..',
        ] },
        { voice: 'snare', vary: 0.5, rows: [BACKBEAT, BACKBEAT, '....X..2....X..3', '....X.....2.X...'] },
        { voice: 'hatClosed', rows: [
          ['x-x-x-x-x-x-x-x-', 130],
          ['X-x-X-x-X-x-X-x-', 130],
          'x.x.x.x.x.x.x.x.',
          'X.x.X.x.X.x.X.x.',
        ] },
        { voice: 'hatOpen', chance: 0.5, rows: ['......3.......5.', '..............x.'] },
        { voice: [['tomHigh', 1], ['tomMid', 1], ['tomLow', 1]], chance: 0.25, bar: 2, rows: [
          '.............5.5',
          '..............x.',
        ] },
      ],
    },
    {
      name: 'motorik',
      bpm: [124, 180],
      swing: [0, 0],
      layers: [
        { voice: 'kick', rows: [
          'X.x.....x.x.....',
          'X...x...x...x...',
          'X.x...x.x.x...x.',
          'X.x.x...x.x.x...',
        ] },
        { voice: 'snare', rows: [BACKBEAT] },
        { voice: 'hatClosed', rows: ['x.x.x.x.x.x.x.x.', 'X.x.X.x.X.x.X.x.', 'x.x.x.x.x.x.x.xx'] },
        { voice: 'hatOpen', chance: 0.3, rows: ['..............x.', '......x.......x.'] },
      ],
    },
    {
      name: 'pulse',
      bpm: [130, 180],
      swing: [0, 0],
      layers: [
        { voice: 'kick', rows: ['X.......x.......', 'X...x...x...x...', 'X.......x.x.....'] },
        { voice: [['clap', 2], ['snare', 2], ['rim', 1]], rows: [BACKBEAT, BACKBEAT, '............X...'] },
        { voice: 'rim', chance: 0.35, rows: ['..x..x..x..x..x.', '...x..x...x..x..'] },
        { voice: 'hatClosed', rows: ['..x...x...x...x.', 'x.x.x.x.x.x.x.x.', '-.x.-.x.-.x.-.x.'] },
        { voice: 'hatOpen', chance: 0.35, rows: ['..x...x...x...x.', '..............x.'] },
      ],
    },
  ],
};
