"""Load historical matches and derive fair probabilities.

Every probability used for a bet on match m is computed only from data that
existed before m kicked off: bookmaker odds collected before the match and an
Elo model fitted on previous seasons only (walk-forward).
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

from config import FIRST_SEASON, LEAGUES, RAW

OUTCOMES = np.array(["H", "D", "A"])


MATCHES_CSV = RAW / "matches" / "data" / "Matches.csv"


def read_raw(path=None):
    """The historical dataset as published (one row per match, all divisions, not cleaned)."""
    return pd.read_csv(path or MATCHES_CSV, low_memory=False)


def load_matches(path=None, extra=None):
    """Played matches of our 22 divisions, cleaned and sorted (row order = harness `mid`).

    extra: more raw rows in the same schema, appended before cleaning (live current-season
    results from football-data.co.uk, see livedata.py)."""
    raw = read_raw(path)
    if extra is not None and len(extra):
        raw = pd.concat([raw, extra.reindex(columns=raw.columns).astype(raw.dtypes.to_dict())], ignore_index=True)
    return clean_matches(raw)


def clean_matches(df, keep_unplayed=False):
    """Filter to our divisions, parse dates, add `season`, sort, and clean the odds.

    keep_unplayed: keep rows without a result (upcoming fixtures with pre-match odds)."""
    df = df[df.Division.isin(LEAGUES)].copy()
    df["MatchDate"] = pd.to_datetime(df["MatchDate"])
    if not keep_unplayed:
        df = df.dropna(subset=["FTHome", "FTAway", "FTResult"])
    df["season"] = np.where(df.MatchDate.dt.month >= 7, df.MatchDate.dt.year, df.MatchDate.dt.year - 1)
    df = df.sort_values(["MatchDate", "MatchTime", "Division", "HomeTeam"], kind="mergesort").reset_index(drop=True)

    # Max odds must be >= Bet365 (Bet365 is one of the books) and not absurd.
    for side, b365 in (("Home", "OddHome"), ("Draw", "OddDraw"), ("Away", "OddAway"), ("Over25", "Over25"), ("Under25", "Under25")):
        mx = "Max" + side
        ratio = df[mx] / df[b365]
        bad = (ratio > 1.6) | (df[mx] > 60)
        df.loc[bad, mx] = np.nan
        df[mx] = np.fmax(df[mx], df[b365])
    for c in ("OddHome", "OddDraw", "OddAway", "Over25", "Under25"):
        df.loc[(df[c] < 1.01) | (df[c] > 60), c] = np.nan
    return df


def novig_proportional(odds):
    inv = 1.0 / odds
    return inv / inv.sum(axis=1, keepdims=True)


def novig_power(odds, iters=40):
    """Power method: find k with sum((1/o)^k) = 1. Corrects favourite-longshot bias."""
    inv = 1.0 / odds
    lo = np.full(len(odds), 1.0)
    hi = np.full(len(odds), 3.0)
    for _ in range(iters):
        k = (lo + hi) / 2
        s = (inv ** k[:, None]).sum(axis=1)
        over = s > 1
        lo = np.where(over, k, lo)
        hi = np.where(over, hi, k)
    k = (lo + hi) / 2
    p = inv ** k[:, None]
    return p / p.sum(axis=1, keepdims=True)


def elo_features(df, league_codes):
    d = ((df.HomeElo - df.AwayElo) / 100.0).to_numpy()
    X = [d, np.abs(d), d ** 2 / 10]
    for c in league_codes:
        X.append((df.Division == c).to_numpy().astype(float))
    return np.column_stack(X)


def fit_elo_model(df):
    """Multinomial logit P(H/D/A | Elo diff, league). Returns sklearn model."""
    codes = list(LEAGUES)
    sub = df.dropna(subset=["HomeElo", "AwayElo"])
    X = elo_features(sub, codes)
    y = sub.FTResult.map({"H": 0, "D": 1, "A": 2}).to_numpy()
    model = LogisticRegression(C=10.0, max_iter=500)
    model.fit(X, y)
    return model


def walk_forward_elo(df, window=10):
    """For each season s, fit on seasons [s-window, s-1] and predict season s."""
    codes = list(LEAGUES)
    probs = np.full((len(df), 3), np.nan)
    has = df.HomeElo.notna() & df.AwayElo.notna()
    for s in range(FIRST_SEASON, int(df.season.max()) + 1):
        train = df[(df.season < s) & (df.season >= s - window)]
        model = fit_elo_model(train)
        idx = np.where((df.season == s) & has)[0]
        if len(idx):
            probs[idx] = model.predict_proba(elo_features(df.iloc[idx], codes))
    return probs


def latest_elo_model(df, window=10):
    last = int(df.season.max())
    # Fit on the most recent complete seasons (exclude a barely-started one).
    train = df[(df.season < last) & (df.season >= last - window)]
    model = fit_elo_model(train)
    coef = {
        "classes": ["H", "D", "A"],
        "features": ["d", "abs_d", "d2_over_10"] + [f"lg_{c}" for c in LEAGUES],
        "coef": model.coef_.round(6).tolist(),
        "intercept": model.intercept_.round(6).tolist(),
    }
    return model, coef


def build_frame(df):
    """Arrays used by the backtester."""
    o_b365 = df[["OddHome", "OddDraw", "OddAway"]].to_numpy(float)
    o_max = df[["MaxHome", "MaxDraw", "MaxAway"]].to_numpy(float)
    ok = np.isfinite(o_b365).all(axis=1)
    p_prop = np.full_like(o_b365, np.nan)
    p_pow = np.full_like(o_b365, np.nan)
    p_prop[ok] = novig_proportional(o_b365[ok])
    p_pow[ok] = novig_power(o_b365[ok])
    p_elo = walk_forward_elo(df)

    ou_b365 = df[["Over25", "Under25"]].to_numpy(float)
    ou_max = df[["MaxOver25", "MaxUnder25"]].to_numpy(float)
    ok2 = np.isfinite(ou_b365).all(axis=1)
    p_ou = np.full_like(ou_b365, np.nan)
    p_ou[ok2] = novig_power(ou_b365[ok2])

    res = df.FTResult.to_numpy()
    win = np.column_stack([res == "H", res == "D", res == "A"])
    goals = (df.FTHome + df.FTAway).to_numpy()
    win_ou = np.column_stack([goals > 2.5, goals < 2.5])
    return {
        "o_b365": o_b365, "o_max": o_max, "p_prop": p_prop, "p_pow": p_pow, "p_elo": p_elo,
        "ou_b365": ou_b365, "ou_max": ou_max, "p_ou": p_ou,
        "win": win, "win_ou": win_ou,
    }


if __name__ == "__main__":
    df = load_matches()
    print(df.shape, df.MatchDate.min(), df.MatchDate.max())
    fr = build_frame(df)
    from sklearn.metrics import log_loss
    m = (df.season >= 2014).to_numpy() & np.isfinite(fr["p_elo"]).all(1) & np.isfinite(fr["p_pow"]).all(1)
    y = df.FTResult.map({"H": 0, "D": 1, "A": 2}).to_numpy()[m]
    for k in ("p_prop", "p_pow", "p_elo"):
        print(k, round(log_loss(y, fr[k][m]), 5))
    for w in (0.5, 0.75, 0.9):
        print("blend", w, round(log_loss(y, w * fr["p_pow"][m] + (1 - w) * fr["p_elo"][m]), 5))
