"""Alternative margin-removal methods (no fitting)."""
import numpy as np


def _bisect(fun, lo, hi, n, iters=60):
    lo = np.full(n, lo, float); hi = np.full(n, hi, float)
    for _ in range(iters):
        mid = (lo + hi) / 2
        over = fun(mid) > 1
        lo = np.where(over, mid, lo)
        hi = np.where(over, hi, mid)
    return (lo + hi) / 2


def shin(odds):
    pi = 1 / odds
    S = pi.sum(1)
    def probs(z):
        zz = z[:, None]
        return (np.sqrt(zz ** 2 + 4 * (1 - zz) * pi ** 2 / S[:, None]) - zz) / (2 * (1 - zz))
    z = _bisect(lambda z: probs(z).sum(1), 0.0, 0.5, len(odds))
    p = probs(z)
    return p / p.sum(1, keepdims=True)


def odds_ratio(odds):
    pi = 1 / odds
    def probs(cc):
        return pi / (cc[:, None] + pi - cc[:, None] * pi)
    cc = _bisect(lambda cc: probs(cc).sum(1), 1.0, 3.0, len(odds))
    # sum decreases with c -> bisect direction: sum>1 means c too small
    return probs(cc) / probs(cc).sum(1, keepdims=True)


def additive(odds):
    pi = 1 / odds
    k = odds.shape[1]
    p = pi - (pi.sum(1, keepdims=True) - 1) / k
    p = np.clip(p, 1e-4, None)
    return p / p.sum(1, keepdims=True)


def proportional(odds):
    pi = 1 / odds
    return pi / pi.sum(1, keepdims=True)
