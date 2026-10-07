from run import *
for offk in ("b", "m"):
    for fs in (["lpb", "lpm"], ["lpb", "lpm", "ratio", "ovr"], ["lpb", "lpm", "ratio", "ovr", "x1x2", "ah"], ["lpb", "lpm", "ratio", "ovr", "x1x2", "ah", "lg"]):
        name = f"off{offk}_{'+'.join(fs)}"
        P = get_ou(name, fs, offk)
        report("ou " + name, to_p(None, P), sel=False)
