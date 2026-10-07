"""Shared configuration for the Abysse pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"
WEB = ROOT / "web"
DIST = ROOT / "dist"

MATCHES_REPO = "https://github.com/xgabora/Club-Football-Match-Data-2000-2025.git"
OPENFOOTBALL_RAW = "https://raw.githubusercontent.com/openfootball/football.json/master"
FOOTBALL_DATA_FIXTURES = "https://www.football-data.co.uk/fixtures.csv"

# code -> display name, country, openfootball code, ESPN slug, timezone, tier
LEAGUES = {
    "E0": ("Premier League", "Angleterre", "en.1", "eng.1", "Europe/London", 1),
    "SP1": ("LaLiga", "Espagne", "es.1", "esp.1", "Europe/Madrid", 1),
    "D1": ("Bundesliga", "Allemagne", "de.1", "ger.1", "Europe/Berlin", 1),
    "I1": ("Serie A", "Italie", "it.1", "ita.1", "Europe/Rome", 1),
    "F1": ("Ligue 1", "France", "fr.1", "fra.1", "Europe/Paris", 1),
    "E1": ("Championship", "Angleterre", "en.2", "eng.2", "Europe/London", 2),
    "N1": ("Eredivisie", "Pays-Bas", "nl.1", "ned.1", "Europe/Amsterdam", 1),
    "P1": ("Liga Portugal", "Portugal", "pt.1", "por.1", "Europe/Lisbon", 1),
    "B1": ("Pro League", "Belgique", None, "bel.1", "Europe/Brussels", 1),
    "D2": ("2. Bundesliga", "Allemagne", None, "ger.2", "Europe/Berlin", 2),
    "E2": ("League One", "Angleterre", None, "eng.3", "Europe/London", 3),
    "E3": ("League Two", "Angleterre", None, "eng.4", "Europe/London", 4),
    "EC": ("National League", "Angleterre", None, "eng.5", "Europe/London", 5),
    "F2": ("Ligue 2", "France", None, "fra.2", "Europe/Paris", 2),
    "G1": ("Super League", "Grèce", None, "gre.1", "Europe/Athens", 1),
    "I2": ("Serie B", "Italie", None, "ita.2", "Europe/Rome", 2),
    "SC0": ("Premiership", "Écosse", None, "sco.1", "Europe/London", 1),
    "SC1": ("Championship", "Écosse", None, "sco.2", "Europe/London", 2),
    "SC2": ("League One", "Écosse", None, "sco.3", "Europe/London", 3),
    "SC3": ("League Two", "Écosse", None, "sco.4", "Europe/London", 4),
    "SP2": ("LaLiga 2", "Espagne", None, "esp.2", "Europe/Madrid", 2),
    "T1": ("Süper Lig", "Turquie", None, "tur.1", "Europe/Istanbul", 1),
}

LEAGUE_GROUPS = {
    "top5": ["E0", "SP1", "D1", "I1", "F1"],
    "top8": ["E0", "SP1", "D1", "I1", "F1", "E1", "N1", "P1"],
    "uk": ["E0", "E1", "E2", "E3", "EC", "SC0", "SC1", "SC2", "SC3"],
    "europe": list(LEAGUES),
}
GROUP_LABELS = {
    "top5": "Top 5 ligues",
    "top8": "Top 8 (avec matchs à venir)",
    "uk": "Royaume-Uni (9 divisions)",
    "europe": "Europe (22 divisions)",
}

FIRST_SEASON = 2005  # first season with max-odds coverage
SPLITS = {  # season start years, inclusive
    "train": (2005, 2013),
    "val": (2014, 2019),
    "test": (2020, 2026),
}
