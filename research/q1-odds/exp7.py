from run import *
from harness import PERIODS, MAX_RATIO
pb = baseline_p(c)
lo, hi = PERIODS["sel"]
d = c.day.to_numpy()
m = (d >= lo) & (d <= hi) & np.isfinite(pb) & (c.mx <= MAX_RATIO * c.b365).to_numpy() & (c.mkt == "1X2").to_numpy()
x = c[m].copy(); x["p"] = pb[m]; x["edge"] = x.p * x.mx - 1; x["ratio"] = x.mx / x.b365
x["ret"] = np.where(x.win == 1, x.mx - 1, -1)
x["era"] = np.where(x.season <= 2012, "06-12", "13-19")
x["ovr"] = F.ovr_b.reindex(x.mid).to_numpy()
x["ovr_m"] = F.ovr_m.reindex(x.mid).to_numpy()
x = x[x.edge > 0.0]
x["rb"] = pd.cut(x.ratio, [1, 1.05, 1.08, 1.11, 1.15, 1.2, 1.3])
x["ob"] = pd.cut(x.mx, [1, 1.6, 2.5, 4, 100])
t = x.groupby(["ob", "rb", "era"], observed=True).agg(n=("ret", "size"), roi=("ret", "mean"), pe=("edge", "mean")).round(3).unstack("era")
print(t.to_string())
x["omb"] = pd.cut(x.ovr_m, [0, 0.98, 1.0, 1.01, 1.02, 1.04, 2])
t = x.groupby(["omb", "era"], observed=True).agg(n=("ret", "size"), roi=("ret", "mean"), pe=("edge", "mean")).round(3).unstack("era")
print(t.to_string())
