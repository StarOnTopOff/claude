"""Shared, strict evaluation harness for "max K bets per day" betting methods.

Every method under study provides ONE thing: a probability `p` for each candidate
bet (row of `candidates()`), computed walk-forward (only data from earlier
seasons / earlier dates). The harness does everything else identically for all
methods: filters, daily top-K selection, Kelly staking with compounding, and the
selection protocol:

    sel    2006-07-01 .. 2020-06-30   the ONLY period used to pick a config
                                      (reported split as train 2006-14 / val 2014-20)
    2005/06 is excluded: first season of best-price data, a data-quality outlier
    (every max-odds strategy loses there, then wins in 13 of the next 14 years).
    test   2020-07-01 .. end of data  reported, never used for any choice

Data-quality rule (fixed a priori, same for everyone): a "best market price" more
than 30 % above Bet365 is treated as an error / unfillable price and ignored.

Usage:
    from harness import load_candidates, select_and_report, baseline_p
    c = load_candidates()
    p = baseline_p(c)            # or your own walk-forward probabilities
    select_and_report(c, p, label="baseline")
"""
import itertools
import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from config import LEAGUE_GROUPS  # noqa: E402
from data import load_matches, novig_power  # noqa: E402

CACHE = ROOT / "research" / "cache"
RESULTS = ROOT / "research" / "results"
EPOCH = pd.Timestamp("2000-01-01")
D = lambda s: int((pd.Timestamp(s) - EPOCH).days)  # noqa: E731
PERIODS = {
    "train": (D("2006-07-01"), D("2014-06-30")),
    "val": (D("2014-07-01"), D("2020-06-30")),
    "test": (D("2020-07-01"), D("2030-01-01")),
    "sel": (D("2006-07-01"), D("2020-06-30")),
}
MAX_RATIO = 1.30
FS = (0.25, 0.5, 0.75, 1.0)  # Kelly fractions evaluated simultaneously
SELECT_F = 0.5               # configs are ranked at half-Kelly
MAX_SEL_DD = 0.5             # the final Kelly fraction may not exceed a 50 % drawdown on 2006-2020


def load_matches_cached():
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / "matches.pkl"
    if f.exists():
        return pickle.loads(f.read_bytes())
    df = load_matches()
    df["day"] = (df.MatchDate - EPOCH).dt.days.astype(int)
    f.write_bytes(pickle.dumps(df))
    return df


def load_candidates():
    """Long table: one row per (match, selection) for 1X2 (H/D/A) and Over/Under 2.5 (O/U).

    Columns: mid (row index into load_matches_cached()), day, season, lg, mkt, sel, b365, mx, win.
    Odds are pre-match (Bet365 and best of ~17 books, collected before kick-off).
    """
    f = CACHE / "candidates.pkl"
    if f.exists():
        return pickle.loads(f.read_bytes())
    df = load_matches_cached()
    goals = (df.FTHome + df.FTAway).to_numpy()
    res = df.FTResult.to_numpy()
    parts = []
    spec = [
        ("1X2", "H", "OddHome", "MaxHome", res == "H"),
        ("1X2", "D", "OddDraw", "MaxDraw", res == "D"),
        ("1X2", "A", "OddAway", "MaxAway", res == "A"),
        ("OU", "O", "Over25", "MaxOver25", goals > 2.5),
        ("OU", "U", "Under25", "MaxUnder25", goals < 2.5),
    ]
    for mkt, sel, b, m, w in spec:
        parts.append(pd.DataFrame({
            "mid": np.arange(len(df)), "day": df.day.to_numpy(), "season": df.season.to_numpy(),
            "lg": df.Division.to_numpy(), "mkt": mkt, "sel": sel,
            "b365": df[b].to_numpy(float), "mx": df[m].to_numpy(float), "win": w.astype(np.int8),
        }))
    c = pd.concat(parts, ignore_index=True).sort_values(["day", "mid", "sel"], kind="mergesort").reset_index(drop=True)
    f.write_bytes(pickle.dumps(c))
    return c


def baseline_p(c):
    """Bet365 odds with the margin removed (power method), per match and market."""
    p = np.full(len(c), np.nan)
    for mkt, k in (("1X2", 3), ("OU", 2)):
        idx = np.where(c.mkt.to_numpy() == mkt)[0]
        sub = c.iloc[idx]
        wide = sub.pivot(index="mid", columns="sel", values="b365")
        cols = ["H", "D", "A"] if k == 3 else ["O", "U"]
        wide = wide[cols]
        ok = wide.notna().all(axis=1).to_numpy()
        pv = np.full(wide.shape, np.nan)
        pv[ok] = novig_power(wide.to_numpy(float)[ok])
        pdf = pd.DataFrame(pv, index=wide.index, columns=cols).stack(future_stack=True)
        key = pd.MultiIndex.from_arrays([sub.mid.to_numpy(), sub.sel.to_numpy()])
        p[idx] = pdf.reindex(key).to_numpy()
    return p


_PRE = {}


def _pre(c):
    """Per-candidate-table numpy arrays, computed once."""
    key = id(c)
    if key not in _PRE:
        lg = c.lg.to_numpy()
        _PRE.clear()
        _PRE[key] = {
            "day": c.day.to_numpy(), "mid": c.mid.to_numpy(), "win": c.win.to_numpy().astype(np.int8),
            "mx": c.mx.to_numpy(float), "b365": c.b365.to_numpy(float), "is1x2": c.mkt.to_numpy() == "1X2",
            "groups": {g: np.isin(lg, codes) for g, codes in LEAGUE_GROUPS.items()},
        }
        a = _PRE[key]
        a["ratio_ok"] = a["mx"] <= MAX_RATIO * a["b365"]
    return _PRE[key]


def _pick(c, p, cfg, lo_day, hi_day):
    """Rows bet under cfg in [lo_day, hi_day]: filters, one bet per match, top-K per day.

    Returns a dict of numpy arrays sorted by day (then by rank within the day).
    """
    a = _pre(c)
    ex = cfg.get("exec", "max")
    odds = a["mx"] if ex == "max" else a["b365"]
    with np.errstate(invalid="ignore"):
        edge = p * odds - 1.0
        m = (a["day"] >= lo_day) & (a["day"] <= hi_day) & np.isfinite(edge) & (edge > cfg["thr"])
        m &= (odds >= cfg["lo"]) & (odds < cfg["hi"])
    if ex == "max":
        m &= a["ratio_ok"]
    if cfg["mkts"] == "1X2":
        m &= a["is1x2"]
    elif cfg["mkts"] == "OU":
        m &= ~a["is1x2"]
    m &= a["groups"][cfg["group"]]
    idx = np.flatnonzero(m)
    if not len(idx):
        return {k: np.array([]) for k in ("day", "mid", "odds", "p", "edge", "win", "kelly", "row")}
    o, e = odds[idx], edge[idx]
    kel = e / (o - 1.0)
    key = kel if cfg.get("rank", "edge") == "kelly" else e
    mid, day = a["mid"][idx], a["day"][idx]
    # best selection per match
    order = np.lexsort((-key, mid))
    first = np.r_[True, mid[order][1:] != mid[order][:-1]]
    keep = order[first]
    # top-K per day by key
    order2 = keep[np.lexsort((-key[keep], day[keep]))]
    d2 = day[order2]
    starts = np.r_[True, d2[1:] != d2[:-1]]
    grp_start = np.maximum.accumulate(np.where(starts, np.arange(len(d2)), 0))
    rank = np.arange(len(d2)) - grp_start
    sel = order2[rank < cfg["K"]]
    rows = idx[sel]
    return {"day": day[sel], "mid": mid[sel], "odds": o[sel], "p": p[rows], "edge": e[sel], "win": a["win"][rows],
            "kelly": kel[sel], "row": rows}


def simulate(c, p, cfg, period, fs=FS, bank0=1000.0, curve=False):
    lo, hi = PERIODS[period] if isinstance(period, str) else period
    s = _pick(c, p, cfg, lo, hi)
    out = {}
    n = len(s["day"])
    win, odds = s["win"], s["odds"]
    flat = np.where(win == 1, odds - 1, -1.0) if n else np.array([])
    base = {"n": int(n), "roi_flat": float(flat.mean()) if n else 0.0, "winrate": float(win.mean()) if n else 0.0,
            "avg_odds": float(odds.mean()) if n else 0.0, "avg_edge": float(s["edge"].mean()) if n else 0.0}
    if not n:
        return {f: dict(base, final=bank0, log_growth=0.0, cagr=0.0, maxdd=0.0, r2=0.0, years={}) for f in fs}
    days = s["day"].astype(int)
    starts = np.flatnonzero(np.r_[True, days[1:] != days[:-1]])
    dday = days[starts]
    span_years = max((hi if hi < D("2029-01-01") else days[-1]) - lo, 30) / 365.25
    years = (EPOCH + pd.to_timedelta(dday, unit="D")).year.to_numpy()
    ychange = np.r_[years[1:] != years[:-1], True]
    for f in fs:
        frac = f * s["kelly"]
        tot = np.add.reduceat(frac, starts)
        scale = np.where(tot > 1.0, 1.0 / tot, 1.0)   # cannot stake more than the bankroll
        gain = np.add.reduceat(frac * flat, starts)
        mult = np.maximum(1.0 + scale * gain, 1e-12)
        eq = bank0 * np.cumprod(mult)
        peak = np.maximum.accumulate(np.r_[bank0, eq])[1:]
        mdd = float((1 - eq / peak).max())
        bank = float(eq[-1])
        lg = np.log(eq / bank0)
        x = dday.astype(float)
        if len(x) > 3 and lg.std() > 0:
            r = np.corrcoef(x, lg)[0, 1]
            r2 = float(r * r * np.sign(r))
        else:
            r2 = 0.0
        yrs, prev = {}, bank0
        for y, v in zip(years[ychange], eq[ychange]):
            yrs[int(y)] = round(float(v / prev - 1), 4); prev = v
        res = dict(base, final=round(bank, 2), log_growth=float(np.log(bank / bank0)), cagr=float((bank / bank0) ** (1 / span_years) - 1),
                   maxdd=round(mdd, 4), r2=round(r2, 4), years=yrs)
        if curve:
            res["curve"] = {"day": dday.tolist(), "bank": np.round(eq, 2).tolist()}
        out[f] = res
    return out


def default_grid():
    return [dict(thr=thr, lo=1.01, hi=hi, mkts=mk, group=g, K=K, rank=r, exec="max")
            for thr, hi, mk, g, K, r in itertools.product(
                [0.0, 0.01, 0.02, 0.03, 0.05, 0.08], [1.6, 2.0, 2.6, 4.0, 10.0], ["1X2", "OU", "all"],
                ["top5", "top8", "europe"], [1, 2, 3], ["edge", "kelly"])]


def objective(r):
    """Selection objective on 2006-2020: lower confidence bound of the mean yearly log growth.

    Rewards growth that is large AND repeated year after year; a few lucky seasons are not enough.
    """
    if r["n"] < 400:
        return -1e9
    ys = [np.log1p(v) for y, v in r["years"].items() if 2007 <= y <= 2019]  # full calendar years only
    if len(ys) < 8:
        return -1e9
    ys = np.array(ys)
    return float(ys.mean() - ys.std(ddof=1) / np.sqrt(len(ys)))


def choose_f(c, p, cfg):
    """Largest growth on 2006-2020 among Kelly fractions whose drawdown there stays <= MAX_SEL_DD."""
    r = simulate(c, p, cfg, "sel", fs=FS)
    ok = [f for f in FS if r[f]["maxdd"] <= MAX_SEL_DD]
    return max(ok, key=lambda f: r[f]["log_growth"]) if ok else min(FS)


def select_only(c, p, grid=None, top=5):
    """Same selection as select_and_report but returns ONLY 2006-2020 numbers (no test peeking).

    Use this while iterating on a method; call select_and_report once, at the very end.
    """
    grid = grid or default_grid()
    scored = []
    for cfg in grid:
        r = simulate(c, p, cfg, "sel", fs=(SELECT_F,))[SELECT_F]
        scored.append((objective(r), cfg, r))
    scored.sort(key=lambda x: -x[0])
    out = []
    for score, cfg, r in scored[: top * 3]:
        rt = simulate(c, p, cfg, "train", fs=(SELECT_F,))[SELECT_F]
        rva = simulate(c, p, cfg, "val", fs=(SELECT_F,))[SELECT_F]
        if rt["roi_flat"] <= 0 or rva["roi_flat"] <= 0:
            continue
        out.append({"cfg": cfg, "sel_score": round(score, 4), "n": r["n"], "roi_flat": round(r["roi_flat"], 4),
                    "maxdd_half_kelly": r["maxdd"], "x_growth_half_kelly": round(float(np.exp(r["log_growth"])), 1),
                    "roi_train": round(rt["roi_flat"], 4), "roi_val": round(rva["roi_flat"], 4)})
        if len(out) >= top:
            break
    return out


def select_and_report(c, p, label, grid=None, top=5, save=True, verbose=True):
    """Pick the config on VAL only, then report TRAIN/VAL/TEST for it (and for the next best ones)."""
    t0 = time.time()
    grid = grid or default_grid()
    scored = []
    for cfg in grid:
        r = simulate(c, p, cfg, "sel", fs=(SELECT_F,))[SELECT_F]
        scored.append((objective(r), cfg, r))
    scored.sort(key=lambda x: -x[0])
    picks = []
    for score, cfg, rv in scored:
        if len(picks) >= top:
            break
        rt = simulate(c, p, cfg, "train", fs=(SELECT_F,))[SELECT_F]
        rva = simulate(c, p, cfg, "val", fs=(SELECT_F,))[SELECT_F]
        if rt["roi_flat"] <= 0 or rva["roi_flat"] <= 0:  # must have won on both halves of the selection period
            continue
        f = choose_f(c, p, cfg)
        sel_f = simulate(c, p, cfg, "sel", fs=(f,))[f]
        rs = simulate(c, p, cfg, "test", fs=FS)
        picks.append({"cfg": cfg, "kelly_f": f, "sel_score": round(score, 4), "sel": sel_f, "train": rt, "val": rva,
                      "test": rs[f], "test_all_f": {str(k): {kk: v[kk] for kk in ("final", "cagr", "maxdd")} for k, v in rs.items()}})
    out = {"label": label, "n_configs": len(grid), "seconds": round(time.time() - t0, 1), "picks": picks}
    if verbose:
        for i, pk in enumerate(picks):
            t = pk["test"]
            print(f"[{label}] #{i + 1} {pk['cfg']} f={pk['kelly_f']}  score {pk['sel_score']:.3f} | 2006-20: n={pk['sel']['n']} roi {pk['sel']['roi_flat']:+.2%} dd {pk['sel']['maxdd']:.0%}"
                  f" | TEST: n={t['n']} roi {t['roi_flat']:+.2%} $1000->${t['final']:,.0f} cagr {t['cagr']:+.1%} dd {t['maxdd']:.0%} r2 {t['r2']:.2f}")
    if save:
        RESULTS.mkdir(parents=True, exist_ok=True)
        (RESULTS / f"{label}.json").write_text(json.dumps(out, indent=1, default=str))
    return out


def logloss(c, p, period="val", mkt="1X2"):
    """Mean log loss of p on the winning selections (lower is better), for comparing probability models."""
    lo, hi = PERIODS[period]
    m = (c.day.to_numpy() >= lo) & (c.day.to_numpy() <= hi) & (c.mkt.to_numpy() == mkt) & (c.win.to_numpy() == 1) & np.isfinite(p)
    return float(-np.log(np.clip(p[m], 1e-6, 1)).mean())


if __name__ == "__main__":
    c = load_candidates()
    p = baseline_p(c)
    print("logloss 1X2 val/test:", round(logloss(c, p, "val"), 5), round(logloss(c, p, "test"), 5))
    select_and_report(c, p, "baseline")
