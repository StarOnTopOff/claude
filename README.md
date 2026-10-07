# Abysse

A football value-betting app: at most **3 picks a day**, the minimum odds to accept on Stake, a Kelly-sized stake from your own bankroll, live scores and kick-off countdowns, a full backtest you can replay from any date, an AI analyst, notifications and a QR code to open it on your phone. Dark "liquid glass" design, all in English.

The whole app is one file: [`dist/index.html`](dist/index.html). Open it in a browser or publish it with GitHub Pages (see below).

## The method and its track record

**Fusion model, top 3 a day.** Bet365's prices with the margin removed are the starting point. Two models (a regularised logistic model and gradient-boosted trees, refit every July on the previous ten seasons) nudge the home/draw/away probabilities. They use how the other pre-match markets (over/under 2.5, Asian handicap) disagree with the 1X2 price, plus each team's Elo, attack/defence ratings, results against market expectations, shots and corners, all from matches played before the day.

A bet qualifies when the best available price beats the fair probability by more than 2%, at odds below 4.0, one bet per match. The app keeps the 3 biggest edges of the day and stakes a fraction of Kelly on your current bankroll.

How it was chosen, so the 2020+ numbers mean something:

- **Data:** 156,928 matches, 22 European divisions, 2006→Sept 2026, with Bet365 and best-market odds collected before each match ([football-data.co.uk](https://www.football-data.co.uk/) via the open [Club-Football-Match-Data](https://github.com/xgabora/Club-Football-Match-Data-2000-2025) set).
- **One shared harness:** [`research/harness.py`](research/harness.py). Configurations are picked on **July 2006 → June 2020 only**. **July 2020 → today** is kept aside and reported once.
- **Four research tracks** competed on that harness: baseline, odds-only model, fusion model, adaptive selection. Each was followed by an independent adversarial audit.
- **Picked by the 2006-2020 score:** fusion won clearly (1.39 vs 0.75, 0.52 and 0.48 for the others).

| Since July 2020 (out of sample) | $1,000 became | Per year | Worst drop |
|---|---:|---:|---:|
| Steady (¼ Kelly, recommended) | **$18,070** | +60% | −36% |
| Balanced (½ Kelly) | $133,633 | +121% | −62% |
| Aggressive (¾ Kelly) | $412,385 | +165% | −79% |
| Full Kelly | $534,699 | +177% | −89% |

4,188 bets, +4.5% profit per bet, 39% of bets won, average odds 2.92. Calendar years at ¼ Kelly: 2020 (H2) +3%, 2021 +132%, 2022 −4.5%, 2023 +101%, 2024 +55%, 2025 +115%, 2026 (to Sept) +18%.

### What the audits found

- **No data leak and no test snooping.** The numbers reproduce exactly.
- **The per-bet edge is thin and close to plain best-price shopping.** The bigger bankroll comes from more bets and larger Kelly stakes.
- **Profit is concentrated.** The top 1% of bets carry a large share of it, and 2021 alone about 40%.
- **It depends on getting the best of ~17 bookmakers before kick-off, with no stake limits.** A price 1–2% worse cuts results sharply, and bookmakers limit winning accounts.
- **Treat the totals as an optimistic scenario, not a forecast.** Full notes are in `research/*/AUDIT.md`.

## The app

| Screen | What it does |
|---|---|
| Home | Bankroll since July 2020, today's picks (min odds on Stake, edge, stake), live scores, next kick-offs with countdowns, the latest picks with results |
| Matches | Every fixture of 8 leagues: countdown, live score, outcome probabilities and fair odds, star to follow |
| Stake | Check a Stake price against the method's fair price: verdict and Kelly stake. Fill it by pasting Stake's text or dropping a screenshot (AI). "My bets" settles itself at full time and drives your bankroll |
| Backtest | Replay since Jul 2020, 2025, 2026, last 12 months, since 2006 or custom dates; 4 risk levels; any starting bankroll; yearly and monthly results; every bet |
| AI | Claude reads today's picks, the backtest and your bets (inside Claude). Elsewhere, a built-in analyst answers |

## Live data

- **Hosted version** (GitHub Pages or a local file): fetches fixtures and results from [openfootball](https://github.com/openfootball/football.json) and live scores from ESPN in the browser.
- **GitHub Actions refresh**: every 6 hours it downloads the latest results, stats and bookmaker odds from football-data.co.uk, recomputes the fusion probabilities for upcoming matches, and redeploys. That is what fills "Today's picks".
- **The Claude artifact** has no network access. It shows the snapshot embedded at build time; its AI works.

## Run it locally

```bash
pip install -r requirements.txt
python pipeline/run_all.py      # download, rebuild the method's history and picks, build dist/index.html
python -m http.server -d dist   # http://localhost:8000
```

- `pipeline/`: data download, the fusion model (`pipeline/fusion/`), backtest export, fixtures and picks, single-file build.
- `research/`: the harness, the four research tracks and their audits.
- `web/`: the app's source.

## Publish on GitHub Pages

1. Merge this branch into `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow `Refresh data and deploy` publishes to `https://starontopoff.github.io/claude/` and refreshes it every 6 hours. The app's QR button points there.

## Responsible gambling

Betting is gambling. Even a winning method goes through long losing runs, and bookmakers restrict winning accounts. Only bet what you can afford to lose. Stake is not licensed in France. Help: BeGambleAware.org · Joueurs Info Service 09 74 75 13 13.
