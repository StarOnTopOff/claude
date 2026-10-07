/* ============================== Backtest ============================== */
function btDefaults() {
  return { sid: S.bt.champion, period: "all", from: "", to: "", staking: "kelly", kelly: 0.25, flat: 0.01, cap: 0.03, bankroll: S.settings.bankroll, page: 0 };
}
function periodRange(o) {
  const last = S.dataTo, first = Math.min(...S.bt.matches.day);
  const y = (yr, m = 0, d = 1) => dateToDay(new Date(yr, m, d));
  switch (o.period) {
    case "test": return [y(S.bt.splits.test[0], 6, 1), last];
    case "2025": return [y(2025), last];
    case "2026": return [y(2026), last];
    case "12m": return [last - 365, last];
    case "custom": {
      const a = o.from ? dateToDay(new Date(o.from + "T00:00")) : first, b = o.to ? dateToDay(new Date(o.to + "T00:00")) : last;
      return [Math.min(a, b), Math.max(a, b)];
    }
    default: return [first, last];
  }
}
function btStrategyList() {
  const b = S.bt, ids = [b.champion, ...b.top.filter((x) => x !== b.champion)];
  return [...new Set(ids)].filter((id) => b.bets[String(id)]);
}

RENDER.backtest = function () {
  const el = $("#view-backtest");
  if (!S.ui.bt) S.ui.bt = btDefaults();
  const o = S.ui.bt, s = strat(o.sid);
  const [from, to] = periodRange(o);
  const res = simulate(o.sid, Object.assign({}, o, { from, to }));
  const years = [...res.byYear.entries()].sort((a, b) => a[0] - b[0]);
  const ids = btStrategyList();
  const iso = (d) => dayToDate(d).toISOString().slice(0, 10);
  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Backtest · ${fmtDate(dayToDate(from))} → ${fmtDate(dayToDate(to))}</div><h1>Backtest</h1>
    <p>Rejoue la stratégie pari par pari sur la période de ton choix, avec ta bankroll et ta méthode de mise. Les cotes sont celles disponibles avant chaque match.</p></div>
  </div>
  <section class="glass panel">
    <div class="grid-3" style="align-items:end">
      <div class="field"><label for="bt-sid">Stratégie</label><select class="input" id="bt-sid">${ids.map((id) => { const x = strat(id); return `<option value="${id}" ${id === o.sid ? "selected" : ""}>${esc(stratName(id))} · ${esc(stratTitle(x))}</option>`; }).join("")}</select></div>
      <div class="field"><label for="bt-bank">Bankroll de départ (€)</label><input class="input num" id="bt-bank" inputmode="decimal" value="${o.bankroll}"></div>
      <div class="field"><span class="lbl">Méthode de mise</span><div class="seg">${[["kelly", "Kelly"], ["pct", "% bankroll"], ["flat", "Mise fixe"]].map(([k, l]) => `<button data-bt-st="${k}" aria-pressed="${o.staking === k}">${l}</button>`).join("")}</div></div>
    </div>
    <div class="row" style="margin-top:12px;gap:8px">
      <div class="seg" aria-label="Période">${[["all", "Tout (2005→)"], ["test", "Hors-échantillon"], ["2025", "2025 → auj."], ["2026", "2026 → auj."], ["12m", "12 mois"], ["custom", "Personnalisé"]].map(([k, l]) => `<button data-bt-p="${k}" aria-pressed="${o.period === k}">${l}</button>`).join("")}</div>
      ${o.period === "custom" ? `<input class="input" type="date" id="bt-from" style="width:auto" value="${o.from || iso(from)}"><span class="muted">→</span><input class="input" type="date" id="bt-to" style="width:auto" value="${o.to || iso(to)}">` : ""}
      ${o.staking === "kelly" ? `<div class="seg" aria-label="Fraction de Kelly">${[[0.125, "1/8"], [0.25, "1/4"], [0.5, "1/2"]].map(([k, l]) => `<button data-bt-k="${k}" aria-pressed="${o.kelly === k}">Kelly ${l}</button>`).join("")}</div>`
      : `<div class="seg" aria-label="Mise">${[[0.005, "0,5 %"], [0.01, "1 %"], [0.02, "2 %"]].map(([k, l]) => `<button data-bt-f="${k}" aria-pressed="${o.flat === k}">${l}</button>`).join("")}</div>`}
    </div>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0"><b class="ink2">Règle :</b> ${esc(stratRule(s))}${s.thr == null && o.staking === "kelly" ? " Pas d'estimation d'avantage pour ce système : mise en % de bankroll." : ""}</p>
  </section>

  <div class="kpis" style="margin-top:14px">
    <div class="kpi"><div class="k">Profit</div><div class="v ${cls(res.profit)}">${fmtEur(res.profit, 0, true)}</div></div>
    <div class="kpi"><div class="k">Bankroll finale</div><div class="v">${fmtEur(res.final ?? o.bankroll, 0)}</div></div>
    <div class="kpi"><div class="k">Rendement</div><div class="v ${cls(res.ret)}">${fmtPct(res.ret, 1)}</div></div>
    <div class="kpi"><div class="k">ROI / mise</div><div class="v ${cls(res.roi)}">${fmtPct(res.roi, 2)}</div></div>
    <div class="kpi"><div class="k">Paris</div><div class="v">${fmtN(res.n)}</div></div>
    <div class="kpi"><div class="k">Réussite</div><div class="v">${fmtPct(res.winrate, 1, false)}</div></div>
    <div class="kpi"><div class="k">Drawdown max</div><div class="v neg">${fmtPct(-res.mdd, 1, false)}</div></div>
    <div class="kpi"><div class="k">Régularité R²</div><div class="v">${Number.isFinite(res.r2) ? nf2.format(res.r2) : "–"}</div></div>
    <div class="kpi"><div class="k">Pire série</div><div class="v">${res.worstRun} perdus</div></div>
    ${Number.isFinite(res.cagr) ? `<div class="kpi"><div class="k">Croissance / an</div><div class="v ${cls(res.cagr)}">${fmtPct(res.cagr, 1)}</div></div>` : ""}
  </div>

  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Évolution de la bankroll</h2><span class="sub">${res.n ? `${fmtN(res.n)} paris · mise totale ${fmtEur(res.turnover, 0)}` : "Aucun pari sur cette période"}</span></div>
    <div id="bt-eq"></div>
    <div class="legend split-legend"><span><i class="tr"></i>Entraînement</span><span><i class="va"></i>Validation</span><span><i class="te"></i>Hors-échantillon (jamais vu pendant la sélection)</span></div>
  </section>

  <div class="grid-2" style="margin-top:14px">
    <section class="glass panel"><div class="panel-head"><h2>Profit par année</h2></div><div id="bt-years"></div></section>
    <section class="glass panel"><div class="panel-head"><h2>Mois par mois</h2><span class="sub">vert = gain, rouge = perte</span></div><div id="bt-heat"></div></section>
  </div>

  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Les paris</h2><span class="sub">du plus récent au plus ancien</span></div>
    <div id="bt-bets"></div>
  </section>`;

  // controls
  $("#bt-sid").onchange = (e) => { o.sid = +e.target.value; o.page = 0; RENDER.backtest(); };
  $("#bt-bank").onchange = (e) => { const v = pnum(e.target.value); if (v > 0) { o.bankroll = v; RENDER.backtest(); } };
  $$("[data-bt-st]", el).forEach((b) => b.onclick = () => { o.staking = b.dataset.btSt; RENDER.backtest(); });
  $$("[data-bt-p]", el).forEach((b) => b.onclick = () => { o.period = b.dataset.btP; o.page = 0; RENDER.backtest(); });
  $$("[data-bt-k]", el).forEach((b) => b.onclick = () => { o.kelly = +b.dataset.btK; RENDER.backtest(); });
  $$("[data-bt-f]", el).forEach((b) => b.onclick = () => { o.flat = +b.dataset.btF; RENDER.backtest(); });
  $("#bt-from")?.addEventListener("change", (e) => { o.from = e.target.value; RENDER.backtest(); });
  $("#bt-to")?.addEventListener("change", (e) => { o.to = e.target.value; RENDER.backtest(); });

  if (res.eq.length > 1) {
    new LineChart($("#bt-eq"), 280).set(res.eq.map((p) => ({ x: p.d, y: p.v })), {
      regions: SPLIT_REGIONS(), baseline: o.bankroll, yfmt: (v) => fmtN(v) + " €",
      tip: (p) => `${fmtDate(dayToDate(p.x))} · <b>${fmtEur(p.y, 0)}</b> <span class="${cls(p.y - o.bankroll)}">(${fmtPct(p.y / o.bankroll - 1, 1)})</span>`,
    });
  } else $("#bt-eq").innerHTML = `<div class="empty">Aucun pari ne correspond à cette période.</div>`;
  if (years.length) new BarChart($("#bt-years"), 200).set(years.map(([y, v]) => ({ label: String(y).slice(2), full: String(y), v })), { fmt: (v) => fmtEur(v, 0, true) });
  renderHeat($("#bt-heat"), res);
  renderBetTable($("#bt-bets"), res, o);
};

function renderHeat(host, res) {
  const months = [...res.byMonth.entries()];
  if (!months.length) { host.innerHTML = `<div class="empty">–</div>`; return; }
  const ys = [...new Set(months.map(([k]) => Math.floor(k / 12)))].sort((a, b) => b - a).slice(0, 12);
  const mx = Math.max(...months.map(([, v]) => Math.abs(v))) || 1;
  const cell = (v) => {
    if (v == null) return `<div style="background:rgba(255,255,255,.025)"></div>`;
    const a = 0.15 + 0.75 * Math.min(1, Math.abs(v) / mx);
    const bg = v >= 0 ? `rgba(61,220,151,${a})` : `rgba(255,95,122,${a})`;
    return `<div style="background:${bg};color:${a > .5 ? "#04121c" : "var(--ink-2)"}" title="${fmtEur(v, 0, true)}">${Math.abs(v) >= 1000 ? nf1.format(v / 1000) + "k" : nf0.format(v)}</div>`;
  };
  const M = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  host.innerHTML = `<div class="tbl-wrap"><div class="heat" style="grid-template-columns:38px repeat(12,minmax(26px,1fr));min-width:380px">
    <div></div>${M.map((m) => `<div class="hd">${m}</div>`).join("")}
    ${ys.map((y) => `<div class="hd">${y}</div>` + M.map((_, m) => cell(res.byMonth.get(y * 12 + m))).join("")).join("")}
  </div></div>${ys.length < new Set(months.map(([k]) => Math.floor(k / 12))).size ? `<p class="muted" style="font-size:12px;margin:8px 0 0">12 dernières années affichées.</p>` : ""}`;
}

function renderBetTable(host, res, o) {
  const B = S.bt.bets[String(o.sid)], M = S.bt.matches, per = 40;
  const rows = res.rows.slice().reverse();
  const pages = Math.max(1, Math.ceil(rows.length / per));
  o.page = clamp(o.page, 0, pages - 1);
  const slice = rows.slice(o.page * per, o.page * per + per);
  const lgName = (i) => S.bt.leagues[M.lg[i]][1];
  const T = S.bt.teams;
  host.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Match</th><th>Pari</th><th class="n">Cote</th><th class="n">Proba</th><th class="n">Score</th><th class="n">Mise</th><th class="n">Gain</th></tr></thead><tbody>
    ${slice.map((r) => {
      const q = r.q, mi = B.m[q], sel = B.s[q];
      const selTxt = sel === "H" ? T[M.h[mi]] : sel === "A" ? T[M.a[mi]] : sel === "D" ? "Nul" : sel === "O" ? "+2,5 buts" : "−2,5 buts";
      return `<tr><td class="mono" style="white-space:nowrap">${fmtDate(dayToDate(r.d), { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
      <td><span style="white-space:nowrap">${esc(T[M.h[mi]])} – ${esc(T[M.a[mi]])}</span><br><span class="muted" style="font-size:11px">${esc(lgName(mi))}</span></td>
      <td>${esc(selTxt)}</td><td class="n">${fmtOdds(B.o[q] / 100)}</td><td class="n">${fmtPct(B.p[q] / 1e4, 0, false)}</td>
      <td class="n">${M.hg[mi]}–${M.ag[mi]}</td><td class="n">${fmtEur(r.st, 2)}</td><td class="n ${cls(r.pl)}">${fmtEur(r.pl, 2, true)}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="pager"><span>Page ${o.page + 1} / ${pages}</span><button class="btn small ghost" id="pg-prev" ${o.page === 0 ? "disabled" : ""}>Précédent</button><button class="btn small ghost" id="pg-next" ${o.page >= pages - 1 ? "disabled" : ""}>Suivant</button></div>`
    : `<div class="empty">Aucun pari.</div>`;
  $("#pg-prev")?.addEventListener("click", () => { o.page--; renderBetTable(host, res, o); });
  $("#pg-next")?.addEventListener("click", () => { o.page++; renderBetTable(host, res, o); });
}
