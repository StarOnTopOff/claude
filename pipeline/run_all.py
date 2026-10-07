"""Full refresh: download data, replay the betting method, rebuild fixtures and picks, rebuild the web app."""
import time

import build
import export_method
import fetch
import fixtures
from config import RAW

if __name__ == "__main__":
    t0 = time.time()
    RAW.mkdir(parents=True, exist_ok=True)
    print("== fetch"); fetch.fetch_matches(); fetch.fetch_fixtures()
    print("== method backtest"); export_method.run()
    print("== fixtures"); fixtures.run()
    print("== build"); build.build()
    print(f"done in {time.time() - t0:.0f}s")
