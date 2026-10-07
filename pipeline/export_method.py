"""Export every bet the method would have placed since July 2006, for the app's backtest replay.

The app replays these bets with the user's bankroll, Kelly fraction and date range,
using exactly the same staking arithmetic as research/harness.py.
"""
import json
import shutil
import time

import numpy as np

import method  # noqa: I001  (puts research/ on sys.path)
import harness
from config import LEAGUE_GROUPS, LEAGUES, OUT

FS = (0.25, 0.5, 0.75, 1.0)


def run():
    t0 = time.time()
    harness.CACHE = OUT / "cache"  # private cache, rebuilt from the freshly fetched data on every run
    shutil.rmtree(harness.CACHE, ignore_errors=True)
    df = harness.load_matches_cached()
    c = harness.load_candidates()
    p = method.historical_p(c)
    cfg = method.METHOD["cfg"]
    lo, hi = harness.PERIODS["sel"][0], harness.PERIODS["test"][1]
    s = harness._pick(c, p, cfg, lo, hi)
    rows = s["row"].astype(int)
    sel = c.sel.to_numpy()[rows]

    used = np.unique(s["mid"].astype(int))
    remap = {m: j for j, m in enumerate(used)}
    sub = df.iloc[used]
    teams = sorted(set(sub.HomeTeam) | set(sub.AwayTeam))
    tix = {t: j for j, t in enumerate(teams)}
    lgs = list(LEAGUES)
    matches = {
        "lg": [lgs.index(x) for x in sub.Division], "h": [tix[x] for x in sub.HomeTeam], "a": [tix[x] for x in sub.AwayTeam],
        "hg": sub.FTHome.astype(int).tolist(), "ag": sub.FTAway.astype(int).tolist(),
    }
    bets = {
        "d": s["day"].astype(int).tolist(), "m": [remap[int(m)] for m in s["mid"]], "s": "".join(sel.tolist()),
        "o": np.round(s["odds"] * 100).astype(int).tolist(), "p": np.round(s["p"] * 1e4).astype(int).tolist(),
        "w": s["win"].astype(int).tolist(),
    }

    stats = {}
    for per in ("sel", "train", "val", "test"):
        r = harness.simulate(c, p, cfg, per, fs=FS)
        stats[per] = {str(f): {k: v for k, v in r[f].items()} for f in FS}
    flat = {}
    for per in ("sel", "test"):
        r = harness.simulate(c, p, cfg, per, fs=(0.25,))[0.25]
        flat[per] = {"n": r["n"], "roi": r["roi_flat"], "winrate": r["winrate"], "avg_odds": r["avg_odds"], "avg_edge": r["avg_edge"]}

    out = {
        "generated": time.strftime("%Y-%m-%d"),
        "data_from": str(df.MatchDate.min().date()), "data_to": str(df.MatchDate.max().date()),
        "data_to_day": int(df.day.max()), "n_matches": int((df.season >= 2006).sum()),
        "periods": {k: list(v) for k, v in harness.PERIODS.items()},
        "leagues": [[k, LEAGUES[k][0], LEAGUES[k][1]] for k in lgs], "teams": teams,
        "matches": matches, "bets": bets, "stats": stats, "flat": flat,
        "method": dict(method.METHOD, groups=LEAGUE_GROUPS, max_ratio=harness.MAX_RATIO, fs=list(FS)),
    }
    path = OUT / "method.json"
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False, default=float))
    t = stats["test"][str(method.METHOD["kelly_f"])]
    print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB): {len(bets['d'])} bets since 2006; "
          f"test n={t['n']} roi {t['roi_flat']:+.2%} $1000->${t['final']:,.0f} dd {t['maxdd']:.0%} in {time.time() - t0:.0f}s")
    return out


if __name__ == "__main__":
    run()
