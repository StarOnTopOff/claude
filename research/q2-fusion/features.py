"""q2-fusion: strictly pre-match features (market structure + team strength).

Every feature of match m (played on day d) is built from
  * the pre-match odds of m itself (Bet365 1X2 / O-U 2.5 / Asian handicap, best-price 1X2 / O-U), and
  * results / stats of matches played on days < d (team histories, ratings).
Nothing from match m's own result or stats, nor from any later match, is used.

Output: feats.pkl  (DataFrame, index = mid = row of load_matches_cached()).
"""
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import poisson

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from harness import load_matches_cached  # noqa: E402
from data import novig_power  # noqa: E402

COUNTRY = {"E0": "ENG", "E1": "ENG", "E2": "ENG", "E3": "ENG", "EC": "ENG", "SC0": "SCO", "SC1": "SCO",
           "SC2": "SCO", "SC3": "SCO", "D1": "GER", "D2": "GER", "SP1": "ESP", "SP2": "ESP", "I1": "ITA",
           "I2": "ITA", "F1": "FRA", "F2": "FRA", "N1": "NED", "P1": "POR", "B1": "BEL", "G1": "GRE", "T1": "TUR"}
G = 13  # goals 0..12 in Poisson grids


# ----------------------------------------------------------------------------- market structure
def _pois_mats(lh, la):
    """(n, G, G) joint score probabilities for independent Poisson rates."""
    k = np.arange(G)
    ph = poisson.pmf(k[None, :], lh[:, None])
    pa = poisson.pmf(k[None, :], la[:, None])
    return ph[:, :, None] * pa[:, None, :]


_DIFF = np.subtract.outer(np.arange(G), np.arange(G))  # home - away goals


def _hda(lh, la):
    m = _pois_mats(lh, la)
    return (m * (_DIFF > 0)).sum((1, 2)), (m * (_DIFF == 0)).sum((1, 2)), (m * (_DIFF < 0)).sum((1, 2))


def _ah_share(lh, la, line):
    """Implied no-vig probability of the home side of Asian handicap `line` (home handicap, quarter lines)."""
    m = _pois_mats(lh, la)
    r = _DIFF[None, :, :] + line[:, None, None]
    w = np.where(r >= 0.5, 1.0, np.where(np.isclose(r, 0.25), 0.5, 0.0))
    lo = np.where(r <= -0.5, 1.0, np.where(np.isclose(r, -0.25), 0.5, 0.0))
    ew, el = (m * w).sum((1, 2)), (m * lo).sum((1, 2))
    return ew / np.maximum(ew + el, 1e-12)


def _total_from_over(po):
    """Poisson total T with P(total >= 3) = po."""
    lo, hi = np.full(len(po), 0.3), np.full(len(po), 7.0)
    for _ in range(40):
        t = (lo + hi) / 2
        pov = 1 - np.exp(-t) * (1 + t + t * t / 2)
        lo, hi = np.where(pov < po, t, lo), np.where(pov < po, hi, t)
    return (lo + hi) / 2


def _sup_bisect(T, f, target, iters=32):
    """Find supremacy s in (-T, T) with f(lh, la) increasing in s equal to target."""
    lo, hi = -0.97 * T, 0.97 * T
    for _ in range(iters):
        s = (lo + hi) / 2
        v = f((T + s) / 2, (T - s) / 2)
        lo, hi = np.where(v < target, s, lo), np.where(v < target, hi, s)
    return (lo + hi) / 2


def market_block(df):
    n = len(df)
    out = pd.DataFrame(index=df.index)
    o3 = df[["OddHome", "OddDraw", "OddAway"]].to_numpy(float)
    ok3 = np.isfinite(o3).all(1)
    p3 = np.full((n, 3), np.nan)
    p3[ok3] = novig_power(o3[ok3])
    o2 = df[["Over25", "Under25"]].to_numpy(float)
    ok2 = np.isfinite(o2).all(1)
    p2 = np.full((n, 2), np.nan)
    p2[ok2] = novig_power(o2[ok2])
    out["pH"], out["pD"], out["pA"] = p3.T
    out["pO"] = p2[:, 0]
    out["ovr3"] = (1 / o3).sum(1) - 1
    out["ovr2"] = (1 / o2).sum(1) - 1
    # best price vs Bet365 (other books disagreeing with Bet365)
    for s, b, m in (("H", "OddHome", "MaxHome"), ("D", "OddDraw", "MaxDraw"), ("A", "OddAway", "MaxAway"),
                    ("O", "Over25", "MaxOver25"), ("U", "Under25", "MaxUnder25")):
        r = np.log(df[m].to_numpy(float) / df[b].to_numpy(float))
        r[(r > np.log(1.3)) | (r < 0)] = np.nan  # same data-quality rule as the harness
        out[f"lmx{s}"] = r
    # Poisson-implied goal expectations
    T = np.full(n, np.nan)
    T[ok2] = _total_from_over(p2[ok2, 0])
    out["T_ou"] = T
    # supremacy implied by 1X2 at the O/U total
    okb = ok3 & ok2
    tgt = p3[okb, 0] - p3[okb, 2]
    s1 = np.full(n, np.nan)
    s1[okb] = _sup_bisect(T[okb], lambda lh, la: (lambda h, d, a: h - a)(*_hda(lh, la)), tgt)
    out["sup_1x2"] = s1
    # draw probability implied by (T_ou, sup_1x2) vs market draw prob: cross-market draw inconsistency
    pdp = np.full(n, np.nan)
    pdp[okb] = _hda((T[okb] + s1[okb]) / 2, (T[okb] - s1[okb]) / 2)[1]
    out["dD_pois"] = np.log(p3[:, 1]) - np.log(pdp)
    # Asian handicap (Bet365): line rounded to quarter goals, no-vig share of the home side
    L = np.round(df.HandiSize.to_numpy(float) * 4) / 4
    hh, ha = df.HandiHome.to_numpy(float), df.HandiAway.to_numpy(float)
    okah = okb & np.isfinite(L) & (np.abs(L) <= 3.5) & (hh > 1.05) & (ha > 1.05) & (hh < 6) & (ha < 6) & (1 / hh + 1 / ha > 0.98) & (1 / hh + 1 / ha < 1.15)
    pah = (1 / hh) / (1 / hh + 1 / ha)
    s2 = np.full(n, np.nan)
    s2[okah] = _sup_bisect(T[okah], lambda lh, la: _ah_share(lh, la, L[okah]), pah[okah])
    out["sup_ah"] = s2
    out["dsup_ah"] = s2 - s1
    out["lam_h"] = (T + s1) / 2
    out["lam_a"] = (T - s1) / 2
    return out


# ----------------------------------------------------------------------------- sequential ratings
def ratings(df, mk):
    """Own Elo (country pools) + online Poisson attack/defence. Values are pre-match: all matches of
    day d are rated with the state after day d-1, then the state is updated with day d results."""
    n = len(df)
    div = df.Division.to_numpy()
    cty = pd.Series(div).map(COUNTRY).to_numpy()
    ht = (pd.Series(cty) + ":" + df.HomeTeam.to_numpy()).to_numpy()
    at = (pd.Series(cty) + ":" + df.AwayTeam.to_numpy()).to_numpy()
    gh, ga = df.FTHome.to_numpy(float), df.FTAway.to_numpy(float)
    day = df.day.to_numpy()
    season = df.season.to_numpy()
    elo, att, dfn, last_div = {}, {}, {}, {}
    base = {d: np.log(1.35) for d in COUNTRY}
    hadv = {d: 0.25 for d in COUNTRY}
    div_elo_sum = {d: [0.0, 0] for d in COUNTRY}
    out = {k: np.full(n, np.nan) for k in ("elo_h", "elo_a", "att_h", "def_h", "att_a", "def_a", "rl_h", "rl_a", "newdiv_h", "newdiv_a")}
    K, HA, ETA, ETA_B = 20.0, 60.0, 0.035, 0.002
    order = np.argsort(day, kind="mergesort")
    starts = np.flatnonzero(np.r_[True, day[order][1:] != day[order][:-1]])
    bounds = np.r_[starts, n]

    def init(t, d):
        if t not in elo:
            s = div_elo_sum[d]
            elo[t] = (s[0] / s[1] - 40.0) if s[1] else 1500.0
            att[t], dfn[t] = -0.05, -0.05
            last_div[t] = d

    for b0, b1 in zip(bounds[:-1], bounds[1:]):
        idx = order[b0:b1]
        # 1) snapshot pre-match state
        for i in idx:
            h, a, d = ht[i], at[i], div[i]
            init(h, d); init(a, d)
            for t, side in ((h, "h"), (a, "a")):
                if last_div[t] != d:  # moved division: shrink goal ratings toward newcomer prior
                    att[t] = 0.3 * att[t] - 0.05; dfn[t] = 0.3 * dfn[t] - 0.05
                    out[f"newdiv_{side}"][i] = 1.0
                    last_div[t] = d
                else:
                    out[f"newdiv_{side}"][i] = 0.0
            out["elo_h"][i], out["elo_a"][i] = elo[h], elo[a]
            out["att_h"][i], out["def_h"][i], out["att_a"][i], out["def_a"][i] = att[h], dfn[h], att[a], dfn[a]
            out["rl_h"][i] = np.exp(base[d] + hadv[d] + att[h] - dfn[a])
            out["rl_a"][i] = np.exp(base[d] + att[a] - dfn[h])
        # 2) update with the day's results
        for i in idx:
            h, a, d = ht[i], at[i], div[i]
            e = 1 / (1 + 10 ** (-(elo[h] + HA - elo[a]) / 400))
            r = 1.0 if gh[i] > ga[i] else (0.5 if gh[i] == ga[i] else 0.0)
            gd = abs(gh[i] - ga[i])
            mult = 1.0 if gd <= 1 else (1.5 if gd == 2 else (11 + gd) / 8)
            dlt = K * mult * (r - e)
            elo[h] += dlt; elo[a] -= dlt
            lh, la = out["rl_h"][i], out["rl_a"][i]
            eh, ea = min(gh[i], 6) - lh, min(ga[i], 6) - la
            att[h] += ETA * eh; dfn[a] -= ETA * eh
            att[a] += ETA * ea; dfn[h] -= ETA * ea
            base[d] += ETA_B * (eh + ea) / 2
            hadv[d] += ETA_B * (eh - ea) / 2
        # division mean Elo (for newcomers), recomputed at each season change
        if b1 == n or season[order[b0]] != season[order[min(b1, n - 1)]]:
            sums = {}
            for t, d in last_div.items():
                s = sums.setdefault(d, [0.0, 0]); s[0] += elo[t]; s[1] += 1
            div_elo_sum.update(sums)
    # first season: division sums were empty -> newcomers 1500; fine.
    return pd.DataFrame(out, index=df.index)


# ----------------------------------------------------------------------------- rolling team form
def team_long(df, mk):
    cty = df.Division.map(COUNTRY)
    pts_h = np.select([df.FTHome > df.FTAway, df.FTHome == df.FTAway], [3.0, 1.0], 0.0)
    pts_a = np.select([df.FTHome < df.FTAway, df.FTHome == df.FTAway], [3.0, 1.0], 0.0)
    xpts_h = 3 * mk.pH + mk.pD
    xpts_a = 3 * mk.pA + mk.pD
    common = dict(mid=df.index.to_numpy(), day=df.day.to_numpy(), season=df.season.to_numpy())
    H = pd.DataFrame(dict(common, team=(cty + ":" + df.HomeTeam).to_numpy(), home=1,
                          gf=df.FTHome.to_numpy(float), ga=df.FTAway.to_numpy(float),
                          sotf=df.HomeTarget.to_numpy(float), sota=df.AwayTarget.to_numpy(float),
                          shf=df.HomeShots.to_numpy(float), sha=df.AwayShots.to_numpy(float),
                          cof=df.HomeCorners.to_numpy(float), coa=df.AwayCorners.to_numpy(float),
                          pts=pts_h, xpts=xpts_h.to_numpy(), xgf=mk.lam_h.to_numpy(), xga=mk.lam_a.to_numpy()))
    A = pd.DataFrame(dict(common, team=(cty + ":" + df.AwayTeam).to_numpy(), home=0,
                          gf=df.FTAway.to_numpy(float), ga=df.FTHome.to_numpy(float),
                          sotf=df.AwayTarget.to_numpy(float), sota=df.HomeTarget.to_numpy(float),
                          shf=df.AwayShots.to_numpy(float), sha=df.HomeShots.to_numpy(float),
                          cof=df.AwayCorners.to_numpy(float), coa=df.HomeCorners.to_numpy(float),
                          pts=pts_a, xpts=xpts_a.to_numpy(), xgf=mk.lam_a.to_numpy(), xga=mk.lam_h.to_numpy()))
    L = pd.concat([H, A], ignore_index=True)
    L["rpts"] = L.pts - L.xpts            # points above market expectation
    L["rgf"] = L.gf - L.xgf               # goals scored above market expectation
    L["rga"] = L.ga - L.xga               # goals conceded above market expectation
    L["rsot"] = L.sotf - L.sota           # shots-on-target difference
    L = L.sort_values(["team", "day"], kind="mergesort").reset_index(drop=True)
    return L


def rolling(L):
    g = L.groupby("team", sort=False)
    # strictly-earlier guarantee: a team never has two matches on one day (checked), so shift(1) is day < d
    assert not L.duplicated(["team", "day"]).any()
    F = pd.DataFrame({"mid": L.mid, "home": L.home})
    prev_day = g.day.shift(1)
    F["rest"] = np.minimum(L.day - prev_day, 30.0)
    F["nprev"] = np.log1p(g.cumcount())
    F["nseason"] = L.groupby(["team", "season"], sort=False).cumcount()
    cols = ["rpts", "rgf", "rga", "rsot", "sotf", "sota", "shf", "sha", "cof", "coa", "gf", "ga", "xgf", "xga", "pts"]
    for hl in (5, 20):
        E = g[cols].transform(lambda s: s.ewm(halflife=hl, ignore_na=True, min_periods=1).mean().shift(1))
        for c in cols:
            F[f"{c}_e{hl}"] = E[c].to_numpy()
    # venue-specific residual form (home team at home / away team away)
    for v in (1, 0):
        sub = L[L.home == v]
        gs = sub.groupby("team", sort=False)
        E = gs[["rpts", "rgf", "rga"]].transform(lambda s: s.ewm(halflife=8, ignore_na=True, min_periods=1).mean().shift(1))
        for c in ("rpts", "rgf", "rga"):
            F.loc[sub.index, f"{c}_ven"] = E[c].to_numpy()
    # residual form in the current season only (shrunk by count)
    gs = L.groupby(["team", "season"], sort=False)
    cs = gs["rpts"].cumsum() - L["rpts"]
    F["rpts_seas"] = cs / (F["nseason"] + 5)
    return F


def build():
    t0 = time.time()
    df = load_matches_cached()
    mk = market_block(df)
    print("market block", round(time.time() - t0, 1), "s")
    rt = ratings(df, mk)
    print("ratings", round(time.time() - t0, 1), "s")
    L = team_long(df, mk)
    F = rolling(L)
    print("rolling", round(time.time() - t0, 1), "s")
    Fh = F[F.home == 1].drop(columns="home").set_index("mid").add_prefix("h_")
    Fa = F[F.home == 0].drop(columns="home").set_index("mid").add_prefix("a_")
    out = pd.concat([mk, rt, Fh.reindex(df.index), Fa.reindex(df.index)], axis=1)
    out["lg"] = df.Division.to_numpy()
    out["season"] = df.season.to_numpy()
    out["day"] = df.day.to_numpy()
    out["month"] = df.MatchDate.dt.month.to_numpy()
    out.to_pickle(HERE / "feats.pkl")
    print(out.shape, "saved", round(time.time() - t0, 1), "s")
    return out


if __name__ == "__main__":
    build()
