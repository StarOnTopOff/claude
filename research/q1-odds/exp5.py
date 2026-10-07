import os
os.environ["OMP_NUM_THREADS"] = "1"
import sys, json
import numpy as np
import pandas as pd
from betlevel import bet_features, lgt
from feats import load_candidates
from models import OffsetLGBM, OffsetSoftmax
from harness import logloss, select_only, baseline_p
from diag import edge_table
from pathlib import Path

PRED = Path(__file__).resolve().parent / "pred"
c = load_candidates()
X = bet_features(c)
pb = baseline_p(c)
win = c.win.to_numpy().astype(int)
season = c.season.to_numpy()
ok = np.isfinite(pb) & np.isfinite(c.mx.to_numpy()) & np.isfinite(X.r.to_numpy())
edge_b = pb * c.mx.to_numpy() - 1
ratio_ok = c.mx.to_numpy() <= 1.3 * c.b365.to_numpy()


def wf(feats, model_fn, region=-0.05, last=2019, name=None):
    f = PRED / f"bet_{name}.npy" if name else None
    if f is not None and f.exists():
        return np.load(f)
    p = np.full(len(c), np.nan)
    Xv = X[feats].to_numpy(float)
    off2 = np.column_stack([np.zeros(len(c)), lgt(pb)])
    for s in range(2006, 2027):
        if s > last:
            break
        tr = ok & (season >= 2005) & (season < s) & (edge_b > region) & ratio_ok
        te = ok & (season == s)
        m = model_fn().fit(Xv[tr], off2[tr], win[tr])
        p[te] = m.predict(Xv[te], off2[te])[:, 1]
    # rows outside the model (no max odds etc.): fall back to the market probability
    p = np.where(np.isfinite(p), p, np.where(season <= last, pb, np.nan))
    if f is not None:
        np.save(f, p)
    return p


def show(name, p, sel=True):
    print(f"== {name}: ll {[round(logloss(c, p, per, mk), 5) for per in ('train', 'val') for mk in ('1X2', 'OU')]}", flush=True)
    a, b = edge_table(c, p)
    print(a.T.to_string()); print(b.T.to_string())
    if sel:
        for r in select_only(c, p, top=3):
            print("   ", json.dumps(r), flush=True)


if __name__ == "__main__":
    base = ["lp_b", "r", "r_oth_max", "r_oth_mean", "ovr_b", "ovr_m", "lodds", "sel_H", "sel_D", "sel_A", "sel_O", "sel_U"]
    which = sys.argv[1]
    if which == "lgb1":
        p = wf(base, lambda: OffsetLGBM(dict(num_leaves=4, min_data_in_leaf=2000, learning_rate=0.03), rounds=150), name="lgb1")
    elif which == "lgb2":
        p = wf(base, lambda: OffsetLGBM(dict(num_leaves=8, min_data_in_leaf=1000, learning_rate=0.03), rounds=300), name="lgb2")
    elif which == "lin1":
        p = wf(base, lambda: OffsetSoftmax(lam=1.0), name="lin1")
    elif which == "lgb1all":
        p = wf(base, lambda: OffsetLGBM(dict(num_leaves=4, min_data_in_leaf=2000, learning_rate=0.03), rounds=150), region=-1.0, name="lgb1all")
    show(which, p)
