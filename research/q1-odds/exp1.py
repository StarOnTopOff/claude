from run import *
for offk in ("b", "m"):
    for fs in (["lpb", "lpm"], ["lpb", "lpm", "ratio", "ovr"], ["lpb", "lpm", "ratio", "ovr", "ah", "ou"], ["lpb", "lpm", "ratio", "ovr", "ah", "ou", "lg"]):
        name = f"off{offk}_{'+'.join(fs)}"
        P = get_1x2(name, fs, offk)
        report("1x2 " + name, to_p(P, None), sel=False)
