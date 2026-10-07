/* ============================== Accueil ============================== */
const SPLIT_REGIONS = () => {
  const sp = S.bt.splits, d = (y) => dateToDay(new Date(y, 6, 1));
  return [
    { from: d(sp.train[0]), to: d(sp.train[1] + 1), color: "rgba(120,140,190,.07)", label: "Entraînement" },
    { from: d(sp.val[0]), to: d(sp.val[1] + 1), color: "rgba(102,166,255,.09)", label: "Validation" },
    { from: d(sp.test[0]), to: d(sp.test[1] + 1), color: "rgba(61,220,151,.09)", label: "Hors-échantillon", ink: "rgba(140,240,190,.8)" },
  ];
};
function flatCurve(sid) {
  // cumulative profit in units (1 unit per bet), one point per betting day
  const B = S.bt.bets[String(sid)], M = S.bt.matches, pts = [];
  let cum = 0, last = -1;
  for (let i = 0; i < B.m.length; i++) {
    const d = M.day[B.m[i]];
    if (d !== last && last >= 0) pts.push({ x: last, y: cum });
    cum += B.w[i] ? B.o[i] / 100 - 1 : -1; last = d;
  }
  pts.push({ x: last, y: cum });
  return pts;
}
function pickRows(limit = 6) {
  const now = Date.now();
  const lg = new Set(S.settings.leagues);
  const up = upcoming(now).filter((f) => f.t < now + 4 * DAY);
  const picks = up.filter((f) => f.pick);
  if (picks.length) return { kind: "picks", rows: picks.slice(0, limit) };
  const watch = up.filter((f) => lg.has(f.lg) && f.fav && f.fav.fair < 1.6).sort((a, b) => a.t - b.t);
  return { kind: "watch", rows: watch.slice(0, limit) };
}
const SEL = ["1", "N", "2"];
function selLabel(f, k) { return k === 0 ? teamLabel(f.h) : k === 2 ? teamLabel(f.a) : "Match nul"; }

RENDER.home = function () {
  const el = $("#view-home"), b = S.bt, ch = strat(b.champion), now = Date.now();
  const next = upcoming(now).filter((f) => f.t > now && S.settings.leagues.includes(f.lg))[0];
  const pr = pickRows();
  const live = liveNow();
  const jr = journalStats();
  const testYears = `${b.splits.test[0]} → ${fmtDate(dayToDate(S.dataTo), { month: "short", year: "numeric" })}`;
  el.innerHTML = `
  <div class="page-head rise">
    <div>
      <div class="eyebrow" id="home-date"></div>
      <h1>Ta stratégie, testée sur ${fmtN(b.n_matches)} matchs.</h1>
      <p>${fmtN(b.n_tested)} stratégies passées au crible de 2005 à ${dayToDate(S.dataTo).getUTCFullYear()}. Une seule retenue : la plus régulière sur deux périodes, puis vérifiée sur des saisons qu'elle n'avait jamais vues.</p>
    </div>
  </div>

  <article class="glass hero rise">
    <div class="hero-top">
      <div>
        <div class="eyebrow">Stratégie championne · ROI hors-échantillon</div>
        <div class="hero-figure" id="hero-roi">${fmtPct(ch.roi_te, 1)}</div>
        <div class="hero-cap">par pari, sur <b>${fmtN(ch.n_te)}</b> paris joués ${testYears}, une période jamais utilisée pour la choisir.</div>
      </div>
      <div class="row">
        <a class="btn" href="#backtest">${icon("i-chart")}Backtest détaillé</a>
        <a class="btn ghost" href="#labo">Pourquoi celle-ci ?</a>
      </div>
    </div>
    <div class="hero-rule"><b>Règle :</b> ${esc(stratRule(ch))}</div>
    <div id="hero-chart" style="margin-top:12px"></div>
    <div class="legend split-legend"><span><i class="tr"></i>Entraînement ${b.splits.train[0]}–${b.splits.train[1] + 1}</span><span><i class="va"></i>Validation ${b.splits.val[0]}–${b.splits.val[1] + 1}</span><span><i class="te"></i>Hors-échantillon ${b.splits.test[0]}→</span><span>Gain cumulé en unités (1 u par pari)</span></div>
    <div class="kpis">
      <div class="kpi"><div class="k">Paris (2005→)</div><div class="v">${fmtN(ch.n)}</div></div>
      <div class="kpi"><div class="k">Gain total</div><div class="v pos">+${fmtN(ch.profit, 0)} u</div></div>
      <div class="kpi"><div class="k">ROI 2005→</div><div class="v">${fmtPct(ch.roi, 2)}</div></div>
      <div class="kpi"><div class="k">Régularité R²</div><div class="v">${nf2.format(ch.r2)}</div></div>
      <div class="kpi"><div class="k">Pire creux</div><div class="v neg">−${fmtN(ch.mdd, 0)} u</div></div>
      <div class="kpi"><div class="k">Réussite</div><div class="v">${fmtPct(ch.winrate, 0, false)}</div></div>
    </div>
  </article>

  ${live.length ? `<section class="glass panel rise" style="margin-top:14px">
    <div class="panel-head"><h2><span class="dot pulse" style="display:inline-block;margin-right:8px"></span>En direct</h2><a class="btn small ghost" href="#matchs">Tous les matchs</a></div>
    <div class="live-strip">${live.map((f) => `<div class="live-card"><div class="m-meta">${esc(S.fx.leagues[f.lg].name)} · <b class="pos">${esc(f.live.detail || "")}</b></div>
      <div class="ln"><span>${esc(teamLabel(f.h))}</span><b>${f.live.hs}</b></div><div class="ln"><span>${esc(teamLabel(f.a))}</span><b>${f.live.as}</b></div></div>`).join("")}</div>
  </section>` : ""}

  <div class="grid-2" style="margin-top:14px">
    <section class="glass panel rise">
      <div class="panel-head"><h2>Prochain coup d'envoi</h2><span class="sub">${next ? esc(S.fx.leagues[next.lg].name) : ""}</span></div>
      ${next ? `
        <div class="row" style="gap:12px;margin-bottom:12px">${crest(next.h)}<b>${esc(teamLabel(next.h))}</b><span class="muted">vs</span>${crest(next.a)}<b>${esc(teamLabel(next.a))}</b></div>
        <div class="countdown" data-cdbig="${next.t}">${cdBig(next.t - now)}</div>
        <p class="muted" style="margin:10px 0 0;font-size:13px">${esc(fmtDayHead(next.t))} à ${fmtTime(next.t)}${next.pFair ? ` · favori : <b class="ink2">${esc(selLabel(next, next.fav.k))}</b> (cote juste ${fmtOdds(next.fav.fair)})` : ""}</p>
        <div class="next-list">${upcoming(now).filter((f) => f.t > next.t && S.settings.leagues.includes(f.lg)).slice(0, 8).map((f) => `<div class="r"><span class="mono muted">${fmtTime(f.t)}</span><span>${esc(teamLabel(f.h))} – ${esc(teamLabel(f.a))}</span><span class="mono" style="color:var(--cyan);font-size:11.5px" data-cd="${f.t}" data-cdc="1">${countdownShort(f.t - now, true)}</span></div>`).join("")}</div>
      ` : `<div class="empty">Aucun match programmé dans tes championnats.</div>`}
    </section>

    <section class="glass panel rise">
      <div class="panel-head"><h2>${pr.kind === "picks" ? "Paris recommandés" : "Favoris à vérifier sur Stake"}</h2>
        <span class="sub">${pr.kind === "picks" ? "Règle championne, cotes du marché" : "Mise seulement si Stake paie au moins la cote affichée"}</span></div>
      ${pr.rows.length ? `<div class="stack">${pr.rows.map((f) => {
        const k = f.pick ? f.pick.k : f.fav.k;
        const min = f.pick ? 1 / f.pick.p : f.fav.fair;
        const stake = f.pick ? stakeFor(f.pick.p, f.pick.odds) : null;
        return `<div class="pick-row" data-open-stake="${esc(f.key)}">
          <div style="min-width:0"><div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(teamLabel(f.h))} – ${esc(teamLabel(f.a))}</div>
          <div class="m-meta"><span>${esc(fmtDayHead(f.t).split(" · ")[0])} ${fmtTime(f.t)}</span><span data-cd="${f.t}" class="mono" style="color:var(--cyan)">${countdownShort(f.t - Date.now())}</span></div></div>
          <div style="text-align:right;flex:none">
            <div><span class="tag ${f.pick ? "pick" : "info"}">${SEL[k]} · ${esc(selLabel(f, k))}</span></div>
            <div class="num" style="font-size:12.5px;margin-top:3px">${f.pick ? `@ ${fmtOdds(f.pick.odds)} · mise ${fmtEur(stake, 0)}` : `cote Stake ≥ <b>${fmtOdds(min)}</b>`}</div>
          </div></div>`;
      }).join("")}</div>
      <p class="muted" style="font-size:12px;margin:12px 0 0">${pr.kind === "picks" ? "Cotes Bet365 et meilleures cotes du marché (football-data.co.uk)." : "Cote juste estimée par le modèle Elo. Pour une décision fiable, entre aussi la cote d'un 2ᵉ bookmaker dans l'onglet Stake."}</p>`
      : `<div class="empty">Rien d'éligible dans les 4 prochains jours.</div>`}
    </section>
  </div>

  <div class="grid-2" style="margin-top:14px">
    <section class="glass panel rise">
      <div class="panel-head"><h2>Mes paris</h2><a class="btn small ghost" href="#stake" data-stake-tab="journal">Ouvrir le journal</a></div>
      <div class="kpis compact" style="margin-top:0">
        <div class="kpi"><div class="k">Bankroll</div><div class="v">${fmtEur(S.settings.bankroll + jr.profit, 0)}</div></div>
        <div class="kpi"><div class="k">Résultat</div><div class="v ${cls(jr.profit)}">${fmtEur(jr.profit, 2, true)}</div></div>
        <div class="kpi"><div class="k">En cours</div><div class="v">${jr.open}</div></div>
        <div class="kpi"><div class="k">ROI</div><div class="v ${cls(jr.roi)}">${fmtPct(jr.roi)}</div></div>
      </div>
      ${S.journal.length ? "" : `<p class="muted" style="font-size:13px;margin:12px 0 0">Ajoute tes paris depuis le comparateur Stake : ils se règlent tout seuls quand le score final tombe.</p>`}
    </section>
    <section class="glass panel rise">
      <div class="panel-head"><h2>Derniers résultats</h2><span class="sub">Tes championnats</span></div>
      <div class="stack">${S.results.filter((r) => S.settings.leagues.includes(r.lg)).slice(0, 6).map((r) => `
        <div class="row" style="justify-content:space-between;font-size:13.5px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(teamLabel(r.h))} – ${esc(teamLabel(r.a))}</span>
        <span class="row" style="gap:8px;flex:none"><span class="muted" style="font-size:11.5px">${fmtDate(r.t, { day: "2-digit", month: "2-digit" })}</span><b class="num">${r.s[0]} – ${r.s[1]}</b></span></div>`).join("") || `<div class="empty">Pas encore de résultat.</div>`}</div>
    </section>
  </div>
  <p class="foot">Données : football-data.co.uk (cotes historiques, via le jeu de données ouvert Club-Football-Match-Data), ClubElo, openfootball, ESPN pour le direct. Les performances passées ne garantissent rien : le marché s'adapte, les bookmakers limitent les gagnants. Ne mise que ce que tu peux perdre. Aide : Joueurs Info Service, 09 74 75 13 13 (appel non surtaxé).</p>`;

  const chart = new LineChart($("#hero-chart"), 220);
  chart.set(flatCurve(b.champion), { regions: SPLIT_REGIONS(), baseline: 0, yfmt: (v) => fmtN(v) + " u", tip: (p) => `${fmtDate(dayToDate(p.x))} · <b>${p.y >= 0 ? "+" : ""}${fmtN(p.y, 1)} u</b>` });
  countUp($("#hero-roi"), ch.roi_te * 100, (v) => (v > 0 ? "+" : "") + nf1.format(v) + " %");
  tickClock();
  $$("[data-open-stake]", el).forEach((r) => r.addEventListener("click", () => openStakeFor(r.dataset.openStake)));
  $$("[data-stake-tab]", el).forEach((a) => a.addEventListener("click", () => { S.ui.stakeTab = a.dataset.stakeTab; }));
};
function cdBig(ms) {
  const { d, h, m, s } = countdownParts(ms), p = (x) => String(x).padStart(2, "0");
  return `<div class="cd-unit"><b>${d}</b><span>jours</span></div><div class="cd-unit"><b>${p(h)}</b><span>heures</span></div><div class="cd-unit"><b>${p(m)}</b><span>min</span></div><div class="cd-unit"><b>${p(s)}</b><span>sec</span></div>`;
}
function countUp(el, target, fmt, ms = 1100) {
  if (!el) return;
  if (reduceMotion) { el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3; el.textContent = fmt(target * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function journalStats() {
  let profit = 0, turnover = 0, open = 0;
  for (const b of S.journal) {
    if (b.status === "open") { open++; continue; }
    if (b.status === "void") continue;
    turnover += b.stake;
    profit += b.status === "won" ? b.stake * (b.odds - 1) : -b.stake;
  }
  return { profit, turnover, open, roi: turnover ? profit / turnover : NaN };
}
function tickClock() {
  const now = new Date();
  const c = $("#clock");
  if (c) c.textContent = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const hd = $("#home-date");
  if (hd) hd.textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(now);
}
