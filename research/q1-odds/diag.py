"""Edge-calibration diagnostics on the selection period ONLY (2006-07-01..2020-06-30)."""
import numpy as np
import pandas as pd
from harness import PERIODS, MAX_RATIO


def edge_table(c, p, period="sel", mkt=None):
    lo, hi = PERIODS[period]
    assert hi <= PERIODS["sel"][1]
    d = c.day.to_numpy()
    m = (d >= lo) & (d <= hi) & np.isfinite(p) & (c.mx <= MAX_RATIO * c.b365).to_numpy()
    if mkt:
        m &= (c.mkt == mkt).to_numpy()
    x = c[m].copy()
    x["p"] = p[m]
    x["edge"] = x.p * x.mx - 1
    x["ret"] = np.where(x.win == 1, x.mx - 1, -1)
    x["eb"] = pd.cut(x.edge, [-1, -0.02, 0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 1])
    x["ob"] = pd.cut(x.mx, [1, 1.5, 2, 3, 5, 10, 100])
    a = x.groupby(["eb"], observed=True).agg(n=("ret", "size"), roi=("ret", "mean"), pred=("edge", "mean"))
    b = x[x.edge > 0.02].groupby(["ob"], observed=True).agg(n=("ret", "size"), roi=("ret", "mean"), pred=("edge", "mean"))
    return a.round(4), b.round(4)
