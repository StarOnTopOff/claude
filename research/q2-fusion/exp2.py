from exp import *
if __name__ == "__main__":
    ALL = ["mkt", "mx", "xmkt", "rate", "form", "stats", "ctx", "lg"]
    for lam in (3e-3, 1e-2, 3e-2):
        run(["mkt", "mx", "xmkt"], ["mkt", "mx", "xmkt"], lam=lam, tag=f"core lam{lam}")
    for lam in (1e-2, 3e-2, 1e-1):
        run(ALL, ALL, lam=lam, tag=f"all lam{lam}")
    run(["mkt", "mx", "xmkt", "rate", "form"], ["mkt", "mx", "xmkt", "stats"], lam=1e-2, tag="core+rate+form / core+stats")
