"""Bet-level model: P(win) for each candidate row, boosted/regressed from the market offset logit(pb_sel).

All features come from the pre-match odds of the same match (Bet365 + market max), plus league/selection ids.
Walk-forward: model for season s is fit on candidate rows of seasons [FIRST_TRAIN, s-1].
"""
import numpy as np
import pandas as pd

from feats import build_match_features

SELS = ["H", "D", "A", "O", "U"]
OTHERS = {"H": "DA", "D": "HA", "A": "HD", "O": "U", "U": "O"}


def lgt(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def bet_features(c, F=None):
    F = build_match_features() if F is None else F
    mid = c.mid.to_numpy()
    sel = c.sel.to_numpy()
    n = len(c)
    out = {k: np.full(n, np.nan) for k in ("lp_b", "lp_m", "lq_m", "r", "r_oth_max", "r_oth_mean", "ovr_b", "ovr_m", "lodds",
                                          "pb_oth_max", "is_fav")}
    for s in SELS:
        rows = np.flatnonzero(sel == s)
        G = F.loc[mid[rows]]
        mkt1x2 = s in "HDA"
        pb = G[f"pb_{s}"].to_numpy(); pm = G[f"pm_{s}"].to_numpy(); qm = G[f"qm_{s}"].to_numpy()
        out["lp_b"][rows] = lgt(pb)
        out["lp_m"][rows] = lgt(pm)
        out["lq_m"][rows] = lgt(qm)
        out["r"][rows] = np.log(G[f"m_{s}"] / G[f"b_{s}"]).to_numpy()
        ro = np.column_stack([np.log(G[f"m_{o}"] / G[f"b_{o}"]).to_numpy() for o in OTHERS[s]])
        out["r_oth_max"][rows] = ro.max(1)
        out["r_oth_mean"][rows] = ro.mean(1)
        out["ovr_b"][rows] = (G.ovr_b if mkt1x2 else G.ovr_bo).to_numpy() - 1
        out["ovr_m"][rows] = (G.ovr_m if mkt1x2 else G.ovr_mo).to_numpy() - 1
        out["lodds"][rows] = np.log(G[f"b_{s}"]).to_numpy()
        po = np.column_stack([G[f"pb_{o}"].to_numpy() for o in OTHERS[s]])
        out["pb_oth_max"][rows] = po.max(1)
        out["is_fav"][rows] = (pb > po.max(1)).astype(float)
    X = pd.DataFrame(out)
    for s in SELS:
        X[f"sel_{s}"] = (sel == s).astype(float)
    return X
