"""Walk-forward driver: for each season s, fit on seasons [first, s-1] (optionally windowed / decayed), predict s."""
import numpy as np
import pandas as pd

from feats import build_match_features
from models import OffsetSoftmax

LEAGUES = ['B1', 'D1', 'D2', 'E0', 'E1', 'E2', 'E3', 'EC', 'F1', 'F2', 'G1', 'I1', 'I2', 'N1', 'P1', 'SC0', 'SC1', 'SC2', 'SC3', 'SP1', 'SP2', 'T1']
FIRST_TRAIN = 2005   # first season with real max-odds coverage
PRED_SEASONS = range(2006, 2027)


def lgt(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def design_1x2(F, fs):
    cols = {}
    lpb = {s: np.log(F[f"pb_{s}"].to_numpy()) for s in "HDA"}
    lpm = {s: np.log(F[f"pm_{s}"].to_numpy()) for s in "HDA"}
    if "lpb" in fs:
        for s in "HDA": cols[f"lpb_{s}"] = lpb[s]
    if "lpm" in fs:
        for s in "HDA": cols[f"lpm_{s}"] = lpm[s]
    if "ratio" in fs:
        for s in "HDA": cols[f"r_{s}"] = np.log(F[f"m_{s}"] / F[f"b_{s}"]).to_numpy()
    if "ovr" in fs:
        cols["ovr_b"] = F.ovr_b.to_numpy() - 1
        cols["ovr_m"] = F.ovr_m.to_numpy() - 1
    if "ah" in fs:
        miss = ~np.isfinite(F.sup_ah.to_numpy())
        cols["dsup"] = np.where(miss, 0.0, (F.sup_ah - F.sup_1x2).to_numpy())
        cols["ah_miss"] = miss.astype(float)
    if "ou" in fs:
        x = lgt(F.pb_O.to_numpy())
        miss = ~np.isfinite(x)
        cols["lgt_O"] = np.where(miss, 0.0, x)
        cols["ou_miss"] = miss.astype(float)
    if "lg" in fs:
        for c in LEAGUES[1:]: cols[f"lg_{c}"] = (F.lg.to_numpy() == c).astype(float)
    if "fav" in fs:
        pH, pA = F.pb_H.to_numpy(), F.pb_A.to_numpy()
        cols["fav_gap"] = np.abs(pH - pA)
        cols["fav_gap2"] = (pH - pA) ** 2
    X = pd.DataFrame(cols, index=F.index)
    return X


def design_ou(F, fs):
    cols = {}
    if "lpb" in fs:
        cols["lgt_pbO"] = lgt(F.pb_O.to_numpy())
    if "lpm" in fs:
        cols["lgt_pmO"] = lgt(F.pm_O.to_numpy())
    if "ratio" in fs:
        for s in "OU": cols[f"r_{s}"] = np.log(F[f"m_{s}"] / F[f"b_{s}"]).to_numpy()
    if "ovr" in fs:
        cols["ovr_bo"] = F.ovr_bo.to_numpy() - 1
        cols["ovr_mo"] = F.ovr_mo.to_numpy() - 1
    if "x1x2" in fs:
        pH, pD, pA = (F[f"pb_{s}"].to_numpy() for s in "HDA")
        cols["pD"] = pD
        cols["gap"] = np.abs(pH - pA)
        cols["gap2"] = (pH - pA) ** 2
    if "ah" in fs:
        miss = ~np.isfinite(F.sup_ah.to_numpy())
        cols["dsup"] = np.where(miss, 0.0, (F.sup_ah - F.sup_1x2).to_numpy())
        cols["abs_sup_ah"] = np.where(miss, 0.0, np.abs(F.sup_ah.to_numpy()))
        cols["ah_miss"] = miss.astype(float)
    if "lg" in fs:
        for c in LEAGUES[1:]: cols[f"lg_{c}"] = (F.lg.to_numpy() == c).astype(float)
    return pd.DataFrame(cols, index=F.index)


def offset_1x2(F, kind):
    pre = {"b": "pb", "m": "pm", "q": "qm"}[kind]
    return np.log(np.column_stack([F[f"{pre}_{s}"].to_numpy() for s in "HDA"]))


def offset_ou(F, kind):
    pre = {"b": "pb", "m": "pm", "q": "qm"}[kind]
    return np.log(np.column_stack([F[f"{pre}_{s}"].to_numpy() for s in "OU"]))


def walk_forward(F, X, off, y, lam=1.0, window=None, decay=None, seasons=PRED_SEASONS, last_season=None, model_fn=None):
    """Return (n, K) probability array; NaN for rows not predicted.

    last_season: if set, only predict seasons <= last_season (to save time while iterating).
    """
    K = off.shape[1]
    out = np.full((len(F), K), np.nan)
    Xv = X.to_numpy(float)
    ok = np.isfinite(off).all(1) & np.isfinite(Xv).all(1)
    yok = ok & (y >= 0)
    season = F.season.to_numpy()
    for s in seasons:
        if last_season is not None and s > last_season:
            break
        lo = FIRST_TRAIN if window is None else max(FIRST_TRAIN, s - window)
        tr = yok & (season >= lo) & (season < s)
        te = ok & (season == s)
        if not te.any():
            continue
        w = None
        if decay is not None:
            w = decay ** (s - 1 - season[tr])
        m = (model_fn() if model_fn else OffsetSoftmax(lam=lam)).fit(Xv[tr], off[tr], y[tr], w)
        out[te] = m.predict(Xv[te], off[te])
    return out
