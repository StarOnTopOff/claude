"""Current-season fixtures, live Elo ratings and the probability model for the app.

The browser recomputes probabilities itself (same formula, exported coefficients),
so fixtures fetched live from openfootball get the same treatment as baked ones.
"""
import csv
import datetime as dt
import json
import re
import unicodedata
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from config import LEAGUES, OUT, RAW
from data import latest_elo_model, load_matches
from fetch import current_season

# openfootball name -> football-data / dataset name, where automatic matching fails
NAME_OVERRIDES = {
    "Brighton & Hove Albion FC": "Brighton", "Manchester City FC": "Man City", "Manchester United FC": "Man United",
    "Nottingham Forest FC": "Nott'm Forest", "Tottenham Hotspur FC": "Tottenham", "Wolverhampton Wanderers FC": "Wolves",
    "Queens Park Rangers FC": "QPR", "West Bromwich Albion FC": "West Brom", "Preston North End FC": "Preston",
    "Sheffield Wednesday FC": "Sheffield Weds", "West Ham United FC": "West Ham", "Leicester City FC": "Leicester",
    "Oxford United FC": "Oxford", "Newcastle United FC": "Newcastle", "Leeds United FC": "Leeds",
    "FC Bayern München": "Bayern Munich", "Borussia Dortmund": "Dortmund", "Eintracht Frankfurt": "Ein Frankfurt",
    "1. FC Köln": "FC Koln", "Borussia Mönchengladbach": "M'gladbach", "Bayer 04 Leverkusen": "Leverkusen",
    "TSG 1899 Hoffenheim": "Hoffenheim", "SV 07 Elversberg": "Elversberg", "SC Paderborn 07": "Paderborn",
    "1. FSV Mainz 05": "Mainz", "1. FC Union Berlin": "Union Berlin", "Hamburger SV": "Hamburg",
    "SV Werder Bremen": "Werder Bremen", "FC Schalke 04": "Schalke 04", "VfL Wolfsburg": "Wolfsburg",
    "FC St. Pauli 1910": "St Pauli", "1. FC Heidenheim 1846": "Heidenheim",
    "Paris Saint-Germain FC": "Paris SG", "Olympique Lyonnais": "Lyon", "Olympique de Marseille": "Marseille",
    "Racing Club de Lens": "Lens", "Stade Brestois 29": "Brest", "Stade Rennais FC 1901": "Rennes",
    "RC Strasbourg Alsace": "Strasbourg", "AS Monaco FC": "Monaco", "ES Troyes AC": "Troyes", "FC Nantes": "Nantes",
    "FC Internazionale Milano": "Inter", "AC Milan": "Milan", "Hellas Verona FC": "Verona",
    "AFC Ajax": "Ajax", "AZ": "AZ Alkmaar", "PSV": "PSV Eindhoven", "NEC": "Nijmegen", "Feyenoord Rotterdam": "Feyenoord",
    "FC Twente '65": "Twente", "ADO Den Haag": "Den Haag", "Fortuna Sittard": "For Sittard", "SBV Excelsior": "Excelsior",
    "SC Cambuur-Leeuwarden": "Cambuur", "PEC Zwolle": "Zwolle", "Telstar 1963": "Telstar", "Willem II Tilburg": "Willem II",
    "NAC Breda": "NAC Breda", "Heracles Almelo": "Heracles",
    "Sport Lisboa e Benfica": "Benfica", "Sporting Clube de Braga": "Sp Braga", "Sporting Clube de Portugal": "Sp Lisbon",
    "Vitória Guimarães": "Guimaraes", "CF Estrela da Amadora": "Estrela", "Académico de Viseu FC": "Academico Viseu",
    "GD Estoril Praia": "Estoril", "CS Marítimo": "Maritimo", "FC Famalicão": "Famalicao",
    "Athletic Club": "Ath Bilbao", "Club Atlético de Madrid": "Ath Madrid", "Deportivo Alavés": "Alaves",
    "RC Celta de Vigo": "Celta", "RC Deportivo La Coruña": "La Coruna", "RCD Espanyol de Barcelona": "Espanol",
    "Rayo Vallecano de Madrid": "Vallecano", "Real Betis Balompié": "Betis", "Real Racing Club de Santander": "Santander",
    "Real Sociedad de Fútbol": "Sociedad", "RCD Mallorca": "Mallorca", "Real Oviedo": "Oviedo", "Girona FC": "Girona",
}
DISPLAY_OVERRIDES = {
    "Sport Lisboa e Benfica": "Benfica", "Sporting Clube de Portugal": "Sporting CP", "Sporting Clube de Braga": "SC Braga",
    "Club Atlético de Madrid": "Atlético Madrid", "Real Sociedad de Fútbol": "Real Sociedad", "Athletic Club": "Athletic Bilbao",
    "FC Internazionale Milano": "Inter Milan", "AC Milan": "AC Milan", "Paris Saint-Germain FC": "PSG", "AZ": "AZ Alkmaar",
    "PSV": "PSV", "NEC": "NEC Nijmegen", "Racing Club de Lens": "RC Lens", "Real Racing Club de Santander": "Racing Santander",
    "RCD Espanyol de Barcelona": "Espanyol", "Rayo Vallecano de Madrid": "Rayo Vallecano", "Real Betis Balompié": "Real Betis",
    "RC Deportivo La Coruña": "Deportivo La Coruña", "Brighton & Hove Albion FC": "Brighton", "Wolverhampton Wanderers FC": "Wolves",
    "Tottenham Hotspur FC": "Tottenham", "Stade Rennais FC 1901": "Rennes", "RC Strasbourg Alsace": "Strasbourg",
    "Olympique Lyonnais": "Lyon", "Olympique de Marseille": "Marseille", "Stade Brestois 29": "Brest", "ES Troyes AC": "Troyes",
    "SC Cambuur-Leeuwarden": "Cambuur", "CF Estrela da Amadora": "Estrela Amadora", "Feyenoord Rotterdam": "Feyenoord",
    "FC Twente '65": "Twente", "Willem II Tilburg": "Willem II", "Telstar 1963": "Telstar",
    "Paris FC": "Paris FC", "SV 07 Elversberg": "Elversberg", "TSG 1899 Hoffenheim": "Hoffenheim",
    "Bayer 04 Leverkusen": "Leverkusen", "SC Paderborn 07": "Paderborn", "1. FSV Mainz 05": "Mainz 05",
    "FC Schalke 04": "Schalke 04", "FC Bayern München": "Bayern Munich",
}
PREFIX = re.compile(r"^(1\.\s*)?(FC|AFC|SC|SV|AC|AS|SS|SSC|US|CD|RC|RCD|CA|CF|CS|GD|SBV|PEC|ACF|TSG|VfL|VfB|FSV|OGC|AJ|ES)\s+", re.I)
SUFFIX = re.compile(r"\s+(FC|AFC|CF|SC|AC|BC|CFC|SCO|OSC|UD|Calcio|\d{2,4})$", re.I)


def clean_display(name):
    if name in DISPLAY_OVERRIDES:
        return DISPLAY_OVERRIDES[name]
    s = name
    for _ in range(3):
        s = SUFFIX.sub("", PREFIX.sub("", s)).strip()
    return s or name


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z ]", " ", s)
    stop = {"fc", "afc", "cf", "sc", "ac", "as", "ss", "ssc", "us", "cd", "rc", "rcd", "ca", "de", "da", "la", "club", "calcio", "city", "united", "town"}
    return [t for t in s.split() if t not in stop]


def match_name(of_name, candidates):
    if of_name in NAME_OVERRIDES:
        return NAME_OVERRIDES[of_name]
    a = set(norm(of_name))
    best, score = None, 0.0
    for c in candidates:
        b = set(norm(c))
        if not a or not b:
            continue
        s = len(a & b) / len(a | b)
        if s > score:
            best, score = c, s
    return best if score >= 0.34 else None


def to_utc_ms(date, time, tz):
    hh, mm = (time or "15:00").split(":")[:2]
    local = dt.datetime.fromisoformat(date).replace(hour=int(hh), minute=int(mm), tzinfo=ZoneInfo(tz))
    return int(local.timestamp() * 1000)


def elo_update(ratings, home, away, hg, ag, k=20.0, hfa=60.0):
    rh, ra = ratings.get(home), ratings.get(away)
    if rh is None or ra is None:
        return
    exp_h = 1.0 / (1.0 + 10 ** (-(rh + hfa - ra) / 400.0))
    score = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
    gd = abs(hg - ag)
    mult = 1.0 if gd <= 1 else 1.5 if gd == 2 else (11.0 + gd) / 8.0
    delta = k * mult * (score - exp_h)
    ratings[home] = rh + delta
    ratings[away] = ra - delta


def parse_fd_fixtures(path, name_set):
    """football-data.co.uk fixtures.csv -> list of fixtures with Bet365 and max odds."""
    out = []
    if not path.exists():
        return out
    with open(path, encoding="utf-8-sig", errors="ignore") as f:
        for row in csv.DictReader(f):
            div = (row.get("Div") or "").strip()
            if div not in LEAGUES:
                continue
            try:
                d, m, y = row["Date"].split("/")
                y = int(y) + (2000 if len(y) == 2 else 0)
                t = to_utc_ms(f"{y:04d}-{int(m):02d}-{int(d):02d}", row.get("Time") or "15:00", "Europe/London")
            except (KeyError, ValueError):
                continue

            def num(*keys):
                for k in keys:
                    try:
                        v = float(row.get(k) or "nan")
                        if v > 1:
                            return v
                    except ValueError:
                        pass
                return None

            b365 = [num("B365H"), num("B365D"), num("B365A")]
            mx = [num("MaxH", "BbMxH"), num("MaxD", "BbMxD"), num("MaxA", "BbMxA")]
            ou = [num("B365>2.5"), num("B365<2.5")]
            mou = [num("Max>2.5", "BbMx>2.5"), num("Max<2.5", "BbMx<2.5")]
            out.append({
                "lg": div, "t": t, "h": row["HomeTeam"].strip(), "a": row["AwayTeam"].strip(),
                "b365": b365 if all(b365) else None, "max": [max(x, b) for x, b in zip(mx, b365)] if all(mx) and all(b365) else None,
                "ou": ou if all(ou) else None, "mou": [max(x, b) for x, b in zip(mou, ou)] if all(mou) and all(ou) else None,
            })
    return out


def run(today=None):
    today = today or dt.date.today()
    _, season_label = current_season(today)
    df = load_matches()
    _, coef = latest_elo_model(df)

    elo = pd.read_csv(RAW / "matches" / "data" / "EloRatings.csv", parse_dates=["date"])
    snap_date = elo.date[elo.date <= pd.Timestamp(today)].max()
    ratings = elo[elo.date == snap_date].set_index("club").elo.to_dict()
    # teams missing from the snapshot: last known Elo from the matches table
    last_known = {}
    for side in ("Home", "Away"):
        sub = df.dropna(subset=[f"{side}Elo"])
        last_known.update(sub.groupby(f"{side}Team")[f"{side}Elo"].last().to_dict())

    known_names = {c: sorted(set(df[(df.Division == c) & (df.season >= df.season.max() - 3)].HomeTeam)) for c in LEAGUES}
    all_names = sorted(set(df.HomeTeam) | set(df.AwayTeam))

    fixtures, played, name_map, display = [], [], {}, {}
    unmatched = set()
    of_dir = RAW / "openfootball" / season_label
    for code, (lname, country, of_code, espn, tz, tier) in LEAGUES.items():
        f = of_dir / f"{code}.json"
        if not of_code or not f.exists():
            continue
        data = json.loads(f.read_text())
        for m in data["matches"]:
            for side in ("team1", "team2"):
                nm = m[side]
                if nm not in name_map:
                    ds = match_name(nm, known_names[code]) or match_name(nm, all_names)
                    if ds is None:
                        unmatched.add(nm)
                        ds = clean_display(nm)
                    name_map[nm] = ds
                    display[ds] = clean_display(nm)
            item = {
                "lg": code, "t": to_utc_ms(m["date"], m.get("time"), tz), "h": name_map[m["team1"]], "a": name_map[m["team2"]],
                "r": m.get("round", ""),
            }
            sc = m.get("score")
            ft = sc.get("ft") if isinstance(sc, dict) else sc if isinstance(sc, list) and len(sc) == 2 else None
            if ft:
                item["s"] = ft
                played.append(item)
            else:
                fixtures.append(item)
    if unmatched:
        print("unmatched openfootball names:", sorted(unmatched))

    # Elo: snapshot + results played after it
    for team in set(name_map.values()):
        if team not in ratings and team in last_known:
            ratings[team] = float(last_known[team])
    snap_ms = int(pd.Timestamp(snap_date).tz_localize("UTC").timestamp() * 1000)
    for m in sorted(played, key=lambda x: x["t"]):
        if m["t"] > snap_ms:
            elo_update(ratings, m["h"], m["a"], m["s"][0], m["s"][1])

    # Bookmaker odds for the coming days, when football-data.co.uk is reachable
    fd = parse_fd_fixtures(RAW / "fixtures.csv", set(all_names))
    by_key = {(x["lg"], x["h"], x["a"]): x for x in fixtures}
    n_odds = 0
    for x in fd:
        key = (x["lg"], x["h"], x["a"])
        target = by_key.get(key)
        if target is None:
            target = {"lg": x["lg"], "t": x["t"], "h": x["h"], "a": x["a"], "r": ""}
            fixtures.append(target)
            by_key[key] = target
        for k in ("b365", "max", "ou", "mou"):
            if x[k]:
                target[k] = x[k]
        n_odds += 1

    now_ms = int(dt.datetime.combine(today, dt.time(0), dt.timezone.utc).timestamp() * 1000)
    fixtures = sorted((x for x in fixtures if x["t"] >= now_ms - 3 * 3600 * 1000), key=lambda x: (x["t"], x["lg"]))
    played = sorted(played, key=lambda x: -x["t"])

    teams_needed = {x["h"] for x in fixtures + played} | {x["a"] for x in fixtures + played}
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": season_label,
        "elo_snapshot": str(pd.Timestamp(snap_date).date()),
        "model": coef,
        "ratings": {t: round(float(ratings[t]), 1) for t in sorted(teams_needed) if t in ratings},
        "name_map": name_map,
        "display": display,
        "leagues": {c: {"name": v[0], "country": v[1], "of": v[2], "espn": v[3], "tz": v[4]} for c, v in LEAGUES.items()},
        "fixtures": fixtures,
        "results": played[:400],
        "odds_source": "football-data.co.uk" if n_odds else None,
    }
    path = OUT / "fixtures.json"
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {path}: {len(fixtures)} fixtures ({n_odds} with odds), {len(played)} results, Elo snapshot {out['elo_snapshot']}")
    missing = sorted(t for t in teams_needed if t not in ratings)
    if missing:
        print("teams without Elo:", missing)
    return out


if __name__ == "__main__":
    run()
