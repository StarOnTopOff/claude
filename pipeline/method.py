"""The betting method used by the app: probabilities, filters, daily cap and Kelly fraction.

`historical_p` gives a walk-forward probability for every candidate bet in the
history (research/harness.py candidate table); `upcoming_p` gives the same
probability for next matches from the odds published before kick-off.
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "research"))
import harness  # noqa: E402
from data import novig_power  # noqa: E402

METHOD = {
    "name": "Best-price value, top 3 a day",
    "cfg": {"thr": 0.02, "lo": 1.01, "hi": 10.0, "mkts": "all", "group": "europe", "K": 3, "rank": "kelly", "exec": "max"},
    "kelly_f": 0.25,
    "summary": "Fair probability = Bet365 odds with the margin removed. Bet the best market price when it beats that "
               "fair price by more than 2 %, keep the 3 bets a day with the largest Kelly fraction.",
}


def historical_p(c):
    return harness.baseline_p(c)


def upcoming_p(b365_1x2=None, b365_ou=None):
    """Probabilities for an upcoming match from its Bet365 prices: {'H','D','A','O','U'} -> p."""
    out = {}
    if b365_1x2 and all(x and x > 1 for x in b365_1x2):
        p = novig_power(np.array([b365_1x2], float))[0]
        out.update(H=float(p[0]), D=float(p[1]), A=float(p[2]))
    if b365_ou and all(x and x > 1 for x in b365_ou):
        p = novig_power(np.array([b365_ou], float))[0]
        out.update(O=float(p[0]), U=float(p[1]))
    return out
