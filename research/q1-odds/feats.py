"""Per-match pre-match odds features (q1-odds). Uses ONLY pre-match odds columns of the match row itself."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from harness import load_candidates, load_matches_cached, novig_power  # noqa: E402
from scipy.stats import norm  # noqa: E402

CACHE = HERE / "cache"


def _clean(x, lo=1.01, hi=60.0):
    x = np.asarray(x, float).copy()
    x[(x < lo) | (x > hi)] = np.nan
    return x


def power_rows(odds):
    """No-vig power probabilities, NaN rows kept NaN."""
    out = np.full(odds.shape, np.nan)
    ok = np.isfinite(odds).all(axis=1)
    out[ok] = novig_power(odds[ok])
    return out


def build_match_features(df=None):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / "mf.pkl"
    if f.exists():
        return pd.read_pickle(f)
    df = df if df is not None else load_matches_cached()
    F = pd.DataFrame(index=df.index)
    F["day"] = df.day.to_numpy()
    F["season"] = df.season.to_numpy()
    F["lg"] = df.Division.to_numpy()
    b = np.column_stack([_clean(df[c]) for c in ("OddHome", "OddDraw", "OddAway")])
    m = np.column_stack([_clean(df[c]) for c in ("MaxHome", "MaxDraw", "MaxAway")])
    m = np.where(np.isfinite(m), m, b)
    bo = np.column_stack([_clean(df[c]) for c in ("Over25", "Under25")])
    mo = np.column_stack([_clean(df[c]) for c in ("MaxOver25", "MaxUnder25")])
    mo = np.where(np.isfinite(mo), mo, bo)
    for i, s in enumerate("HDA"):
        F[f"b_{s}"] = b[:, i]
        F[f"m_{s}"] = m[:, i]
    for i, s in enumerate("OU"):
        F[f"b_{s}"] = bo[:, i]
        F[f"m_{s}"] = mo[:, i]
    F["ovr_b"] = (1 / b).sum(1)
    F["ovr_m"] = (1 / m).sum(1)
    F["ovr_bo"] = (1 / bo).sum(1)
    F["ovr_mo"] = (1 / mo).sum(1)
    pb = power_rows(b)
    pm = power_rows(m)
    pbo = power_rows(bo)
    pmo = power_rows(mo)
    # proportional no-vig of max odds
    qm = (1 / m) / (1 / m).sum(1, keepdims=True)
    qmo = (1 / mo) / (1 / mo).sum(1, keepdims=True)
    for i, s in enumerate("HDA"):
        F[f"pb_{s}"] = pb[:, i]
        F[f"pm_{s}"] = pm[:, i]
        F[f"qm_{s}"] = qm[:, i]
    for i, s in enumerate("OU"):
        F[f"pb_{s}"] = pbo[:, i]
        F[f"pm_{s}"] = pmo[:, i]
        F[f"qm_{s}"] = qmo[:, i]
    # Asian handicap (Bet365): line for home team and odds
    L = df.HandiSize.to_numpy(float)
    ah = _clean(df.HandiHome, 1.1, 5.0)
    aa = _clean(df.HandiAway, 1.1, 5.0)
    L = np.where(np.isfinite(ah) & np.isfinite(aa) & (np.abs(L) <= 4), L, np.nan)
    pah = (1 / ah) / (1 / ah + 1 / aa)
    F["ah_L"] = L
    F["ah_p"] = pah
    F["ah_ovr"] = 1 / ah + 1 / aa
    # supremacy implied by AH (normal approx, sigma 1.75 goals)
    F["sup_ah"] = 1.75 * norm.ppf(np.clip(pah, 0.02, 0.98)) - L
    # supremacy implied by 1X2: P(H)-P(A) mapped via same normal approx (ignoring draw mass shape)
    F["sup_1x2"] = 1.75 * (norm.ppf(np.clip(pb[:, 0] + pb[:, 1] / 2, 0.02, 0.98)))
    F["res"] = df.FTResult.map({"H": 0, "D": 1, "A": 2}).to_numpy()
    F["over"] = ((df.FTHome + df.FTAway) > 2.5).astype(int).to_numpy()
    F.to_pickle(f)
    return F


def to_candidates(c, P):
    """P: DataFrame indexed by mid with columns among H,D,A,O,U -> np.array aligned to c rows."""
    p = np.full(len(c), np.nan)
    mid = c.mid.to_numpy()
    sel = c.sel.to_numpy()
    for s in P.columns:
        r = np.flatnonzero(sel == s)
        p[r] = P[s].reindex(mid[r]).to_numpy()
    return p
