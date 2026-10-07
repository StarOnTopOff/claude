"""q2-fusion: market-offset stacked logit, fit walk-forward per season.

1X2:  z_k = log p_mkt_k + b_k + x . B_k        (softmax over H/D/A, L2 on b, B)
O/U:  z   = logit p_mkt_O + b + x . B          (sigmoid)
p_mkt = Bet365 no-vig (power method) = harness.baseline_p.
Model for season s is fit on matches of seasons [s-W, s-1] only (all of whose results are known before
season s starts); features are pre-match (features.py).
"""
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import harness  # noqa: E402
from features import COUNTRY  # noqa: E402

LEAGUES = list(COUNTRY)
FIRST_PRED = 2005


def _clip(x, q=6.0):
    return np.clip(x, -q, q)


def design_1x2(f, groups):
    """Feature groups -> dict name -> column (raw, unstandardized)."""
    X = {}
    lp = np.log(f[["pH", "pD", "pA"]].to_numpy())
    if "mkt" in groups:  # market calibration (favourite-longshot, draw level)
        X["lpH"], X["lpD"], X["lpA"] = lp.T
        X["ovr3"] = f.ovr3
    if "mx" in groups:   # other books vs Bet365
        X["lmxH"], X["lmxD"], X["lmxA"] = f.lmxH, f.lmxD, f.lmxA
    if "xmkt" in groups:  # cross-market consistency
        X["dD_pois"] = f.dD_pois
        X["dsup_ah"] = f.dsup_ah.clip(-1, 1)
        X["T_ou"] = f.T_ou
        X["lmxOU"] = f.lmxO - f.lmxU
    if "rate" in groups:  # team strength ratings vs market
        X["elo_d"] = (f.elo_h - f.elo_a) / 100
        X["rl_sup_vs_mkt"] = (f.rl_h - f.rl_a) - f.sup_1x2
        X["rl_tot_vs_mkt"] = (f.rl_h + f.rl_a) - f.T_ou
    if "form" in groups:  # rolling form: home minus away
        for v in ("rpts", "rgf", "rga", "rsot", "gf", "ga", "pts"):
            for hl in (5, 20):
                X[f"d_{v}_e{hl}"] = f[f"h_{v}_e{hl}"] - f[f"a_{v}_e{hl}"]
        X["h_rpts_ven"], X["a_rpts_ven"] = f.h_rpts_ven, f.a_rpts_ven
        X["d_rpts_seas"] = f.h_rpts_seas - f.a_rpts_seas
    if "stats" in groups:
        for v in ("sotf", "sota", "shf", "sha", "cof", "coa"):
            for hl in (5, 20):
                X[f"d_{v}_e{hl}"] = f[f"h_{v}_e{hl}"] - f[f"a_{v}_e{hl}"]
    if "ctx" in groups:
        X["h_rest"], X["a_rest"] = f.h_rest.fillna(14).clip(2, 21), f.a_rest.fillna(14).clip(2, 21)
        X["early"] = (np.minimum(f.h_nseason, f.a_nseason) < 5).astype(float)
        X["newdiv_d"] = f.newdiv_h - f.newdiv_a
        X["lownprev"] = (np.minimum(f.h_nprev, f.a_nprev) < np.log1p(20)).astype(float)
    if "lg" in groups:
        for l in LEAGUES:
            X[f"lg_{l}"] = (f.lg == l).astype(float)
    return pd.DataFrame(X, index=f.index)


def design_ou(f, groups):
    X = {}
    po = f.pO.to_numpy()
    if "mkt" in groups:
        X["lgtO"] = np.log(po / (1 - po))
        X["ovr2"] = f.ovr2
        X["lpD"] = np.log(f.pD)
        X["absup"] = np.abs(f.sup_1x2)
    if "mx" in groups:
        X["lmxO"], X["lmxU"] = f.lmxO, f.lmxU
    if "xmkt" in groups:
        X["dD_pois"] = f.dD_pois
        X["dsup_ah"] = f.dsup_ah.clip(-1, 1)
    if "rate" in groups:
        X["rl_tot_vs_mkt"] = (f.rl_h + f.rl_a) - f.T_ou
    if "form" in groups:
        for hl in (5, 20):
            X[f"s_rgf_e{hl}"] = f[f"h_rgf_e{hl}"] + f[f"a_rgf_e{hl}"]
            X[f"s_rga_e{hl}"] = f[f"h_rga_e{hl}"] + f[f"a_rga_e{hl}"]
            X[f"s_g_e{hl}"] = f[f"h_gf_e{hl}"] + f[f"h_ga_e{hl}"] + f[f"a_gf_e{hl}"] + f[f"a_ga_e{hl}"] - 2 * f.T_ou
        X["s_rgf_ven"] = f.h_rgf_ven + f.a_rgf_ven
        X["s_rga_ven"] = f.h_rga_ven + f.a_rga_ven
    if "stats" in groups:
        for hl in (5, 20):
            X[f"s_sot_e{hl}"] = f[f"h_sotf_e{hl}"] + f[f"h_sota_e{hl}"] + f[f"a_sotf_e{hl}"] + f[f"a_sota_e{hl}"]
            X[f"s_sh_e{hl}"] = f[f"h_shf_e{hl}"] + f[f"h_sha_e{hl}"] + f[f"a_shf_e{hl}"] + f[f"a_sha_e{hl}"]
            X[f"s_co_e{hl}"] = f[f"h_cof_e{hl}"] + f[f"h_coa_e{hl}"] + f[f"a_cof_e{hl}"] + f[f"a_coa_e{hl}"]
    if "ctx" in groups:
        X["h_rest"], X["a_rest"] = f.h_rest.fillna(14).clip(2, 21), f.a_rest.fillna(14).clip(2, 21)
        X["early"] = (np.minimum(f.h_nseason, f.a_nseason) < 5).astype(float)
        for m in (8, 9, 10, 11, 12, 1, 2, 3, 4, 5):
            X[f"m{m}"] = (f.month == m).astype(float)
    if "lg" in groups:
        for l in LEAGUES:
            X[f"lg_{l}"] = (f.lg == l).astype(float)
    return pd.DataFrame(X, index=f.index)


class Std:
    """Standardize on the training rows; NaN -> 0 (the training mean) plus one missing indicator per
    distinct missingness pattern seen in training (e.g. shots block, O/U-odds block)."""

    def fit(self, X):
        self.mu = X.mean()
        self.sd = X.std().replace(0, 1).fillna(1)
        reps, seen = [], set()
        for c in X.columns:
            m = X[c].isna().to_numpy()
            if m.any():
                key = hash(np.packbits(m).tobytes())
                if key not in seen:
                    seen.add(key)
                    reps.append(c)
        self.reps = reps
        return self

    def transform(self, X):
        Z = ((X - self.mu) / self.sd).clip(-6, 6).fillna(0.0).to_numpy(float)
        if not self.reps:
            return Z
        M = np.column_stack([X[c].isna().to_numpy(float) for c in self.reps])
        return np.hstack([Z, M])


def fit_softmax(Z, off, y, w, lam, k):
    n, d = Z.shape

    def fg(theta):
        b = theta[:k]
        B = theta[k:].reshape(d, k)
        s = off + b + Z @ B
        s -= s.max(1, keepdims=True)
        e = np.exp(s)
        P = e / e.sum(1, keepdims=True)
        ll = -(w * np.log(P[np.arange(n), y] + 1e-15)).sum()
        G = P.copy()
        G[np.arange(n), y] -= 1
        G *= w[:, None]
        gb = G.sum(0)
        gB = Z.T @ G
        W = w.sum()
        f = ll / W + 0.5 * lam * (theta ** 2).sum()
        g = np.r_[gb, gB.ravel()] / W + lam * theta
        return f, g

    r = minimize(fg, np.zeros(k + d * k), jac=True, method="L-BFGS-B", options={"maxiter": 500})
    return r.x


def predict_softmax(theta, Z, off, k):
    d = Z.shape[1]
    s = off + theta[:k] + Z @ theta[k:].reshape(d, k)
    s -= s.max(1, keepdims=True)
    e = np.exp(s)
    return e / e.sum(1, keepdims=True)


def walk_forward(f, df, mkt, groups, lam=1e-3, W=10, decay=1.0, first=FIRST_PRED, last=None, verbose=False):
    """Return (n_matches, k) probability array, NaN where not predicted."""
    last = last or int(f.season.max())
    if mkt == "1X2":
        X = design_1x2(f, groups)
        off = np.log(f[["pH", "pD", "pA"]].to_numpy())
        res = df.FTResult.map({"H": 0, "D": 1, "A": 2}).to_numpy()
        y = res.astype(int)
        ok = np.isfinite(off).all(1)
        k = 3
    else:
        X = design_ou(f, groups)
        po = f.pO.to_numpy()
        off = np.column_stack([np.log(po), np.log(1 - po)])
        y = ((df.FTHome + df.FTAway) < 2.5).to_numpy().astype(int)  # 0 = over, 1 = under
        ok = np.isfinite(off).all(1)
        k = 2
    season = f.season.to_numpy()
    out = np.full((len(f), k), np.nan)
    for s in range(first, last + 1):
        tr = ok & (season < s) & (season >= s - W)
        te = ok & (season == s)
        if not te.any() or tr.sum() < 2000:
            continue
        st = Std().fit(X[tr])
        Ztr, Zte = st.transform(X[tr]), st.transform(X[te])
        w = decay ** (s - 1 - season[tr]).astype(float)
        theta = fit_softmax(Ztr, off[tr], y[tr], w, lam, k)
        out[te] = predict_softmax(theta, Zte, off[te], k)
        if verbose:
            print(s, tr.sum(), te.sum())
    return out


def to_candidates(c, P1, P2, base):
    """Map match-level probabilities to candidate rows; fall back to the market where the model has none."""
    p = base.copy()
    mid = c.mid.to_numpy()
    sel = c.sel.to_numpy()
    for s, j in (("H", 0), ("D", 1), ("A", 2)):
        m = sel == s
        v = P1[mid[m], j]
        p[np.flatnonzero(m)[np.isfinite(v)]] = v[np.isfinite(v)]
    for s, j in (("O", 0), ("U", 1)):
        m = sel == s
        v = P2[mid[m], j]
        p[np.flatnonzero(m)[np.isfinite(v)]] = v[np.isfinite(v)]
    # never produce a probability where the market has none (same rows as the baseline)
    p[~np.isfinite(base)] = np.nan
    return p
