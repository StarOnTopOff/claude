from run import *
from diag import edge_table
P = np.load(PRED / "1x2_offb_lpb+lpm.npy")
p = to_p(P, None)
report("1x2 offb_lpb+lpm + OU baseline", p, top=5)
a, b = edge_table(c, p, mkt="1X2")
print(a); print(b)
pb = baseline_p(c)
a, b = edge_table(c, pb, mkt="1X2")
print(a); print(b)
