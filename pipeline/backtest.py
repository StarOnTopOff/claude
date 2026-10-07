"""Grid-search backtest of ~17,000 betting strategies.

Each strategy is a rule set: probability source, execution price, market,
minimum edge, odds band and league group. Every strategy is scored with a flat
1-unit stake on three disjoint periods:

    train 2005/06-2013/14  ->  val 2014/15-2019/20  ->  test 2020/21-today

The champion is chosen with train + val only. The test period is never used to
pick it, so its test numbers are an honest out-of-sample estimate.
"""
import itertools
import json
import time

import numpy as np

from config import FIRST_SEASON, GROUP_LABELS, LEAGUE_GROUPS, LEAGUES, OUT, SPLITS
from data import build_frame, load_matches

FAIR = {
    "mkt": "Marché Bet365 sans marge (méthode puissance)",
    "mktp": "Marché Bet365 sans marge (proportionnelle)",
    "elo": "Modèle Elo (ClubElo, walk-forward)",
    "b75": "75 % marché + 25 % Elo",
    "b50": "50 % marché + 50 % Elo",
    "mkc": "Marché sans marge + confirmation Elo",
    "none": "Aucune (système à filtre fixe)",
}
EXEC = {"b365": "Un seul bookmaker (Bet365, proxy de Stake)", "max": "Meilleure cote du marché (~17 bookmakers)"}
SELS = {"H": "Domicile", "D": "Nul", "A": "Extérieur", "HA": "Dom. ou Ext.", "ALL": "1N2 (meilleure value)",
        "O": "Plus de 2,5 buts", "U": "Moins de 2,5 buts", "OU": "Over/Under 2,5"}
THRESHOLDS = [0.0, 0.01, 0.02, 0.03, 0.05, 0.07, 0.10, 0.15]
BANDS_1X2 = [(1.01, 1.6), (1.6, 2.5), (2.5, 4.0), (4.0, 8.0), (8.0, 61.0), (1.01, 2.5), (1.5, 4.0), (1.01, 4.0), (2.0, 8.0), (1.01, 61.0)]
BANDS_OU = [(1.01, 1.7), (1.7, 2.0), (2.0, 2.5), (2.5, 61.0), (1.01, 61.0)]
MIN_TRAIN, MIN_VAL, MIN_LAST_VAL = 300, 200, 30


def pick(p, o, win, allowed):
    """Choose, per match, the allowed outcome with the largest edge."""
    edge = p * o - 1.0
    mask = np.zeros(edge.shape[1], bool)
    mask[allowed] = True
    e = np.where(mask[None, :] & np.isfinite(edge), edge, -np.inf)
    k = e.argmax(axis=1)
    rows = np.arange(len(k))
    return e[rows, k], o[rows, k], p[rows, k], win[rows, k], k


def strategy_space():
    for fair, ex, sel, thr, band, grp in itertools.product(
        ["mkt", "mktp", "elo", "b75", "b50", "mkc"], ["b365", "max"], ["H", "D", "A", "HA", "ALL"],
        THRESHOLDS, BANDS_1X2, LEAGUE_GROUPS,
    ):
        yield dict(fair=fair, exec=ex, sel=sel, thr=thr, lo=band[0], hi=band[1], group=grp)
    for ex, sel, band, grp in itertools.product(["b365", "max"], ["H", "D", "A"], BANDS_1X2, LEAGUE_GROUPS):
        yield dict(fair="none", exec=ex, sel=sel, thr=None, lo=band[0], hi=band[1], group=grp)
    for ex, sel, thr, band, grp in itertools.product(
        ["b365", "max"], ["O", "U", "OU"], [None] + THRESHOLDS, BANDS_OU, LEAGUE_GROUPS,
    ):
        if thr is None and sel == "OU":
            continue
        yield dict(fair="none" if thr is None else "mkt", exec=ex, sel=sel, thr=thr, lo=band[0], hi=band[1], group=grp)


def r2_trend(cum):
    """Signed R^2 of cumulative profit against bet number: 1 = perfectly straight rising line."""
    n = len(cum)
    if n < 3:
        return 0.0
    x = np.arange(n, dtype=float)
    c = np.corrcoef(x, cum)[0, 1]
    if not np.isfinite(c):
        return 0.0
    return float(np.sign(c) * c * c)


def max_drawdown(cum):
    if len(cum) == 0:
        return 0.0
    peak = np.maximum.accumulate(np.concatenate([[0.0], cum]))[1:]
    return float((peak - cum).max())


def run():
    t0 = time.time()
    df = load_matches()
    fr = build_frame(df)
    keep = (df.season >= FIRST_SEASON).to_numpy()
    df = df[keep].reset_index(drop=True)
    fr = {k: v[keep] for k, v in fr.items()}
    n = len(df)
    season = df.season.to_numpy()
    split = np.full(n, 2)
    split[season <= SPLITS["val"][1]] = 1
    split[season <= SPLITS["train"][1]] = 0
    seasons = np.arange(FIRST_SEASON, season.max() + 1)
    league_mask = {g: df.Division.isin(c).to_numpy() for g, c in LEAGUE_GROUPS.items()}
    print(f"{n} matches loaded in {time.time() - t0:.1f}s")

    probs = {
        "mkt": fr["p_pow"], "mktp": fr["p_prop"], "elo": fr["p_elo"],
        "b75": 0.75 * fr["p_pow"] + 0.25 * fr["p_elo"], "b50": 0.5 * fr["p_pow"] + 0.5 * fr["p_elo"],
        # market probability, but only where the Elo model rates the outcome at least as likely
        "mkc": np.where(fr["p_elo"] >= fr["p_pow"], fr["p_pow"], np.nan),
    }
    odds = {"b365": fr["o_b365"], "max": fr["o_max"]}
    ou_odds = {"b365": fr["ou_b365"], "max": fr["ou_max"]}
    allowed = {"H": [0], "D": [1], "A": [2], "HA": [0, 2], "ALL": [0, 1, 2], "O": [0], "U": [1], "OU": [0, 1]}
    cache = {}

    def chosen(s):
        key = (s["fair"], s["exec"], s["sel"])
        if key not in cache:
            if s["sel"] in ("O", "U", "OU"):
                p, o, w = fr["p_ou"], ou_odds[s["exec"]], fr["win_ou"]
            else:
                p = probs["mkt"] if s["fair"] == "none" else probs[s["fair"]]
                o, w = odds[s["exec"]], fr["win"]
            e, oo, pp, ww, k = pick(p, o, w, allowed[s["sel"]])
            r = np.where(ww, oo - 1.0, -1.0)
            valid = np.isfinite(e) & np.isfinite(oo) & np.isfinite(pp)
            cache[key] = (e, oo, pp, ww, k, r, valid)
        return cache[key]

    rows = []
    specs = list(strategy_space())
    print(f"{len(specs)} strategies to test")
    for i, s in enumerate(specs):
        e, o, p, w, k, r, valid = chosen(s)
        m = valid & league_mask[s["group"]] & (o >= s["lo"]) & (o < s["hi"])
        if s["thr"] is not None:
            m &= e > s["thr"]
        idx = np.flatnonzero(m)
        rr = r[idx]
        sp = split[idx]
        cnt = np.bincount(sp, minlength=3)
        n_last_val = int((season[idx] == SPLITS["val"][1]).sum())
        prof = np.bincount(sp, weights=rr, minlength=3)
        row = dict(s)
        row.update(id=i, n=int(len(idx)), n_last_val=n_last_val, profit=float(rr.sum()), cnt=cnt.tolist(), prof=prof.round(2).tolist())
        if len(idx) >= 30:
            cum = np.cumsum(rr)
            tv = sp < 2
            cum_tv = np.cumsum(rr[tv])
            sd = rr.std() or 1.0
            row.update(
                roi=float(rr.mean()), winrate=float(w[idx].mean()), avg_odds=float(o[idx].mean()),
                mdd=max_drawdown(cum), r2=r2_trend(cum), r2_tv=r2_trend(cum_tv), mdd_tv=max_drawdown(cum_tv),
                t=float(rr.mean() / sd * np.sqrt(len(rr))),
            )
            tt = []
            for j in range(2):
                sub = rr[sp == j]
                tt.append(float(sub.mean() / (sub.std() or 1.0) * np.sqrt(len(sub))) if len(sub) > 10 else 0.0)
            row["t_tr"], row["t_va"] = tt
        rows.append(row)
        if i % 4000 == 0:
            print(f"  {i}/{len(specs)}  {time.time() - t0:.0f}s")
    print(f"grid done in {time.time() - t0:.0f}s")

    # ---- selection (train + val only) -------------------------------------
    def roi_split(r_, j):
        return r_["prof"][j] / r_["cnt"][j] if r_["cnt"][j] else -1

    eligible = []
    for r_ in rows:
        # enough bets in each period, and still firing in the latest validation season
        if r_["cnt"][0] < MIN_TRAIN or r_["cnt"][1] < MIN_VAL or r_["n_last_val"] < MIN_LAST_VAL or "t_tr" not in r_:
            continue
        if roi_split(r_, 0) <= 0 or roi_split(r_, 1) <= 0:
            continue
        r_["score"] = min(r_["t_tr"], r_["t_va"]) * max(r_["r2_tv"], 0)
        eligible.append(r_)
    eligible.sort(key=lambda r_: -r_["score"])
    print(f"{len(eligible)} strategies profitable on train AND val")
    for r_ in eligible[:25]:
        print("   ", r_["id"], r_["fair"], r_["exec"], r_["sel"], r_["thr"], r_["lo"], r_["hi"], r_["group"], r_["cnt"],
              "roi tr/va/te = %.3f %.3f %.3f" % tuple(roi_split(r_, j) for j in range(3)), "score %.2f r2 %.2f" % (r_["score"], r_["r2_tv"]))

    def stake_ok(r_):
        return r_["exec"] == "b365"

    champion = eligible[0] if eligible else None
    champion_single = next((r_ for r_ in eligible if stake_ok(r_)), None)
    # best single-book strategy even if not profitable (to report honestly)
    single = [r_ for r_ in rows if r_["exec"] == "b365" and r_["cnt"][0] >= MIN_TRAIN and r_["cnt"][1] >= MIN_VAL
              and r_["n_last_val"] >= MIN_LAST_VAL and "t_tr" in r_]
    single.sort(key=lambda r_: -(min(r_["t_tr"], r_["t_va"])))
    best_single_any = single[0] if single else None
    # the naive approach: keep whatever had the best ROI on the first period alone
    trap = max((r_ for r_ in rows if r_["cnt"][0] >= MIN_TRAIN), key=lambda r_: r_["prof"][0] / r_["cnt"][0])

    for name, r_ in (("champion", champion), ("champion_single", champion_single), ("best_single_any", best_single_any), ("trap", trap)):
        if r_:
            print(name, {k: r_[k] for k in ("id", "fair", "exec", "sel", "thr", "lo", "hi", "group", "n", "cnt", "prof")},
                  "roi_test=%.3f" % roi_split(r_, 2))

    # ---- export ------------------------------------------------------------
    top_ids, seen = [], set()
    for r_ in eligible:  # skip strategies that place exactly the same bets as one already listed
        sig = (r_["n"], round(r_["profit"], 2))
        if sig in seen:
            continue
        seen.add(sig)
        top_ids.append(r_["id"])
        if len(top_ids) == 10:
            break
    for extra in (champion_single, best_single_any, trap):
        if extra and extra["id"] not in top_ids:
            top_ids.append(extra["id"])
    # classic reference systems
    refs = []
    for s in (dict(fair="none", exec="b365", sel="H", lo=1.01, hi=61.0, group="top5"),
              dict(fair="none", exec="b365", sel="H", lo=1.01, hi=1.6, group="top5"),
              dict(fair="elo", exec="b365", sel="ALL", thr=0.05, lo=1.01, hi=61.0, group="top5")):
        for r_ in rows:
            if all(r_.get(k) == v for k, v in s.items()):
                refs.append(r_["id"])
                if r_["id"] not in top_ids:
                    top_ids.append(r_["id"])
                break

    detail = {}
    used_matches = set()
    for sid in top_ids:
        s = rows[sid]
        e, o, p, w, k, r, valid = chosen(s)
        m = valid & league_mask[s["group"]] & (o >= s["lo"]) & (o < s["hi"])
        if s["thr"] is not None:
            m &= e > s["thr"]
        idx = np.flatnonzero(m)
        used_matches.update(idx.tolist())
        sel_code = (np.array(["O", "U"]) if s["sel"] in ("O", "U", "OU") else np.array(["H", "D", "A"]))[k[idx]]
        detail[sid] = dict(idx=idx, odds=o[idx], p=p[idx], win=w[idx], sel=sel_code)

    used = np.array(sorted(used_matches))
    remap = {m: j for j, m in enumerate(used)}
    teams = sorted(set(df.HomeTeam.iloc[used]) | set(df.AwayTeam.iloc[used]))
    tix = {t: j for j, t in enumerate(teams)}
    leagues = list(LEAGUES)
    lix = {c: j for j, c in enumerate(leagues)}
    epoch = np.datetime64("2000-01-01")
    sub = df.iloc[used]
    matches = {
        "day": ((sub.MatchDate.to_numpy().astype("datetime64[D]") - epoch).astype(int)).tolist(),
        "lg": [lix[c] for c in sub.Division],
        "h": [tix[t] for t in sub.HomeTeam],
        "a": [tix[t] for t in sub.AwayTeam],
        "hg": sub.FTHome.astype(int).tolist(),
        "ag": sub.FTAway.astype(int).tolist(),
    }
    strategies_detail = {}
    for sid, d in detail.items():
        strategies_detail[str(sid)] = {
            "m": [remap[i] for i in d["idx"].tolist()],
            "o": np.round(d["odds"] * 100).astype(int).tolist(),
            "p": np.round(d["p"] * 10000).astype(int).tolist(),
            "w": d["win"].astype(int).tolist(),
            "s": "".join(d["sel"].tolist()),
        }

    vocab = {
        "fair": list(FAIR), "exec": list(EXEC), "sel": list(SELS), "group": list(LEAGUE_GROUPS),
    }
    cols = {k: [] for k in ("id", "fair", "exec", "sel", "thr", "lo", "hi", "group", "n", "profit", "roi", "n_tr", "roi_tr",
                            "n_va", "roi_va", "n_te", "roi_te", "mdd", "r2", "t", "score", "avg_odds", "winrate")}
    for r_ in rows:
        if r_["n"] < 50:
            continue
        cols["id"].append(r_["id"])
        cols["fair"].append(vocab["fair"].index(r_["fair"]))
        cols["exec"].append(vocab["exec"].index(r_["exec"]))
        cols["sel"].append(vocab["sel"].index(r_["sel"]))
        cols["thr"].append(-1 if r_["thr"] is None else r_["thr"])
        cols["lo"].append(r_["lo"])
        cols["hi"].append(r_["hi"])
        cols["group"].append(vocab["group"].index(r_["group"]))
        cols["n"].append(r_["n"])
        cols["profit"].append(round(r_["profit"], 1))
        cols["roi"].append(round(r_["roi"], 4))
        for j, nm in enumerate(("tr", "va", "te")):
            cols[f"n_{nm}"].append(r_["cnt"][j])
            cols[f"roi_{nm}"].append(round(r_["prof"][j] / r_["cnt"][j], 4) if r_["cnt"][j] else None)
        cols["mdd"].append(round(r_["mdd"], 1))
        cols["r2"].append(round(r_["r2"], 3))
        cols["t"].append(round(r_["t"], 2))
        cols["score"].append(round(r_.get("score", 0.0), 3))
        cols["avg_odds"].append(round(r_["avg_odds"], 2))
        cols["winrate"].append(round(r_["winrate"], 3))

    out = {
        "generated": time.strftime("%Y-%m-%d"),
        "data_from": str(df.MatchDate.min().date()),
        "data_to": str(df.MatchDate.max().date()),
        "n_matches": int(n),
        "n_tested": len(rows),
        "n_profitable_tv": len(eligible),
        "splits": SPLITS,
        "labels": {"fair": FAIR, "exec": EXEC, "sel": SELS, "group": GROUP_LABELS},
        "vocab": vocab,
        "leagues": [[c, LEAGUES[c][0], LEAGUES[c][1]] for c in leagues],
        "teams": teams,
        "champion": champion["id"] if champion else None,
        "champion_single": champion_single["id"] if champion_single else None,
        "best_single_any": best_single_any["id"] if best_single_any else None,
        "trap": trap["id"],
        "refs": refs,
        "top": top_ids,
        "strategies": cols,
        "matches": matches,
        "bets": strategies_detail,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "backtest.json"
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {path} ({path.stat().st_size / 1e6:.2f} MB) in {time.time() - t0:.0f}s")
    return out


if __name__ == "__main__":
    run()
