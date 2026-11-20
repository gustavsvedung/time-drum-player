"""Downloads the acoustic kit subset used by the app and writes samples/manifest.json.

Source: Big Rusty Drums by Karoryfer Samples (CC0 1.0)
        https://github.com/sfzinstruments/karoryfer.big-rusty-drums

Usage:  python3 tools/fetch_samples.py
"""
import json
import os
import subprocess
import sys
import tempfile

BASE = "https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/main/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "samples")

# voice: (source dir, file prefix, close-mic dir, velocity layers soft->loud, round robins)
KIT = {
    "kick":      ("kick_24/kick",        "k",         "kick", [3, 6, 9, 12, 14],   [1, 2, 3]),
    "snare":     ("snare_14/center",     "sn_center", "top",  [1, 3, 5, 7, 9, 10], [1, 2, 3]),
    "rim":       ("snare_14/sidestick",  "sn_ss",     "top",  [2, 3, 4],           [1, 2, 3]),
    "hatClosed": ("hihat_14/tc",         "ht_tc",     "cl",   [2, 4, 6, 7, 8],     [1, 2, 3]),
    "hatOpen":   ("hihat_14/ho",         "ht_ho",     "cl",   [2, 3, 4],           [1, 2]),
    "hatQuarter":("hihat_14/qo",         "ht_qo",     "cl",   [2, 3, 4],           [1, 2]),
    "hatWide":   ("hihat_14/open",       "ht_open",   "cl",   [2, 4, 5],           [1, 2]),
    "tomHigh":   ("tom_14/center",       "t14",       "cl",   [2, 4, 6],           [1, 2]),
    "tomMid":    ("tom_15/center",       "t15",       "cl",   [2, 4, 6],           [1, 2]),
    "tomLow":    ("tom_18/center",       "t18",       "cl",   [3, 6, 8],           [1, 2]),
    "ride":      ("ride_22/rd",          "rd",        "cl",   [3, 5, 7, 9],        [1, 2]),
    "crash":     ("crash_17/cr",         "cr",        "cl",   [3, 5],              [1, 2]),
    "crash2":    ("crash_sizzle_17/cr",  "crs",       "cl",   [3, 5, 6],           [1, 2]),
}


def main():
    manifest = {}
    jobs = []
    for voice, (src, prefix, close_dir, layers, robins) in KIT.items():
        manifest[voice] = []
        for vl in layers:
            layer = []
            for rr in robins:
                entry = {}
                for mic, mic_dir in (("close", close_dir), ("oh", "oh")):
                    rel = f"{voice}/{mic}_v{vl:02d}_r{rr}.flac"
                    url = f"{BASE}Samples/{src}/{mic_dir}/{prefix}_vl{vl}_rr{rr}.flac"
                    jobs.append((url, os.path.join(OUT, rel)))
                    entry[mic] = rel
                layer.append(entry)
            manifest[voice].append(layer)
    jobs.append((BASE + "LICENSE", os.path.join(OUT, "LICENSE")))

    # Only fetch what isn't already here
    def have(path):
        try:
            with open(path, "rb") as f:
                return path.endswith("LICENSE") or f.read(4) == b"fLaC"
        except OSError:
            return False
    todo = [job for job in jobs if not have(job[1])]
    print(f"{len(todo)} files to download")

    with tempfile.NamedTemporaryFile("w", suffix=".cfg", delete=False) as cfg:
        for url, path in todo:
            cfg.write(f'url = "{url}"\noutput = "{path}"\n')
    result = subprocess.run(
        ["curl", "--parallel", "--parallel-max", "8", "--fail", "--silent", "--show-error",
         "--location", "--create-dirs", "--config", cfg.name]
    )
    os.unlink(cfg.name)

    bad = []
    for _, path in jobs[:-1]:
        try:
            with open(path, "rb") as f:
                if f.read(4) != b"fLaC":
                    bad.append(path)
        except OSError:
            bad.append(path)

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)

    total = sum(os.path.getsize(p) for _, p in jobs if os.path.exists(p))
    print(f"{len(jobs) - 1 - len(bad)} of {len(jobs) - 1} samples ok, {total / 1e6:.1f} MB, curl exit {result.returncode}")
    for path in bad:
        print("  missing or not FLAC:", os.path.relpath(path, ROOT))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
