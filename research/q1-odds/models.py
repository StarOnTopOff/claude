"""Walk-forward models that correct the market's no-vig probability (offset) with odds features."""
import numpy as np
from scipy.optimize import minimize


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


class OffsetSoftmax:
    """P(k|x) = softmax(offset_k + x @ W[:, k] + b_k), L2 penalty lam on W (shrinks towards the market offset).

    For K=2 this is an offset logistic regression (pass offsets as 2 columns).
    """

    def __init__(self, lam=1.0):
        self.lam = lam

    def fit(self, X, off, y, w=None):
        n, d = X.shape
        K = off.shape[1]
        w = np.ones(n) if w is None else w
        w = w / w.mean()
        self.mu = X.mean(0)
        self.sd = X.std(0) + 1e-9
        Xs = (X - self.mu) / self.sd
        Y = np.eye(K)[y]
        lam = self.lam

        def f(theta):
            W = theta[: d * K].reshape(d, K)
            b = theta[d * K:]
            Z = off + Xs @ W + b
            Z = Z - Z.max(1, keepdims=True)
            lse = np.log(np.exp(Z).sum(1))
            ll = (w * ((Z * Y).sum(1) - lse)).sum()
            P = np.exp(Z - lse[:, None])
            G = (P - Y) * w[:, None]
            gW = Xs.T @ G + lam * W
            gb = G.sum(0)
            return -ll + 0.5 * lam * (W ** 2).sum(), np.r_[gW.ravel(), gb]

        theta0 = np.zeros(d * K + K)
        r = minimize(f, theta0, jac=True, method="L-BFGS-B", options={"maxiter": 500})
        self.W = r.x[: d * K].reshape(d, K)
        self.b = r.x[d * K:]
        return self

    def predict(self, X, off):
        Xs = (X - self.mu) / self.sd
        return softmax(off + Xs @ self.W + self.b)


class OffsetLGBM:
    """LightGBM multiclass/binary boosted from the market offset (init_score), strong regularisation."""

    def __init__(self, params=None, rounds=200):
        self.params = dict(learning_rate=0.03, num_leaves=8, min_data_in_leaf=500, feature_fraction=0.8,
                           bagging_fraction=0.8, bagging_freq=1, lambda_l2=10.0, verbose=-1, num_threads=1, seed=1)
        self.params.update(params or {})
        self.rounds = rounds

    def fit(self, X, off, y, w=None):
        import lightgbm as lgb
        K = off.shape[1]
        p = dict(self.params)
        if K == 2:
            p["objective"] = "binary"
            init = off[:, 1] - off[:, 0]
            lab = y
        else:
            p["objective"] = "multiclass"; p["num_class"] = K
            init = off - off.mean(1, keepdims=True)
            lab = y
        ds = lgb.Dataset(X, label=lab, weight=w, init_score=init, free_raw_data=False)
        self.m = lgb.train(p, ds, num_boost_round=self.rounds)
        self.K = K
        return self

    def predict(self, X, off):
        raw = self.m.predict(X, raw_score=True)
        if self.K == 2:
            z = off[:, 1] - off[:, 0] + raw
            p1 = 1 / (1 + np.exp(-z))
            return np.column_stack([1 - p1, p1])
        z = off - off.mean(1, keepdims=True) + raw
        from models import softmax as _sm
        return _sm(z)
