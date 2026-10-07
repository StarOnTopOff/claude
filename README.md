# Abysse · value betting lab

Appli web de paris sportifs football : stratégie backtestée sur 20 ans, matchs à venir avec compte à rebours, scores en direct, comparateur de cotes Stake, journal de paris, analyste IA, notifications et QR code pour ouvrir l'appli sur le téléphone. Design « liquid glass » sombre, noir et bleu.

Tout tient dans un seul fichier : [`dist/index.html`](dist/index.html). Ouvre-le dans un navigateur, ou déploie-le avec GitHub Pages (voir plus bas).

## Le résultat du backtest

- **156 928 matchs** de 22 divisions européennes, saison 2005/06 → septembre 2026, avec les cotes Bet365 et les meilleures cotes du marché relevées avant chaque match.
- **20 480 stratégies** testées : source de probabilité (marché sans marge, Elo, mélanges), prix d'exécution (un seul bookmaker ou meilleure cote), marché (1N2, nul, domicile, extérieur, over/under 2,5), seuil d'avantage, plage de cotes, groupe de championnats.
- **Trois périodes séparées** : entraînement 2005–2014, validation 2014–2020, test 2020→2026. La stratégie retenue est choisie sur les deux premières uniquement, puis mesurée sur la troisième.

| Stratégie championne | Paris | ROI entraînement | ROI validation | ROI hors-échantillon |
|---|---:|---:|---:|---:|
| 1N2, cote 1,01–1,60, 22 divisions, value > 0 % vs Bet365 sans marge, misé à la meilleure cote | 12 166 | +2,1 % | +2,4 % | **+2,7 %** (3 825 paris) |

Courbe très régulière (R² = 0,98 sur 21 saisons), pire creux de 23 unités pour +289 unités de gain à mise fixe.

Ce que le backtest dit aussi, honnêtement :

- **Jouer chez un seul bookmaker ne tient pas.** Les 10 stratégies à un seul bookmaker qui passaient l'entraînement et la validation finissent toutes négatives après 2020 (de −7 % à −18 %). Sur les 3 277 qui ont au moins 200 paris après 2020, le ROI médian est de −10,8 % ; les 88 positives perdaient sur les périodes précédentes, donc du hasard. La marge du bookmaker mange l'avantage d'un modèle Elo.
- Le gain vient de **prendre le bookmaker qui paie au-dessus du prix juste du marché**. Pour Stake, la règle de l'appli est donc : ne miser que si la cote Stake dépasse le prix juste calculé à partir d'un autre bookmaker.
- Le « choix naïf » (meilleure stratégie sur la seule période d'entraînement) passe de +35 % à −17 % ensuite. Le Labo de l'appli montre ce piège pour les 20 480 stratégies.
- L'avantage est mince. Les bookmakers limitent les comptes gagnants. Rien n'est garanti.

## Fonctionnalités

| Onglet | Contenu |
|---|---|
| Accueil | Stratégie championne, courbe 2005→2026, prochain coup d'envoi en compte à rebours, paris recommandés ou favoris à vérifier, matchs en direct |
| Matchs | Calendrier 2026-27 (8 championnats), probabilités 1N2, cotes justes, Elo, score et minute en direct, suivi par étoile, test rapide des cotes Stake |
| Stake | Comparateur : cotes Stake + cotes de référence → cote juste, avantage, mise Kelly, verdict selon la règle validée. Remplissage par copier-coller du texte Stake ou par capture d'écran lue par l'IA. Journal de paris réglé automatiquement au score final |
| Backtest | Rejoue n'importe quelle stratégie phare sur la période choisie (tout, hors-échantillon, 2025→, 2026→, 12 mois, dates libres), avec bankroll et méthode de mise (Kelly 1/8–1/2, % de bankroll, mise fixe) |
| Labo | Nuage des 20 480 stratégies avant/après, classement des stratégies robustes, méthode |
| IA | Claude branché sur les données de l'appli (quand la page est ouverte dans Claude), sinon analyste intégré |

Plus : notifications (rappel 15 min avant le coup d'envoi, buts, value, résultat de tes paris), QR code, réglages de bankroll, limite de mise quotidienne.

## Direct et données

- La version hébergée (GitHub Pages ou fichier local) récupère le calendrier et les résultats sur [openfootball](https://github.com/openfootball/football.json) et les scores en direct sur l'API publique d'ESPN.
- La version ouverte dans Claude (artefact) n'a pas accès au réseau : elle affiche l'instantané embarqué, mais l'IA y fonctionne.
- Le workflow GitHub Actions relance tout le pipeline toutes les 6 heures : nouvelles données, nouveau backtest, Elo mis à jour, et cotes Bet365 + meilleures cotes de la semaine depuis [football-data.co.uk](https://www.football-data.co.uk/). Ce sont ces cotes qui alimentent les « paris recommandés » automatiques.

Sources : football-data.co.uk (via le jeu de données ouvert [Club-Football-Match-Data](https://github.com/xgabora/Club-Football-Match-Data-2000-2025)), ClubElo, openfootball, ESPN.

## Lancer en local

```bash
pip install -r requirements.txt
python pipeline/run_all.py      # télécharge, backteste (≈ 1 min), construit dist/index.html
python -m http.server -d dist   # puis http://localhost:8000
```

Scripts séparés dans `pipeline/` : `fetch.py`, `backtest.py`, `fixtures.py`, `build.py`. Sources du site dans `web/`.

## Déployer sur GitHub Pages

1. Fusionne cette branche dans `main`.
2. Dans le dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `Refresh data and deploy` publie le site sur `https://starontopoff.github.io/claude/` puis le rafraîchit toutes les 6 heures. Le bouton QR code de l'appli propose ce lien.

## Jeu responsable

Le pari reste un jeu d'argent. Même une stratégie positive traverse de longues séries perdantes. Fixe une limite et tiens-la. Stake n'est pas agréé par l'ANJ en France. Aide : Joueurs Info Service, 09 74 75 13 13.
