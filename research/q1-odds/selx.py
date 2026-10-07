"""Extended selection-period view (2006-2020 only): for the top configs, growth / drawdown at each Kelly fraction."""
import numpy as np
from harness import simulate, select_only, FS, choose_f


def selx(c, p, top=3, grid=None):
    res = select_only(c, p, top=top, grid=grid)
    for r in res:
        cfg = r["cfg"]
        s = simulate(c, p, cfg, "sel", fs=FS)
        f = choose_f(c, p, cfg)
        yrs = s[f]["years"]
        print(f"  {cfg['thr']},{cfg['hi']},{cfg['mkts']},{cfg['group']},K{cfg['K']},{cfg['rank']} score {r['sel_score']} n={r['n']} roi {r['roi_flat']:+.4f} (tr {r['roi_train']:+.4f} va {r['roi_val']:+.4f})"
              f" | f*={f}: x{np.exp(s[f]['log_growth']):.1f} dd {s[f]['maxdd']:.2f} r2 {s[f]['r2']:.3f} | " +
              " ".join(f"f{k}:x{np.exp(v['log_growth']):.0f}/dd{v['maxdd']:.2f}" for k, v in s.items()), flush=True)
        print("     years:", {y: round(v, 2) for y, v in yrs.items()}, flush=True)
    return res
