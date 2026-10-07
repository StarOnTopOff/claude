"""Iteration on pre-2020 data only: walk-forward seasons 2005..2019 (last season ends 2020-06-30).

Reports harness.logloss on train (2006-14) and val (2014-20) vs the market baseline, and
optionally harness.select_only. Never touches 2020-07-01+.
"""
import itertools
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import harness  # noqa: E402
from model import to_candidates, walk_forward  # noqa: E402

LAST_DEV = 2019  # season 2019 = 2019-07 .. 2020-06: the last one allowed for design decisions

c = harness.load_candidates()
df = harness.load_matches_cached()
f = pd.read_pickle(HERE / "feats.pkl")
base = harness.baseline_p(c)
# hard guard: nothing after 2020-06-30 is predicted during development
assert (f.season <= LAST_DEV).sum() > 0
BL = {(per, m): harness.logloss(c, base, per, m) for per in ("train", "val") for m in ("1X2", "OU")}


def run(groups1, groups2, lam=1e-3, W=10, decay=1.0, sel=False, tag=""):
    t0 = time.time()
    P1 = walk_forward(f, df, "1X2", groups1, lam=lam, W=W, decay=decay, last=LAST_DEV) if groups1 is not None else np.full((len(f), 3), np.nan)
    P2 = walk_forward(f, df, "OU", groups2, lam=lam, W=W, decay=decay, last=LAST_DEV) if groups2 is not None else np.full((len(f), 2), np.nan)
    p = to_candidates(c, P1, P2, base)
    r = {"tag": tag, "g1": groups1, "g2": groups2, "lam": lam, "W": W, "decay": decay}
    for per in ("train", "val"):
        for m in ("1X2", "OU"):
            r[f"d_{m}_{per}"] = round((harness.logloss(c, p, per, m) - BL[(per, m)]) * 1e4, 2)  # in 1e-4 nats
    r["sec"] = round(time.time() - t0, 1)
    if sel:
        r["sel"] = harness.select_only(c, p, top=3)
    print(json.dumps(r, default=str), flush=True)
    return p, r


if __name__ == "__main__":
    print("baseline logloss", {f"{k[0]}_{k[1]}": round(v, 5) for k, v in BL.items()}, flush=True)
    ALL = ["mkt", "mx", "xmkt", "rate", "form", "stats", "ctx", "lg"]
    run(["mkt"], ["mkt"], tag="mkt only")
    run(["mkt", "lg"], ["mkt", "lg"], tag="mkt+lg")
    run(["mkt", "mx"], ["mkt", "mx"], tag="mkt+mx")
    run(["mkt", "xmkt"], ["mkt", "xmkt"], tag="mkt+xmkt")
    run(["mkt", "rate"], ["mkt", "rate"], tag="mkt+rate")
    run(["mkt", "form"], ["mkt", "form"], tag="mkt+form")
    run(["mkt", "stats"], ["mkt", "stats"], tag="mkt+stats")
    run(["mkt", "ctx"], ["mkt", "ctx"], tag="mkt+ctx")
    run(ALL, ALL, tag="all")
