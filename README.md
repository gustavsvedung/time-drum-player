# time

A minimal rhythm player. One button, a tempo slider, an ad lib slider and an
acoustic / electronic switch. Every start generates a new groove.

## Run

```bash
python3 serve.py
```

Then open http://localhost:5173. No build step and no dependencies.

## Layout

- `src/clock.js` – look-ahead scheduler, swing
- `src/styles.js` – groove rules per kit and tempo
- `src/pattern.js` – pattern generator
- `src/performer.js` – ad lib: live variations and fills
- `src/repeater.js`, `src/repeater-worklet.js` – beat repeat on the mix, top 20 % of ad lib
- `src/electronic.js` – synthesised drum machine voices
- `src/acoustic.js` – sampled kit and its processing chain
- `tools/fetch_samples.py` – re-downloads the sample set into `samples/`

## Credits

Acoustic samples: [Big Rusty Drums](https://github.com/sfzinstruments/karoryfer.big-rusty-drums)
by Karoryfer Samples, CC0 1.0 (see `samples/LICENSE`).
