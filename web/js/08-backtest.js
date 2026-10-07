/* ============================== Backtest ============================== */
function btState() {
  if (!S.ui.bt) S.ui.bt = { period: "test", from: "", to: "", f: null, bank: null, page: 0, log: false };
  return S.ui.bt;
}
function btRange(o) {
  const last = S.dataTo, y = (yr, m = 0, d = 1) => dateToDay(new Date(yr, m, d));
  switch (o.period) {
    case "test": return [S.data.bt.periods.test[0], last];
    case "2025": return [y(2025), last];
    case "2026": return [y(2026), last];
    case "12m": return [last - 365, last];
    case "all": return [S.data.bt.periods.sel[0], last];
    case "custom": {
      const a = o.from ? dateToDay(new Date(o.from + "T00:00")) : S.data.bt.periods.test[0], b = o.to ? dateToDay(new Date(o.to + "T00:00")) : last;
      return [Math.min(a, b), Math.max(a, b)];
    }
  }
  return [S.data.bt.periods.test[0], last];
}
const PERIODS_UI = [["test", "Since Jul 2020"], ["2025", "2025 → today"], ["2026", "2026 → today"], ["12m", "Last 12 months"], ["all", "Since 2006"], ["custom", "Custom"]];

RENDER.backtest = function () {
  const el = $("#view-backtest"), o = btState();
  const f = o.f ?? riskF(), bank0 = o.bank ?? S.settings.bankroll;
  const [from, to] = btRange(o);
  const res = simulate({ from, to, f, bank0 });
  const series = res.eq.map((p) => ({ t: dayToDate(p.d).getTime(), v: p.v }));
  const years = [];
  { let prev = bank0, curY = null, last = bank0;
    for (const p of res.eq) { const yy = dayToDate(p.d).getUTCFullYear(); if (curY !== null && yy !== curY) { years.push([curY, last / prev - 1]); prev = last; } curY = yy; last = p.v; }
    if (curY !== null) years.push([curY, last / prev - 1]); }
  const months = [...res.byMonth.entries()];
  const bestM = months.reduce((a, b) => (b[1] > (a?.[1] ?? -Infinity) ? b : a), null), worstM = months.reduce((a, b) => (b[1] < (a?.[1] ?? Infinity) ? b : a), null);
  const mName = (k) => k == null ? "–" : `${MON[k % 12]} ${Math.floor(k / 12)}`;
  const iso = (d) => dayToDate(d).toISOString().slice(0, 10);
  const testStartDay = S.data.bt.periods.test[0];
  const st = S.data.bt.stats, flat = S.data.bt.flat;
  const profile = RISK_PROFILES.find((r) => r.f === f);
  el.innerHTML = `
  <header class="page-head" data-enter style="--i:0">
    <div class="eyebrow">Backtest · ${esc(fmtDate(dayToDate(from)))} → ${esc(fmtDate(dayToDate(to)))}</div>
    <h1>What the method would have made</h1>
    <p>Every bet the method would have placed, replayed with your starting bankroll and risk level. Odds are the ones published before each match.</p>
  </header>

  <section class="bt-controls glass" data-enter style="--i:1">
    <div class="scroll-x"><div class="segx">${PERIODS_UI.map(([k, l]) => `<button data-p="${k}" aria-pressed="${o.period === k}">${l}</button>`).join("")}</div></div>
    ${o.period === "custom" ? `<div class="row"><input class="input" type="date" id="bt-from" style="width:auto" value="${o.from || iso(from)}" aria-label="From"><span class="muted">→</span><input class="input" type="date" id="bt-to" style="width:auto" value="${o.to || iso(to)}" aria-label="To"></div>` : ""}
    <div class="grid">
      <div class="field"><span class="lbl">Risk level</span><div class="segx">${RISK_PROFILES.map((r) => `<button data-f="${r.f}" aria-pressed="${f === r.f}">${r.name}</button>`).join("")}</div></div>
      <div class="field"><label for="bt-bank">Starting bankroll (${CUR()})</label><input class="input num" id="bt-bank" inputmode="decimal" value="${bank0}"></div>
    </div>
    <p class="muted small">${esc(profile?.note || "")}. ${o.period === "all" ? "Includes 2006-2020, the period used to choose the method: treat those years as in-sample." : o.period === "test" ? "Out of sample: none of these bets was seen while the method was designed." : ""}</p>
  </section>

  <section class="bt-hero glass lens" data-enter style="--i:2">
    <div class="hero-label eyebrow" id="bt-label">Bankroll</div>
    <div class="hero-info">
      <div class="hero-num"><span class="cur">${CUR()}</span><span id="bt-bankv">${nf0.format(res.final)}</span></div>
      <div class="hero-delta"><span class="pill-up ${res.ret < 0 ? "down" : ""}" id="bt-pill"><svg class="i"><use href="#i-up"/></svg><span id="bt-pct">${fmtPct(res.ret, 0)}</span></span><span>from <b>${fmtMoney(bank0)}</b> · ${fmtN(res.n)} bets</span></div>
    </div>
    <div class="chart" id="bt-chart"></div>
    <div class="hero-stats">
      <div class="stat"><span class="k">Per year</span><span class="v">${fmtPct(res.cagr, 0)}<small>/yr</small></span><span class="bar"><i style="width:${clamp((res.cagr || 0) / 1.2, 0.03, 1) * 100}%"></i></span></div>
      <div class="stat"><span class="k">Max drawdown</span><span class="v neg">${fmtPct(-res.mdd, 0)}</span><span class="bar neg"><i style="width:${clamp(res.mdd, 0.03, 1) * 100}%"></i></span></div>
      <div class="stat"><span class="k">Bets won</span><span class="v">${fmtPct(res.winrate, 0, false)}</span><span class="bar"><i style="width:${clamp(res.winrate || 0, 0.03, 1) * 100}%"></i></span></div>
    </div>
  </section>

  <div class="kgrid" data-enter style="--i:3">
    <div class="kt"><div class="k">Profit</div><div class="v ${cls(res.profit)}">${fmtMoney(res.profit, 0, true)}</div></div>
    <div class="kt"><div class="k">Return on stakes</div><div class="v ${cls(res.roi)}">${fmtPct(res.roi, 2)}</div></div>
    <div class="kt"><div class="k">Bets</div><div class="v">${fmtN(res.n)}</div></div>
    <div class="kt"><div class="k">Betting days</div><div class="v">${fmtN(res.days)}</div></div>
    <div class="kt"><div class="k">Worst losing run</div><div class="v">${res.worstRun} bets</div></div>
    <div class="kt"><div class="k">Best month</div><div class="v pos">${bestM ? fmtMoney(bestM[1], 0, true) : "–"}</div><div class="muted small" style="margin-top:4px">${mName(bestM?.[0])}</div></div>
    <div class="kt"><div class="k">Worst month</div><div class="v neg">${worstM ? fmtMoney(worstM[1], 0, true) : "–"}</div><div class="muted small" style="margin-top:4px">${mName(worstM?.[0])}</div></div>
    <div class="kt"><div class="k">Peak bankroll</div><div class="v">${fmtMoney(res.peak)}</div></div>
  </div>

  <div class="two-col">
    <section class="panel glass" data-enter style="--i:4"><div class="panel-head"><span class="panel-title">Return by year</span><span class="meta">bankroll change</span></div><div id="bt-years"></div></section>
    <section class="panel glass" data-enter style="--i:5"><div class="panel-head"><span class="panel-title">Month by month</span><span class="meta">profit in ${CUR()}</span></div><div id="bt-heat" class="tbl-wrap"></div></section>
  </div>

  <section class="panel glass" data-enter style="--i:6">
    <div class="panel-head"><span class="panel-title">Is it real?</span><span class="meta">read this before betting</span></div>
    <ul class="note-list">
      <li><span><b>Chosen blind.</b> The method and its settings were picked using 2006-2020 only, among 4 research tracks and thousands of variants. July 2020 → today was kept aside and used once, to measure it: ${fmtN(st.test[fkey(M().kelly_f)].n)} bets, ${fmtPct(flat.test.roi, 1)} profit per bet.</span></li>
      <li><span><b>Thin edge, big compounding.</b> Each bet wins ${fmtPct(flat.test.roi, 1)} on average. The large totals come from Kelly staking reinvesting every win. Higher risk levels grow faster and fall harder: at Full Kelly the worst drop since 2020 was ${fmtPct(-st.test["1.0"].maxdd, 0)}.</span></li>
      <li><span><b>It needs good prices.</b> The backtest assumes you got the best price among ~17 bookmakers before kick-off. On Stake, bet only when its price is at least the min odds shown. A price 1–2% worse than the best cuts the results a lot.</span></li>
      <li><span><b>Luck matters.</b> Independent audits found no data leak, but a few seasons and a few big wins carry a large share of the profit, and some years lose${(() => { const l = Object.entries(st.test[fkey(f)].years).filter(([, v]) => v < 0).map(([y]) => y); return l.length ? ` (${l.join(", ")} did)` : ""; })()}. Expect long flat or losing stretches.</span></li>
      <li><span><b>Real-world limits.</b> Bookmakers often cap or close winning accounts, and stakes can't grow forever. Treat the totals as an upper scenario, not a promise.</span></li>
    </ul>
    <div class="tbl-wrap" style="margin-top:16px"><table class="otbl"><thead><tr><th>Risk level · since Jul 2020</th><th>${fmtMoney(1000)} became</th><th>Per year</th><th>Worst drop</th></tr></thead><tbody>
      ${RISK_PROFILES.map((r) => { const t = st.test[fkey(r.f)]; return `<tr class="${r.f === f ? "hit" : ""}"><td>${r.name} (Kelly × ${r.f})</td><td>${fmtMoney(t.final)}</td><td>${fmtPct(t.cagr, 0)}</td><td>${fmtPct(-t.maxdd, 0)}</td></tr>`; }).join("")}
    </tbody></table></div>
  </section>

  <section class="panel glass" data-enter style="--i:7">
    <div class="panel-head"><span class="panel-title">Every bet</span><span class="meta">newest first</span></div>
    <div id="bt-bets"></div>
  </section>`;

  // controls
  $$("[data-p]", el).forEach((b) => b.onclick = () => { o.period = b.dataset.p; o.page = 0; RENDER.backtest(); });
  $$("[data-f]", el).forEach((b) => b.onclick = () => { o.f = +b.dataset.f; RENDER.backtest(); });
  $("#bt-bank").onchange = (e) => { const v = pnum(e.target.value); if (v > 0) { o.bank = v; RENDER.backtest(); } };
  $("#bt-from")?.addEventListener("change", (e) => { o.from = e.target.value; RENDER.backtest(); });
  $("#bt-to")?.addEventListener("change", (e) => { o.to = e.target.value; RENDER.backtest(); });
  // chart
  const setHead = (v, label) => {
    $("#bt-bankv").textContent = nf0.format(v);
    const pct = v / bank0 - 1;
    $("#bt-pct").textContent = fmtPct(pct, 0); $("#bt-pill").classList.toggle("down", pct < 0);
    if (label !== undefined) $("#bt-label").textContent = label;
  };
  const chart = new EquityChart($("#bt-chart"), {
    label: "Backtest bankroll",
    regions: o.period === "all" ? [{ from: dayToDate(testStartDay).getTime(), to: dayToDate(to).getTime() + DAY, fill: "rgba(98,230,255,.06)", label: "OUT OF SAMPLE", ink: "rgba(140,240,255,.7)" }] : [],
    onProgress: (v) => setHead(v),
    onScrub: (pt) => pt ? setHead(pt.v, fmtDate(pt.t, { month: "short", day: "numeric", year: "numeric" })) : setHead(res.final, "Bankroll"),
  });
  chart.host.insertAdjacentHTML("beforeend", `<div class="segx lin-log"><button data-scale="lin" aria-pressed="${!o.log}">LIN</button><button data-scale="log" aria-pressed="${o.log}">LOG</button></div>`);
  chart.host.querySelector(".lin-log").addEventListener("pointerdown", (e) => e.stopPropagation());
  $$("[data-scale]", el).forEach((b) => b.onclick = (e) => { e.stopPropagation(); o.log = b.dataset.scale === "log"; $$("[data-scale]", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); chart.set(series, { log: o.log, zero: !o.log, animate: "switch" }); });
  chart.set(series, { log: o.log, zero: !o.log, animate: "first" });
  if (years.length) yearBars($("#bt-years"), years); else $("#bt-years").innerHTML = `<div class="empty">No bets in this period.</div>`;
  renderHeat($("#bt-heat"), res);
  renderBetTable($("#bt-bets"), res, o);
};

function renderHeat(host, res) {
  const months = [...res.byMonth.entries()];
  if (!months.length) { host.innerHTML = `<div class="empty">–</div>`; return; }
  const ys = [...new Set(months.map(([k]) => Math.floor(k / 12)))].sort((a, b) => b - a).slice(0, 12);
  const mx = Math.max(...months.map(([, v]) => Math.abs(v))) || 1;
  const short = (v) => { const a = Math.abs(v); return (v < 0 ? "−" : "") + (a >= 1e6 ? nf1.format(a / 1e6) + "M" : a >= 1e3 ? nf0.format(a / 1e3) + "k" : nf0.format(a)); };
  const cell = (v) => {
    if (v == null) return `<div style="background:rgba(255,255,255,.025)"></div>`;
    const a = 0.12 + 0.78 * Math.sqrt(Math.min(1, Math.abs(v) / mx));
    const bg = v >= 0 ? `rgba(98,230,255,${a * 0.75})` : `rgba(255,93,115,${a * 0.85})`;
    return `<div style="background:${bg};color:${a > 0.55 ? "#02101c" : "var(--ink-2)"}" title="${fmtMoney(v, 0, true)}">${short(v)}</div>`;
  };
  const L = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  host.innerHTML = `<div class="heat" style="grid-template-columns:40px repeat(12,minmax(24px,1fr))"><div></div>${L.map((m) => `<div class="hd">${m}</div>`).join("")}
    ${ys.map((y) => `<div class="hd">${y}</div>` + L.map((_, m) => cell(res.byMonth.get(y * 12 + m))).join("")).join("")}</div>`;
}

function renderBetTable(host, res, o) {
  const B = S.data.bt.bets, Mt = S.data.bt.matches, T = S.data.bt.teams, per = 30;
  const rows = res.rows.slice().reverse(), pages = Math.max(1, Math.ceil(rows.length / per));
  o.page = clamp(o.page, 0, pages - 1);
  const slice = rows.slice(o.page * per, o.page * per + per);
  host.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="jtbl"><thead><tr><th>Date</th><th>Bet</th><th class="n">Odds</th><th class="n">Prob.</th><th class="n">Score</th><th class="n">Stake</th><th class="n">Result</th></tr></thead><tbody>
    ${slice.map((r) => {
      const q = r.q, m = B.m[q], s = B.s[q], h = T[Mt.h[m]], a = T[Mt.a[m]];
      const lab = s === "H" ? `${h} to win` : s === "A" ? `${a} to win` : s === "D" ? "Draw" : s === "O" ? "Over 2.5" : "Under 2.5";
      return `<tr><td class="mono muted" style="white-space:nowrap">${fmtDate(dayToDate(B.d[q]), { month: "short", day: "numeric", year: "2-digit" })}</td>
        <td><b style="font-weight:500">${esc(lab)}</b><br><span class="muted small">${esc(h)} v ${esc(a)} · ${esc(S.data.bt.leagues[Mt.lg[m]][1])}</span></td>
        <td class="n">${fmtOdds(B.o[q] / 100)}</td><td class="n">${fmtPct(B.p[q] / 1e4, 0, false)}</td><td class="n">${Mt.hg[m]}–${Mt.ag[m]}</td>
        <td class="n">${fmtMoney(r.st, r.st < 100 ? 2 : 0)}</td><td class="n ${cls(r.pl)}">${fmtMoney(r.pl, r.st < 100 ? 2 : 0, true)}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="pager"><span>Page ${o.page + 1} of ${pages}</span><button class="btn small" id="pg-prev" ${o.page ? "" : "disabled"}>Previous</button><button class="btn small" id="pg-next" ${o.page < pages - 1 ? "" : "disabled"}>Next</button></div>`
    : `<div class="empty">No bets in this period.</div>`;
  $("#pg-prev")?.addEventListener("click", () => { o.page--; renderBetTable(host, res, o); });
  $("#pg-next")?.addEventListener("click", () => { o.page++; renderBetTable(host, res, o); });
}
