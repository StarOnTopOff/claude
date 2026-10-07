"""Download the raw datasets used by the pipeline.

- Historical matches + odds + Elo: xgabora/Club-Football-Match-Data (sourced
  from football-data.co.uk and clubelo.com), cloned with git.
- Current season fixtures/results: openfootball/football.json (raw GitHub).
- Optional: football-data.co.uk/fixtures.csv with this week's bookmaker odds.
  Not reachable from every network; the pipeline works without it.
"""
import datetime as dt
import subprocess
import sys
import urllib.request

from config import FOOTBALL_DATA_FIXTURES, LEAGUES, MATCHES_REPO, OPENFOOTBALL_RAW, RAW


def current_season(today=None):
    today = today or dt.date.today()
    y = today.year if today.month >= 7 else today.year - 1
    return y, f"{y}-{(y + 1) % 100:02d}"


def get(url, dest, timeout=30):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            data = r.read()
        dest.write_bytes(data)
        return True
    except Exception as e:  # network policy, 404, timeout
        print(f"  skip {url}: {e}", file=sys.stderr)
        return False


def fetch_matches():
    repo = RAW / "matches"
    if (repo / ".git").exists():
        subprocess.run(["git", "-C", str(repo), "pull", "--ff-only", "-q"], check=False)
    else:
        subprocess.run(["git", "clone", "-q", "--depth", "1", MATCHES_REPO, str(repo)], check=True)
    return repo / "data"


def fetch_fixtures():
    _, label = current_season()
    out = RAW / "openfootball" / label
    out.mkdir(parents=True, exist_ok=True)
    for code, (_, _, of_code, *_rest) in LEAGUES.items():
        if of_code:
            ok = get(f"{OPENFOOTBALL_RAW}/{label}/{of_code}.json", out / f"{code}.json")
            print(f"  openfootball {label}/{of_code}: {'ok' if ok else 'missing'}")
    ok = get(FOOTBALL_DATA_FIXTURES, RAW / "fixtures.csv")
    print(f"  football-data fixtures.csv: {'ok' if ok else 'unavailable'}")
    return out


if __name__ == "__main__":
    RAW.mkdir(parents=True, exist_ok=True)
    print("matches:", fetch_matches())
    print("fixtures:", fetch_fixtures())
