"""Strictly pre-match features of the fusion model (market structure + team strength).

Production copy of research/q2-fusion/features.py. The arithmetic is unchanged, so the
features of every played match are bit-identical to the research ones. One thing is new:
the frame may also hold UNPLAYED matches (upcoming fixtures: pre-match odds, NaN result).

  * An unplayed row gets its features exactly like any other row: from its own pre-match
    odds and from the matches played on earlier days.
  * An unplayed row is invisible to every other row: it never updates a rating, and it
    does not count in form averages, rest days, match counts or season sums.

Every feature of match m (played on day d) comes from
  * the pre-match odds of m itself (Bet365 1X2, O/U 2.5 and Asian handicap, best-price O/U), and
  * results and stats of matches played on days < d (team histories, ratings).
"""
import numpy as np
import pandas as pd
from scipy.stats import poisson

from data import novig_power

COUNTRY = {"E0": "ENG", "E1": "ENG", "E2": "ENG", "E3": "ENG", "EC": "ENG", "SC0": "SCO", "SC1": "SCO",
           "SC2": "SCO", "SC3": "SCO", "D1": "GER", "D2": "GER", "SP1": "ESP", "SP2": "ESP", "I1": "ITA",
           "I2": "ITA", "F1": "FRA", "F2": "FRA", "N1": "NED", "P1": "POR", "B1": "BEL", "G1": "GRE", "T1": "TUR"}
G = 13  # goals 0..12 in Poisson grids


def played_mask(df):
    """True for matches with a full-time result."""
    return (df.FTHome.notna() & df.FTAway.notna() & df.FTResult.notna()).to_numpy()


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


def _ah_share(line):
    """f(lh, la) = implied no-vig probability of the home side of Asian handicap `line` (home handicap,
    quarter lines). The win / loss weights depend on the line only, so they are built once."""
    r = _DIFF[None, :, :] + line[:, None, None]
    w = np.where(r >= 0.5, 1.0, np.where(np.isclose(r, 0.25), 0.5, 0.0))
    lo = np.where(r <= -0.5, 1.0, np.where(np.isclose(r, -0.25), 0.5, 0.0))

    def share(lh, la):
        m = _pois_mats(lh, la)
        ew, el = (m * w).sum((1, 2)), (m * lo).sum((1, 2))
        return ew / np.maximum(ew + el, 1e-12)
    return share


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


CHUNK = 4096  # rows per market-block chunk: the (rows, 13, 13) Poisson grids stay cache-sized


def market_block(df):
    """Per-match features from the match's own pre-match odds (row by row, no history).

    Every quantity is computed row by row, so chunking changes nothing but speed and memory."""
    if len(df) > CHUNK:
        return pd.concat([market_block(df.iloc[i:i + CHUNK]) for i in range(0, len(df), CHUNK)])
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
    with np.errstate(divide="ignore", invalid="ignore"):  # zero / missing AH odds are filtered out by okah
        okah = (okb & np.isfinite(L) & (np.abs(L) <= 3.5) & (hh > 1.05) & (ha > 1.05) & (hh < 6) & (ha < 6)
                & (1 / hh + 1 / ha > 0.98) & (1 / hh + 1 / ha < 1.15))
        pah = (1 / hh) / (1 / hh + 1 / ha)
    s2 = np.full(n, np.nan)
    s2[okah] = _sup_bisect(T[okah], _ah_share(L[okah]), pah[okah])
    out["sup_ah"] = s2
    out["dsup_ah"] = s2 - s1
    out["lam_h"] = (T + s1) / 2
    out["lam_a"] = (T - s1) / 2
    return out


# ----------------------------------------------------------------------------- sequential ratings
def ratings(df, played):
    """Own Elo (country pools) + online Poisson attack/defence. Values are pre-match: all matches of
    day d are rated with the state after day d-1, then the state is updated with day d results.
    Unplayed matches are rated like the others but never update the state."""
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
        # 2) update with the day's results (unplayed matches: nothing to learn from)
        for i in idx:
            if not played[i]:
                continue
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
    return pd.DataFrame(out, index=df.index)


# ----------------------------------------------------------------------------- rolling team form
def team_long(df, mk, played):
    """One row per (match, team), sorted by team then day. Unplayed rows carry NaN for every
    per-match quantity, so they never enter a form average."""
    cty = df.Division.map(COUNTRY)
    unp = ~played
    pts_h = np.select([df.FTHome > df.FTAway, df.FTHome == df.FTAway], [3.0, 1.0], 0.0)
    pts_a = np.select([df.FTHome < df.FTAway, df.FTHome == df.FTAway], [3.0, 1.0], 0.0)
    pts_h[unp] = np.nan
    pts_a[unp] = np.nan
    xpts_h = (3 * mk.pH + mk.pD).to_numpy(copy=True)
    xpts_a = (3 * mk.pA + mk.pD).to_numpy(copy=True)
    lam_h, lam_a = mk.lam_h.to_numpy(copy=True), mk.lam_a.to_numpy(copy=True)
    for v in (xpts_h, xpts_a, lam_h, lam_a):
        v[unp] = np.nan
    common = dict(mid=df.index.to_numpy(), day=df.day.to_numpy(), season=df.season.to_numpy(), played=played)
    H = pd.DataFrame(dict(common, team=(cty + ":" + df.HomeTeam).to_numpy(), home=1,
                          gf=df.FTHome.to_numpy(float), ga=df.FTAway.to_numpy(float),
                          sotf=df.HomeTarget.to_numpy(float), sota=df.AwayTarget.to_numpy(float),
                          shf=df.HomeShots.to_numpy(float), sha=df.AwayShots.to_numpy(float),
                          cof=df.HomeCorners.to_numpy(float), coa=df.AwayCorners.to_numpy(float),
                          pts=pts_h, xpts=xpts_h, xgf=lam_h, xga=lam_a))
    A = pd.DataFrame(dict(common, team=(cty + ":" + df.AwayTeam).to_numpy(), home=0,
                          gf=df.FTAway.to_numpy(float), ga=df.FTHome.to_numpy(float),
                          sotf=df.AwayTarget.to_numpy(float), sota=df.HomeTarget.to_numpy(float),
                          shf=df.AwayShots.to_numpy(float), sha=df.HomeShots.to_numpy(float),
                          cof=df.AwayCorners.to_numpy(float), coa=df.HomeCorners.to_numpy(float),
                          pts=pts_a, xpts=xpts_a, xgf=lam_a, xga=lam_h))
    L = pd.concat([H, A], ignore_index=True)
    stat = ["gf", "ga", "sotf", "sota", "shf", "sha", "cof", "coa"]
    L.loc[~L.played.to_numpy(), stat] = np.nan  # an unplayed match has no stats yet
    L["rpts"] = L.pts - L.xpts            # points above market expectation
    L["rgf"] = L.gf - L.xgf               # goals scored above market expectation
    L["rga"] = L.ga - L.xga               # goals conceded above market expectation
    L["rsot"] = L.sotf - L.sota           # shots-on-target difference
    L = L.sort_values(["team", "day"], kind="mergesort").reset_index(drop=True)
    return L


def rolling(L):
    """Per (match, team): form and context from the team's earlier PLAYED matches.

    On a frame of played matches only this is exactly the research computation
    (shift(1) = previous match); unplayed rows are skipped by every count and average."""
    g = L.groupby("team", sort=False)
    # strictly-earlier guarantee: a team never has two matches on one day, so the previous row is day < d
    assert not L.duplicated(["team", "day"]).any(), "a team has two matches on one day"
    F = pd.DataFrame({"mid": L.mid, "home": L.home})
    pl = L.played.astype(int)
    # days since the previous played match
    prev_day = L.day.where(L.played).groupby(L.team, sort=False).shift(1)
    prev_day = prev_day.groupby(L.team, sort=False).ffill()
    F["rest"] = np.minimum(L.day - prev_day, 30.0)
    F["nprev"] = np.log1p(pl.groupby(L.team, sort=False).cumsum() - pl)          # played matches before
    nseason = pl.groupby([L.team, L.season], sort=False).cumsum() - pl
    F["nseason"] = nseason
    cols = ["rpts", "rgf", "rga", "rsot", "sotf", "sota", "shf", "sha", "cof", "coa", "gf", "ga", "xgf", "xga", "pts"]
    for hl in (5, 20):  # NaN (incl. unplayed rows) is skipped by ewm(ignore_na=True)
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
    csum = gs["rpts"].cumsum()
    cs = csum - L["rpts"]  # research formula for played rows (NaN when the row's own rpts is NaN)
    # unplayed rows: the season sum up to the previous match (equal to the above up to rounding)
    prev = csum.groupby([L.team, L.season], sort=False).shift(1)
    prev = prev.groupby([L.team, L.season], sort=False).ffill().fillna(0.0)
    cs = cs.where(L.played, prev)
    F["rpts_seas"] = cs / (nseason + 5)
    return F


def build_features(df):
    """Feature frame for every row of df (index preserved).

    df: matches in the data.load_matches schema plus `day` (days since 2000-01-01) and `season`;
    unplayed rows (NaN result) are allowed, see the module docstring."""
    played = played_mask(df)
    mk = market_block(df)
    rt = ratings(df, played)
    F = rolling(team_long(df, mk, played))
    Fh = F[F.home == 1].drop(columns="home").set_index("mid").add_prefix("h_")
    Fa = F[F.home == 0].drop(columns="home").set_index("mid").add_prefix("a_")
    out = pd.concat([mk, rt, Fh.reindex(df.index), Fa.reindex(df.index)], axis=1)
    out["lg"] = df.Division.to_numpy()
    out["season"] = df.season.to_numpy()
    out["day"] = df.day.to_numpy()
    out["month"] = df.MatchDate.dt.month.to_numpy()
    return out
