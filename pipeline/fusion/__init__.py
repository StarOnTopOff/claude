"""Fusion model: Bet365 no-vig 1X2 prices corrected by team strength and cross-market structure.

Production copy of research/q2-fusion (see its METHOD.md). The research code worked on the
harness caches; this package works on any match frame passed in, so the backtest and the
live predictions go through the very same code:

    features.build_features(df)   pre-match features of every row (played or not)
    walk_forward(f, df)            per season s: fit on seasons s-10..s-1, predict season s
    predict_upcoming(fin, up)      the same, for fixtures that have not been played yet

1X2 p = 0.5 * market-offset logit + 0.5 * LightGBM boosted from the market (mean of 3 seeds).
O/U p = Bet365 no-vig, unchanged (the method does not model O/U).
"""
import time

import numpy as np
import pandas as pd

from . import lgbm
from .features import COUNTRY, build_features, played_mask
from .model import Std, design_1x2, fit_softmax, predict_softmax

GROUPS = ["mkt", "xmkt", "rate", "form", "stats", "ctx", "lg"]
LAM = 0.1           # L2 penalty of the logit
WINDOW = 10         # training seasons before the predicted one
ROUNDS = 100        # LightGBM boosting rounds
SEEDS = (1, 2, 3)   # LightGBM seeds averaged
FIRST_SEASON = 2005
MIN_TRAIN = 2000    # a season is predicted only with at least this many training matches
EPOCH = pd.Timestamp("2000-01-01")  # `day` = days since EPOCH (same as research/harness.py)

__all__ = ["build_features", "walk_forward", "predict_upcoming", "make_frame", "add_day"]


def add_day(df):
    df["day"] = (df.MatchDate - EPOCH).dt.days.astype(int)
    return df


class _Inputs:
    """Design matrices, market offsets and labels for every row, computed once."""

    def __init__(self, f, df):
        self.X = design_1x2(f, GROUPS)
        self.Xl = lgbm.design_lgb(f, GROUPS)
        self.off = np.log(f[["pH", "pD", "pA"]].to_numpy())
        self.y = df.FTResult.map({"H": 0, "D": 1, "A": 2}).fillna(-1).to_numpy().astype(int)
        self.ok = np.isfinite(self.off).all(1)          # Bet365 1X2 odds available
        self.played = played_mask(df)
        self.season = f.season.to_numpy()


def _season_p(inp, s, te):
    """Fit both models for season s on PLAYED matches of seasons s-10..s-1 and predict the rows `te`.

    Nothing from season s (or later) enters the fit. Returns None when the training set is too small."""
    tr = inp.ok & inp.played & (inp.season < s) & (inp.season >= s - WINDOW)
    if tr.sum() < MIN_TRAIN:
        return None
    # 1) market-offset logit
    st = Std().fit(inp.X[tr])
    theta = fit_softmax(st.transform(inp.X[tr]), inp.off[tr], inp.y[tr], np.ones(int(tr.sum())), LAM, 3)
    p_logit = predict_softmax(theta, st.transform(inp.X[te]), inp.off[te], 3)
    # 2) LightGBM from the market, averaged over seeds
    Xtr, Xte = inp.Xl[tr], inp.Xl[te]
    p_lgb = np.mean([lgbm.predict(lgbm.fit(Xtr, inp.off[tr], inp.y[tr], ROUNDS, sd), Xte, inp.off[te], ROUNDS)
                     for sd in SEEDS], axis=0)
    return 0.5 * p_logit + 0.5 * p_lgb


def walk_forward(f, df, seasons=None, rows=None, verbose=False):
    """(len(df), 3) array of 1X2 probabilities, NaN where not predicted.

    seasons: seasons to predict (default: FIRST_SEASON .. last season of df).
    rows: optional boolean mask restricting the predicted rows (training rows are unaffected)."""
    inp = _Inputs(f, df)
    P = np.full((len(f), 3), np.nan)
    if seasons is None:
        seasons = range(FIRST_SEASON, int(inp.season.max()) + 1)
    for s in seasons:
        te = inp.ok & (inp.season == s)
        if rows is not None:
            te &= rows
        if not te.any():
            continue
        t0 = time.time()
        p = _season_p(inp, s, te)
        if p is not None:
            P[te] = p
        if verbose:
            print(f"  fusion season {s}: {int(te.sum())} predicted in {time.time() - t0:.1f}s", flush=True)
    return P


def _team_keys(df, side):
    return (df.Division.map(COUNTRY) + ":" + df[f"{side}Team"]).to_numpy()


def make_frame(finished, upcoming):
    """Played matches (kept as given, index 0..n-1) followed by the upcoming fixtures that can be rated.

    Dropped upcoming rows: already in `finished` (same division, date and teams), or not strictly after
    the last played match of one of its teams (stale or postponed), or a second match of a team on one day.
    Returns (frame, positions): positions[i] = row of upcoming.iloc[i] in the frame, or -1 if dropped."""
    fin = finished.reset_index(drop=True)
    up = upcoming.reset_index(drop=True)
    pos = np.full(len(up), -1)
    if len(up):
        fin_day = (fin.MatchDate - EPOCH).dt.days.to_numpy()
        up_day = (up.MatchDate - EPOCH).dt.days.to_numpy()
        key = lambda d: d.Division + "|" + d.MatchDate.dt.strftime("%Y-%m-%d") + "|" + d.HomeTeam + "|" + d.AwayTeam  # noqa: E731
        keep = ~key(up).isin(set(key(fin))).to_numpy()
        last = pd.concat([pd.Series(fin_day, index=_team_keys(fin, "Home")),
                          pd.Series(fin_day, index=_team_keys(fin, "Away"))]).groupby(level=0).max()
        for side in ("Home", "Away"):
            lp = pd.Series(_team_keys(up, side)).map(last).to_numpy(float)
            keep &= ~(lp >= up_day)  # NaN (new team) -> keep
        ht, at = _team_keys(up, "Home"), _team_keys(up, "Away")
        seen = set()
        for i in np.flatnonzero(keep):
            k1, k2 = (ht[i], up_day[i]), (at[i], up_day[i])
            if k1 in seen or k2 in seen:
                keep[i] = False
            seen.update((k1, k2))
        pos[keep] = len(fin) + np.arange(int(keep.sum()))
        up = up[keep]
    df = pd.concat([fin, up], ignore_index=True)
    return add_day(df), pos


def predict_upcoming(finished, upcoming, verbose=False):
    """1X2 probabilities for unplayed fixtures: (P of shape (len(upcoming), 3), kept mask).

    Same path as the backtest: features on (played history + fixtures), then the season model(s)
    fit on the 10 seasons before each fixture's season. kept[i] is False for fixtures make_frame
    rejected; P is NaN for those and for fixtures without Bet365 1X2 odds."""
    df, pos = make_frame(finished, upcoming)
    kept = pos >= 0
    out = np.full((len(upcoming), 3), np.nan)
    if not kept.any():
        return out, kept
    f = build_features(df)
    rows = np.zeros(len(df), bool)
    rows[pos[kept]] = True
    seasons = sorted(set(df.season.to_numpy()[rows].tolist()))
    P = walk_forward(f, df, seasons=seasons, rows=rows, verbose=verbose)
    out[kept] = P[pos[kept]]
    return out, kept
