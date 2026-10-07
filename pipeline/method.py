"""The betting method used by the app: probabilities, filters, daily cap and Kelly fraction.

Method = research track q2-fusion (research/q2-fusion/METHOD.md, results in
research/results/q2-fusion.json), run from the production copy in pipeline/fusion/.

`historical_p` gives a walk-forward probability for every candidate bet in the history
(research/harness.py candidate table); `live_p` gives the same probability for upcoming
fixtures, from the data available before kick-off, through the same feature and model code.
"""
import sys
import traceback
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "research"))
import fusion  # noqa: E402
import harness  # noqa: E402
from data import novig_power  # noqa: E402

METHOD = {
    "name": "Fusion model, top 3 a day",
    "cfg": {"thr": 0.02, "lo": 1.01, "hi": 4.0, "mkts": "all", "group": "europe", "K": 3, "rank": "edge", "exec": "max"},
    "kelly_f": 0.25,
    "summary": "Starts from Bet365's prices with the bookmaker margin removed and lets two models nudge the "
               "home/draw/away probabilities: a regularised logistic model and a gradient-boosted tree model, "
               "both refit every July on the previous ten seasons. They read how the other pre-match markets "
               "(over/under 2.5 goals, Asian handicap) disagree with the 1X2 price, and each team's Elo, "
               "attack and defence ratings, recent results against market expectations, shots and corners, "
               "all from matches played before the day. Over/under probabilities are Bet365's no-margin prices. "
               "Bet the best available price at odds below 4 when it beats the probability by more than 2 %, "
               "at most one bet per match, keep the 3 largest edges of the day and stake a quarter of the "
               "Kelly fraction.",
}

SELS = ["H", "D", "A", "O", "U"]


def to_candidates(c, P1, base):
    """Match-level 1X2 probabilities -> candidate rows; the market's no-vig p where the model has none
    (O/U rows, or a match without a model). Same mapping as research/q2-fusion/model.py."""
    p = base.copy()
    mid, sel = c.mid.to_numpy(), c.sel.to_numpy()
    for s, j in (("H", 0), ("D", 1), ("A", 2)):
        m = sel == s
        v = P1[mid[m], j]
        p[np.flatnonzero(m)[np.isfinite(v)]] = v[np.isfinite(v)]
    p[~np.isfinite(base)] = np.nan  # never a probability where the market has none
    return p


def historical_p(c, verbose=True):
    """Walk-forward p for every row of the candidate table c (= harness.load_candidates())."""
    df = harness.load_matches_cached()  # the match table c was built from (mid = row)
    f = fusion.build_features(df)
    P1 = fusion.walk_forward(f, df, verbose=verbose)
    return to_candidates(c, P1, harness.baseline_p(c))


def market_p(df):
    """Bet365 no-vig (power method) per row: DataFrame with columns H D A O U (NaN without odds)."""
    out = pd.DataFrame(np.nan, index=df.index, columns=SELS)
    for cols, sels in ((["OddHome", "OddDraw", "OddAway"], ["H", "D", "A"]), (["Over25", "Under25"], ["O", "U"])):
        o = df[cols].to_numpy(float)
        ok = np.isfinite(o).all(1) & (o > 1).all(1)
        if ok.any():
            out.loc[ok, sels] = novig_power(o[ok])
    return out


def live_p(finished, upcoming, verbose=True):
    """Probabilities for upcoming fixtures from the data available before kick-off.

    finished: played matches (data.load_matches schema), upcoming: fixtures with pre-match odds and
    no result (same schema). Returns (DataFrame indexed like `upcoming` with columns H D A O U, mode):
      mode "fusion":   H/D/A from the fusion model, O/U = Bet365 no-vig. Fixtures the model rejects
                       (already played, stale or duplicated) get no probability at all.
      mode "fallback": the fusion path raised; every probability is Bet365 no-vig for this run.
    """
    out = market_p(upcoming)
    if not out[["H", "D", "A"]].notna().all(1).any():
        return out, "fusion"  # no 1X2 odds to price: nothing for the model to do
    try:
        P, kept = fusion.predict_upcoming(finished, upcoming, verbose=verbose)
    except Exception:  # noqa: BLE001  (any failure of the live path must not stop the refresh)
        traceback.print_exc()
        print("fusion live path failed: Bet365 no-vig probabilities for this run", file=sys.stderr)
        return out, "fallback"
    has = np.isfinite(P).all(1)
    vals = out.to_numpy(copy=True)
    vals[has, :3] = P[has]
    vals[~kept] = np.nan
    return pd.DataFrame(vals, index=upcoming.index, columns=SELS), "fusion"
