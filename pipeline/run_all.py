"""Full refresh: download data, rerun the strategy search, rebuild fixtures and the web app."""
import time

import backtest
import build
import fetch
import fixtures
from config import RAW

if __name__ == "__main__":
    t0 = time.time()
    RAW.mkdir(parents=True, exist_ok=True)
    print("== fetch"); fetch.fetch_matches(); fetch.fetch_fixtures()
    print("== backtest"); backtest.run()
    print("== fixtures"); fixtures.run()
    print("== build"); build.build()
    print(f"done in {time.time() - t0:.0f}s")
