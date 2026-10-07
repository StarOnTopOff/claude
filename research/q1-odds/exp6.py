from run import *
from harness import simulate, FS
pb = baseline_p(c)
P = np.load(PRED / "1x2_offb_lpb+lpm.npy")
pmod = to_p(P, None)
for thr in (0.0, 0.01, 0.02, 0.03):
    for hi in (2.0, 4.0, 10.0):
        for rank in ("kelly", "edge"):
            cfg = {"thr": thr, "lo": 1.01, "hi": hi, "mkts": "1X2", "group": "europe", "K": 3, "rank": rank, "exec": "max"}
            out = []
            for nm, p in (("base", pb), ("model", pmod)):
                tr = simulate(c, p, cfg, "train", fs=(0.5,))[0.5]; va = simulate(c, p, cfg, "val", fs=(0.5,))[0.5]
                s = simulate(c, p, cfg, "sel", fs=FS)
                out.append(f"{nm}: n{s[0.5]['n']} roi {s[0.5]['roi_flat']:+.3f} (tr {tr['roi_flat']:+.3f} va {va['roi_flat']:+.3f}) " + " ".join(f"f{f}:x{np.exp(v['log_growth']):.0f}/dd{v['maxdd']:.2f}" for f, v in s.items()))
            print(thr, hi, rank, " || ".join(out), flush=True)
