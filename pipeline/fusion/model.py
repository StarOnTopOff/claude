"""Market-offset multinomial logit for 1X2 (production copy of research/q2-fusion/model.py).

    z_k = log p_mkt_k + b_k + x . B_k      softmax over H/D/A, L2 penalty on (b, B)

p_mkt = Bet365 no-vig (power method). x = the design matrix below, standardized on the
training rows. Only the 1X2 part of the research code is kept: the O/U probabilities of
the method are the market's own (see METHOD.md section 5).
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize

from .features import COUNTRY

LEAGUES = list(COUNTRY)


def design_1x2(f, groups):
    """Feature groups -> DataFrame of raw (unstandardized) model inputs."""
    X = {}
    lp = np.log(f[["pH", "pD", "pA"]].to_numpy())
    if "mkt" in groups:  # market calibration (favourite-longshot, draw level)
        X["lpH"], X["lpD"], X["lpA"] = lp.T
        X["ovr3"] = f.ovr3
    if "mx" in groups:   # other books vs Bet365 (not used by the chosen design)
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
    """L-BFGS fit of the market-offset softmax; returns theta = (b, B.ravel())."""
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
