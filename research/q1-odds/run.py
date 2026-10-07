"""Experiment runner: walk-forward predictions -> logloss (train/val) and select_only (2006-2020 only)."""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from feats import build_match_features, load_candidates, to_candidates
from harness import logloss, select_only, baseline_p
from wf import *

HERE = Path(__file__).resolve().parent
PRED = HERE / "pred"
PRED.mkdir(exist_ok=True)
c = load_candidates()
F = build_match_features()
y1 = F.res.to_numpy()
yo = 1 - F.over.to_numpy()  # 0 = Over, 1 = Under


def get_1x2(name, fs, offk="b", lam=1.0, window=None, decay=None, last=2019):
    f = PRED / f"1x2_{name}.npy"
    if f.exists():
        return np.load(f)
    P = walk_forward(F, design_1x2(F, fs), offset_1x2(F, offk), y1, lam=lam, window=window, decay=decay, last_season=last)
    np.save(f, P)
    return P


def get_ou(name, fs, offk="b", lam=1.0, window=None, decay=None, last=2019):
    f = PRED / f"ou_{name}.npy"
    if f.exists():
        return np.load(f)
    P = walk_forward(F, design_ou(F, fs), offset_ou(F, offk), yo, lam=lam, window=window, decay=decay, last_season=last)
    np.save(f, P)
    return P


def to_p(P1=None, P2=None):
    d = {}
    base = None
    if P1 is None or P2 is None:
        base = baseline_p(c)
    if P1 is not None:
        for i, s in enumerate("HDA"): d[s] = P1[:, i]
    if P2 is not None:
        for i, s in enumerate("OU"): d[s] = P2[:, i]
    p = to_candidates(c, pd.DataFrame(d, index=F.index))
    if base is not None:
        is1 = c.mkt.to_numpy() == "1X2"
        if P1 is None: p[is1] = base[is1]
        if P2 is None: p[~is1] = base[~is1]
    return p


def ll(p):
    return [round(logloss(c, p, per, mk), 5) for per in ("train", "val") for mk in ("1X2", "OU")]


def report(name, p, sel=True, top=3):
    print(f"== {name}: logloss tr1x2,trOU,va1x2,vaOU = {ll(p)}", flush=True)
    if sel:
        for r in select_only(c, p, top=top):
            print("   ", json.dumps(r), flush=True)
