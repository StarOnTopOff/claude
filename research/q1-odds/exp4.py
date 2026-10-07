from run import *
from harness import _pick, PERIODS
pb = baseline_p(c)
cfg = {"thr": 0.02, "lo": 1.01, "hi": 10.0, "mkts": "1X2", "group": "europe", "K": 3, "rank": "kelly", "exec": "max"}
lo, hi = PERIODS["sel"]
s = _pick(c, pb, cfg, lo, hi)
x = pd.DataFrame({k: s[k] for k in ("day", "mid", "odds", "p", "edge", "win", "kelly", "row")})
x["b365"] = c.b365.to_numpy()[x.row]
x["ratio"] = x.odds / x.b365
x["sel"] = c.sel.to_numpy()[x.row]
x["lg"] = c.lg.to_numpy()[x.row]
x["ret"] = np.where(x.win == 1, x.odds - 1, -1)
x["season"] = c.season.to_numpy()[x.row]
print(x.describe().T.round(3))
for k, bins in (("ratio", [1, 1.03, 1.06, 1.1, 1.15, 1.2, 1.3]), ("odds", [1, 1.3, 1.6, 2, 3, 5, 10]), ("edge", [0, .03, .05, .08, .12, .2, 1]), ("kelly", [0, .01, .02, .04, .08, .16, 1])):
    print(x.groupby(pd.cut(x[k], bins), observed=True).agg(n=("ret", "size"), roi=("ret", "mean"), pe=("edge", "mean"), kel=("kelly", "mean")).round(4))
print(x.groupby("sel").agg(n=("ret", "size"), roi=("ret", "mean")).round(4))
print(x.groupby("lg").agg(n=("ret", "size"), roi=("ret", "mean")).round(4).T)
print(x.groupby("season").agg(n=("ret", "size"), roi=("ret", "mean"), kel=("kelly", "mean")).round(4).T)
