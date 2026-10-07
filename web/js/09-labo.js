/* ============================== Labo ============================== */
RENDER.labo = function () {
  const el = $("#view-labo"), b = S.bt, c = b.strategies, L = S.ui.labo;
  const n = c.id.length;
  const elig = [];
  for (let i = 0; i < n; i++) if (c.score[i] > 0) elig.push(i);
  const eligTestPos = elig.filter((i) => c.roi_te[i] > 0 && c.n_te[i] >= 30).length;
  const eligTestN = elig.filter((i) => c.n_te[i] >= 30).length;
  const single = elig.filter((i) => b.vocab.exec[c.exec[i]] === "b365");
  const ch = strat(b.champion), tr = strat(b.trap), sg = strat(b.champion_single);
  // how often a great first period survives: top 5 % by training ROI (>= 300 bets) vs later ROI
  const ranked = [];
  for (let i = 0; i < n; i++) if (c.n_tr[i] >= 300 && c.n_te[i] >= 50 && c.roi_te[i] != null) ranked.push(i);
  ranked.sort((x, y) => c.roi_tr[y] - c.roi_tr[x]);
  const topTrain = ranked.slice(0, Math.max(1, Math.round(ranked.length * 0.05)));
  const topTrainPos = topTrain.filter((i) => c.roi_te[i] > 0).length;
  const topTrainMed = topTrain.map((i) => c.roi_te[i]).sort((a, z) => a - z)[Math.floor(topTrain.length / 2)];
  const sp = b.splits;
  const per = (s) => [["Entraînement", s.n_tr, s.roi_tr], ["Validation", s.n_va, s.roi_va], ["Hors-échantillon", s.n_te, s.roi_te]];
  const card = (title, s, tone) => `<div class="glass-soft" style="padding:14px;min-width:0">
      <div class="row" style="justify-content:space-between"><b>${esc(title)}</b><span class="tag ${tone}">${esc(stratName(s.id))}</span></div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 10px">${esc(stratRule(s))}</p>
      ${per(s).map(([l, nn, r]) => `<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid rgba(150,190,255,.07)"><span class="ink2">${l}</span><span class="num"><span class="muted">${fmtN(nn)} paris</span> · <b class="${cls(r)}">${fmtPct(r, 1)}</b></span></div>`).join("")}
    </div>`;

  el.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">Labo de stratégies</div><h1>${fmtN(b.n_tested)} stratégies, une seule retenue.</h1>
    <p>Chaque stratégie combine une source de probabilité, un prix d'exécution, un marché, un seuil d'avantage, une plage de cotes et un groupe de championnats. Toutes sont jouées à mise fixe sur ${fmtN(b.n_matches)} matchs de ${b.data_from.slice(0, 4)} à ${b.data_to.slice(0, 4)}.</p></div></div>

  <div class="kpis" style="margin-top:0">
    <div class="kpi"><div class="k">Testées</div><div class="v">${fmtN(b.n_tested)}</div></div>
    <div class="kpi"><div class="k">Rentables ${sp.train[0]}–${sp.train[1] + 1} ET ${sp.val[0]}–${sp.val[1] + 1}</div><div class="v">${fmtN(b.n_profitable_tv)}</div></div>
    <div class="kpi"><div class="k">…encore rentables après ${sp.test[0]}</div><div class="v">${fmtN(eligTestPos)} / ${fmtN(eligTestN)}</div></div>
    <div class="kpi"><div class="k">dont 1 seul bookmaker</div><div class="v">${fmtN(single.length)}</div></div>
  </div>

  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Avant / après : le test du sur-apprentissage</h2><span class="sub">1 point = 1 stratégie (≥ 100 paris)</span></div>
    <div id="lab-scatter"></div>
    <div class="legend"><span><i style="background:#2f7bff"></i>Meilleure cote du marché</span><span><i style="background:#8adcff"></i>Un seul bookmaker</span><span><i style="background:#3ddc97"></i>Championne</span><span><i style="background:#ff5f7a"></i>Choix naïf</span></div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">Horizontal : ROI sur ${sp.train[0]}–${sp.train[1] + 1}. Vertical : ROI sur ${sp.test[0]}→${b.data_to.slice(0, 4)}, saisons jamais vues pendant la sélection. Parmi les 5 % de stratégies les plus rentables en entraînement (${fmtN(topTrain.length)}), seulement ${fmtN(topTrainPos)} restent gagnantes ensuite, avec un ROI médian de ${fmtPct(topTrainMed, 1)} hors-échantillon. Le choix naïf passe de ${fmtPct(tr.roi_tr, 0)} à ${fmtPct(tr.roi_te, 0)}. La championne n'est pas la plus spectaculaire : elle est choisie pour sa régularité sur deux périodes, et elle tient sur la troisième.</p>
  </section>

  <div class="grid-3" style="margin-top:14px">
    ${card("La championne", ch, "pick")}
    ${card("Le piège : meilleure sur 2005-2014", tr, "live")}
    ${sg ? card("Meilleure chez un seul bookmaker", sg, "info") : ""}
  </div>

  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Classement des stratégies robustes</h2>
      <div class="row" style="gap:8px">
        <div class="seg">${[["score", "Robustesse"], ["roi_te", "ROI hors-éch."], ["n", "Volume"]].map(([k, l]) => `<button data-lab-sort="${k}" aria-pressed="${L.sort === k}">${l}</button>`).join("")}</div>
        <div class="seg"><button data-lab-single aria-pressed="${L.single}">1 seul bookmaker</button></div>
      </div></div>
    <div id="lab-table"></div>
  </section>

  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Méthode</h2></div>
    <div class="grid-2" style="font-size:13.5px;color:var(--ink-2)">
      <div><b class="ink2" style="color:var(--ink)">Trois périodes séparées.</b> Entraînement ${sp.train[0]}–${sp.train[1] + 1}, validation ${sp.val[0]}–${sp.val[1] + 1}, test ${sp.test[0]}→${b.data_to.slice(0, 4)}. La championne doit être rentable sur les deux premières, assez active (≥ 300 et ≥ 200 paris, et encore ≥ 30 paris lors de la dernière saison de validation), puis elle est classée par t-stat minimale × régularité R². Le test ne sert qu'à mesurer.</div>
      <div><b style="color:var(--ink)">Aucune information du futur.</b> Les cotes Bet365 et les meilleures cotes sont relevées avant le match. Le modèle Elo est réentraîné chaque saison sur les 10 saisons précédentes uniquement. La probabilité « marché » retire la marge par la méthode de la puissance, qui corrige le biais favori/outsider.</div>
      <div><b style="color:var(--ink)">Ce qui marche :</b> prendre la meilleure cote du marché quand elle dépasse le prix juste estimé chez Bet365, sur les petites cotes (≤ 1,60). L'avantage est mince (≈ 2 à 3 % par pari) mais stable : c'est le profil le plus régulier des ${fmtN(b.n_tested)}.</div>
      <div><b style="color:var(--ink)">Ce qui ne marche pas :</b> parier chez un seul bookmaker sur la base de ses propres cotes ou d'un modèle Elo. ${(() => { const neg = single.filter((i) => c.roi_te[i] < 0).length; return neg === single.length ? `Les ${fmtN(single.length)} stratégies de ce type qui passaient entraînement et validation finissent toutes négatives après ${sp.test[0]}.` : `${fmtN(neg)} des ${fmtN(single.length)} stratégies de ce type qui passaient entraînement et validation finissent négatives après ${sp.test[0]}.`; })()} Pour Stake, la règle est donc : ne miser que si Stake paie plus que le prix juste d'un autre bookmaker.</div>
    </div>
  </section>`;

  $$("[data-lab-sort]", el).forEach((x) => x.onclick = () => { L.sort = x.dataset.labSort; L.page = 0; RENDER.labo(); });
  $("[data-lab-single]", el).onclick = () => { L.single = !L.single; L.page = 0; RENDER.labo(); };

  // scatter
  const pts = [];
  for (let i = 0; i < n; i++) {
    if (c.n_tr[i] < 100 || c.n_te[i] < 50 || c.roi_tr[i] == null || c.roi_te[i] == null) continue;
    const single1 = b.vocab.exec[c.exec[i]] === "b365";
    pts.push({ x: clamp(c.roi_tr[i], -0.4, 0.4), y: clamp(c.roi_te[i], -0.4, 0.4), c: single1 ? "rgba(138,220,255,.32)" : "rgba(60,130,255,.42)", id: c.id[i] });
  }
  for (const [id, col, lab] of [[b.trap, "#ff5f7a", "Naïf"], [b.champion, "#3ddc97", "Championne"]]) {
    const s = strat(id);
    pts.push({ x: clamp(s.roi_tr, -0.4, 0.4), y: clamp(s.roi_te, -0.4, 0.4), c: col, hl: lab, id });
  }
  const sc = new ScatterChart($("#lab-scatter"), 320);
  const ticks = [-0.4, -0.2, 0, 0.2, 0.4];
  sc.set(pts, {
    x0: -0.42, x1: 0.42, y0: -0.42, y1: 0.42, xt: ticks, yt: ticks, fmt: (v) => (v > 0 ? "+" : "") + nf0.format(v * 100) + "%",
    xl: `ROI ${sp.train[0]}–${sp.train[1] + 1} →`, yl: `ROI ${sp.test[0]}→ ↑`,
    tip: (p) => { const s = strat(p.id); return `<b>${esc(stratTitle(s))}</b><br>${esc(S.bt.labels.group[s.group])} · ${s.exec === "max" ? "meilleure cote" : "1 bookmaker"}<br>avant ${fmtPct(s.roi_tr, 1)} → après <b class="${cls(s.roi_te)}">${fmtPct(s.roi_te, 1)}</b>`; },
  });
  sc.onClick = (e) => { const i = sc.nearest(e); if (i >= 0) openStrategy(pts[i].id); };
  renderLabTable();
};
function openStrategy(id) {
  if (S.bt.bets[String(id)]) { S.ui.bt = Object.assign(S.ui.bt || btDefaults(), { sid: id, page: 0 }); go("backtest"); }
  else { const s = strat(id); toast(stratTitle(s), `${fmtN(s.n)} paris · ROI ${fmtPct(s.roi, 1)} · hors-échantillon ${fmtPct(s.roi_te, 1)}. Détail pari par pari disponible pour les stratégies phares.`, "i-flask", 6000); }
}
function renderLabTable() {
  const b = S.bt, c = b.strategies, L = S.ui.labo, host = $("#lab-table");
  let idx = [];
  for (let i = 0; i < c.id.length; i++) if (c.score[i] > 0 && (!L.single || b.vocab.exec[c.exec[i]] === "b365")) idx.push(i);
  const key = L.sort;
  idx.sort((x, y) => (c[key][y] ?? -9) - (c[key][x] ?? -9));
  const seen = new Set();  // drop strategies that place exactly the same bets as a better-ranked one
  idx = idx.filter((i) => { const sig = c.n[i] + "|" + c.profit[i]; if (seen.has(sig)) return false; seen.add(sig); return true; });
  const per = 20, pages = Math.max(1, Math.ceil(idx.length / per));
  L.page = clamp(L.page, 0, pages - 1);
  const rows = idx.slice(L.page * per, L.page * per + per);
  host.innerHTML = idx.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Stratégie</th><th class="n">Paris</th><th class="n">ROI entr.</th><th class="n">ROI valid.</th><th class="n">ROI hors-éch.</th><th class="n">R²</th><th class="n">Score</th></tr></thead><tbody>
    ${rows.map((i, j) => { const s = strat(c.id[i]); return `<tr class="click ${s.id === b.champion ? "hl" : ""}" data-sid="${s.id}"><td class="mono muted">${L.page * per + j + 1}</td>
      <td><b style="font-weight:600">${esc(stratTitle(s))}</b>${s.id === b.champion ? ` <span class="tag pick">Championne</span>` : ""}${s.hasBets ? "" : ""}<br><span class="muted" style="font-size:11.5px">${esc(b.labels.group[s.group])} · ${s.thr == null ? "sans seuil" : "value > " + nf0.format(s.thr * 100) + " %"} · ${s.exec === "max" ? "meilleure cote" : "1 bookmaker"}${s.fair !== "none" ? " · " + esc(FAIR_SHORT[s.fair]) : ""}</span></td>
      <td class="n">${fmtN(s.n)}</td><td class="n ${cls(s.roi_tr)}">${fmtPct(s.roi_tr, 1)}</td><td class="n ${cls(s.roi_va)}">${fmtPct(s.roi_va, 1)}</td><td class="n ${cls(s.roi_te)}">${s.n_te ? fmtPct(s.roi_te, 1) : "–"}</td><td class="n">${nf2.format(s.r2)}</td><td class="n">${nf2.format(s.score)}</td></tr>`; }).join("")}
    </tbody></table></div><div class="pager"><span>${fmtN(idx.length)} stratégies · page ${L.page + 1}/${pages}</span><button class="btn small ghost" id="lab-prev" ${L.page ? "" : "disabled"}>Précédent</button><button class="btn small ghost" id="lab-next" ${L.page < pages - 1 ? "" : "disabled"}>Suivant</button></div>`
    : `<div class="empty">Aucune stratégie chez un seul bookmaker n'a été rentable à la fois en entraînement et en validation avec assez de paris.</div>`;
  $$("tr[data-sid]", host).forEach((tr) => tr.onclick = () => openStrategy(+tr.dataset.sid));
  $("#lab-prev")?.addEventListener("click", () => { L.page--; renderLabTable(); });
  $("#lab-next")?.addEventListener("click", () => { L.page++; renderLabTable(); });
}
