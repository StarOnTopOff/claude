/* ============================== Home ============================== */
S.ui.home = { range: "all", log: false };
const testStart = () => S.data.bt.periods.test[0];

function equitySeries(from, to, f = riskF(), bank0 = S.settings.bankroll) {
  const res = simulate({ from, to, f, bank0 });
  return { res, series: res.eq.map((p) => ({ t: dayToDate(p.d).getTime(), v: p.v })) };
}
function marketProb(f, sel) {
  if ("HDA".includes(sel) && validOdds(f.b365)) return novigPower(f.b365)["HDA".indexOf(sel)];
  if ("OU".includes(sel) && validOdds(f.ou)) return novigPower(f.ou)["OU".indexOf(sel)];
  return NaN;
}
function callHtml(f, sel) {
  if (sel === "H" || sel === "A") { const t = teamLabel(sel === "H" ? f.h : f.a); return `${esc(t)} <em>to win</em>`; }
  if (sel === "D") return `Draw`;
  return `${sel === "O" ? "Over" : "Under"} 2.5 <em>goals</em>`;
}
function pickCard(p, i, stake, bank) {
  const f = p.f, mk = marketProb(f, p.sel), pm = p.p * 100, pi = Number.isFinite(mk) ? mk * 100 : pm;
  const logged = S.journal.some((b) => b.key === f.key && b.sel === p.sel);
  return `
  <article class="pick glass lens" data-enter style="--i:${3 + i}" aria-label="Pick ${i + 1}: ${esc(selText(f, p.sel))}">
    <header class="pick-head">
      <span class="league"><span class="idx">0${i + 1}</span><span class="sep"></span>${esc(leagueName(f.lg))}</span>
      <span class="ko"><span class="t">${esc(fmtWhen(f.t))}</span><span class="cd ${f.t - Date.now() < 36e5 ? "soon" : ""}" data-cd="${f.t}" data-cdc="1">${countdownShort(f.t - Date.now(), true)}</span></span>
    </header>
    <div class="vs"><span class="crests">${crest(f.h)}${crest(f.a)}</span><span>${esc(teamLabel(f.h))} <span class="v">v</span> ${esc(teamLabel(f.a))}</span></div>
    <div class="call">
      <div>
        <span class="eyebrow">The pick</span>
        <h3>${callHtml(f, p.sel)}</h3>
        <p>Model <b>${nf1.format(pm)}%</b>${Number.isFinite(mk) ? ` · market ${nf1.format(pi)}%` : ""}</p>
      </div>
      <div class="ring" role="img" aria-label="Model probability ${nf0.format(pm)}%">
        <svg viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="27"/>
          <circle class="mkt" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${Math.min(pi, pm).toFixed(1)} 100"/>
          <circle class="edge" cx="32" cy="32" r="27" pathLength="100" stroke-dasharray="${Math.max(0.6, pm - pi).toFixed(1)} 100" stroke-dashoffset="${-Math.min(pi, pm)}"/></svg>
        <span class="rv"><span>${nf0.format(pm)}%<small>${p.sel === "O" || p.sel === "U" ? "HIT" : p.sel === "D" ? "DRAW" : "WIN"}</small></span></span>
      </div>
    </div>
    <dl class="nums">
      <div><dt>Min odds on Stake</dt><dd>${fmtOdds(minOdds(p.p))}</dd><span class="sub">fair ${fmtOdds(1 / p.p)}</span></div>
      <div><dt>Edge</dt><dd class="pos">${fmtPct(p.edge, 1)}</dd><span class="sub">at ${fmtOdds(p.odds)}</span></div>
      <div><dt>Stake</dt><dd>${fmtMoney(stake)}</dd><span class="sub">${fmtPct(stake / bank, 1, false)} of bankroll</span></div>
    </dl>
    <div class="actions">
      <button class="btn-sq glass clear" data-check="${esc(f.key)}|${p.sel}" aria-label="Check the Stake price"><svg class="i"><use href="#i-ext"/></svg></button>
      <button class="btn-main ${logged ? "done" : ""}" data-place="${i}">${logged ? `<svg class="i"><use href="#i-check"/></svg><span>Logged · ${fmtMoney(stake)}</span>` : "<span>I placed it</span>"}</button>
    </div>
  </article>`;
}
function recentPicks(n = 6) {
  const B = S.data.bt.bets, Mt = S.data.bt.matches, T = S.data.bt.teams, out = [];
  for (let i = B.d.length - 1; i >= 0 && out.length < n; i--) {
    const m = B.m[i], s = B.s[i], h = T[Mt.h[m]], a = T[Mt.a[m]];
    const lab = s === "H" ? `${h} to win` : s === "A" ? `${a} to win` : s === "D" ? "Draw" : s === "O" ? "Over 2.5" : "Under 2.5";
    out.push({ d: B.d[i], match: `${h} – ${a}`, lab, odds: B.o[i] / 100, w: B.w[i], sc: `${Mt.hg[m]}–${Mt.ag[m]}`, lg: S.data.bt.leagues[Mt.lg[m]][1] });
  }
  return out;
}

RENDER.home = function () {
  const el = $("#view-home"), H = S.ui.home, now = Date.now();
  const from = testStart(), to = S.dataTo;
  const { res, series } = equitySeries(from, to);
  const bank0 = S.settings.bankroll;
  // picks: today's, else the next day that has picks
  const future = S.picks.filter((p) => p.f.t > now - 2 * 36e5);
  const firstDay = future.length ? dayDiff(future[0].f.t) : null;
  const shown = future.filter((p) => dayDiff(p.f.t) === firstDay);
  const bank = currentBankroll(), stakes = stakesFor(shown, bank);
  const pickTitle = firstDay === 0 ? "Today’s picks" : firstDay === 1 ? "Tomorrow’s picks" : shown.length ? `Picks for ${fmtDate(shown[0].f.t, { weekday: "long" })}` : "Today’s picks";
  const live = liveNow();
  const next = upcoming(now).filter((f) => f.t > now && S.settings.leagues.includes(f.lg)).slice(0, 8);
  const rec = recentPicks();
  const yrs = (to - from) / 365.25;
  el.innerHTML = `
  <section class="hero glass lens" data-enter style="--i:1" aria-label="Backtest since July 2020">
    <div class="hero-label eyebrow" id="hero-label">Bankroll · since Jul 2020</div>
    <div class="hero-tools">
      <div class="seg" role="tablist" aria-label="Range" id="hero-seg" style="--k:${["1y", "3y", "all"].indexOf(H.range)}">
        <span class="seg-thumb"></span>${["1y", "3y", "all"].map((r) => `<button role="tab" aria-selected="${H.range === r}" data-r="${r}">${r === "all" ? "All" : r.toUpperCase()}</button>`).join("")}
      </div>
    </div>
    <div class="hero-info">
      <div class="hero-num" aria-live="polite"><span class="cur">${CUR()}</span><span id="hero-bank">${nf0.format(res.final)}</span></div>
      <div class="hero-delta"><span class="pill-up" id="hero-pill"><svg class="i"><use href="#i-up"/></svg><span id="hero-pct">${fmtPct(res.ret, 0)}</span></span><span id="hero-from">from <b>${fmtMoney(bank0)}</b> · Jul 2020</span></div>
    </div>
    <div class="chart" id="hero-chart"></div>
    <div class="hero-stats">
      <div class="stat"><span class="k">Per year</span><span class="v">${fmtPct(res.cagr, 0)}<small>/yr</small></span><span class="bar"><i style="width:${clamp(res.cagr / 1.2, 0.04, 1) * 100}%"></i></span></div>
      <div class="stat"><span class="k">Max drawdown</span><span class="v neg">${fmtPct(-res.mdd, 0)}</span><span class="bar neg"><i style="width:${clamp(res.mdd, 0.04, 1) * 100}%"></i></span></div>
      <div class="stat"><span class="k">Bets won</span><span class="v">${fmtPct(res.winrate, 0, false)}</span><span class="bar"><i style="width:${clamp(res.winrate, 0.04, 1) * 100}%"></i></span></div>
    </div>
  </section>

  <section class="picks" aria-labelledby="picks-title">
    <div class="sec-head picks-head" data-enter style="--i:2"><div><h2 id="picks-title">${pickTitle}</h2><p class="sec-sub">The best value of the day, ${M().cfg.K} picks at most. Bet only if Stake pays the min odds or more.</p></div>
      <span class="meta">${shown.length} of max ${M().cfg.K}${shown.length ? " · " + fmtDate(shown[0].f.t, { weekday: "short", month: "short", day: "numeric" }) : ""}</span></div>
    <div class="pick-grid">${shown.length ? shown.map((p, i) => pickCard(p, i, stakes[i], bank)).join("") : `
      <article class="pick-empty glass" data-enter style="--i:3">
        <h3>${S.live.mode === "live" ? "No value right now" : "Picks show up when the odds are out"}</h3>
        <p>${S.live.mode === "live"
          ? "None of the published prices beats the fair odds by enough. The method waits instead of forcing bets: on a typical weekend it finds between 3 and 9 picks."
          : "Bookmakers publish their prices 2 to 4 days before kick-off. The live web app downloads them every 6 hours and picks the best 3 of each day. This copy shows the data embedded on " + esc(fmtDate(Date.parse(S.data.fx.generated), { month: "long", day: "numeric" })) + "."}</p>
        <div class="row"><button class="btn primary" id="home-open-live">${icon("i-qr", "i")}Open the live app</button><a class="btn" href="#backtest">See the backtest</a></div>
      </article>`}</div>
  </section>

  <div class="lower">
    <div class="col col-r">
    ${live.length ? `<section class="live" aria-labelledby="live-title">
      <div class="sec-head"><h2 id="live-title">Live now</h2><span class="meta"><span class="dot"></span>${live.length} match${live.length > 1 ? "es" : ""}</span></div>
      <div class="live-list">${live.map((f) => {
        const min = parseInt(f.live.clock, 10) || 0;
        return `<article class="lv glass clear" aria-label="${esc(teamLabel(f.h))} ${f.live.hs}–${f.live.as} ${esc(teamLabel(f.a))}">
          <span class="lv-min"><span class="dot"></span><b>${esc(f.live.detail || f.live.clock || "")}</b></span>
          <span class="lv-team h"><span>${esc(teamLabel(f.h))}</span>${crest(f.h)}</span>
          <span class="lv-score">${f.live.hs}<i>–</i>${f.live.as}</span>
          <span class="lv-team">${crest(f.a)}<span>${esc(teamLabel(f.a))}</span></span>
          <span class="lv-prog"><i style="width:${clamp(min / 90, 0, 1) * 100}%"></i></span></article>`;
      }).join("")}</div></section>` : ""}
    </div>
    <div class="col col-l">
    <section class="next glass" aria-labelledby="next-title">
      <div class="sec-head"><h2 id="next-title">Next kick-offs</h2><a class="meta link" href="#matches">All matches<svg class="i"><use href="#i-arrow"/></svg></a></div>
      <ol class="ko-list">${next.map((f) => `
        <li data-go-match="${esc(f.key)}">
          <span class="ko-time"><b>${fmtTime(f.t)}</b><span data-cd="${f.t}" data-cdc="1">${countdownShort(f.t - now, true)}</span></span>
          <span class="ko-m"><span class="crests">${crest(f.h)}${crest(f.a)}</span><span class="tx"><span class="tm">${esc(teamLabel(f.h))} – ${esc(teamLabel(f.a))}</span><span class="lg">${esc(leagueName(f.lg))} · ${esc(dayDiff(f.t) === 0 ? "Today" : dayDiff(f.t) === 1 ? "Tomorrow" : fmtDate(f.t, { weekday: "short" }))}</span></span></span>
          ${f.pick ? `<span class="tag pick">Pick</span>` : f.fav ? `<span class="tag">Fair ${fmtOdds(f.fav.fair)}</span>` : `<span class="tag">–</span>`}
        </li>`).join("") || `<li><span class="muted">No upcoming matches in your leagues.</span></li>`}</ol>
    </section>

    <section class="recent glass" aria-labelledby="recent-title">
      <div class="sec-head"><h2 id="recent-title">Latest picks</h2><a class="meta link" href="#backtest">Full history<svg class="i"><use href="#i-arrow"/></svg></a></div>
      ${rec.map((r) => `<div class="rp"><span class="d">${fmtDate(dayToDate(r.d), { month: "short", day: "numeric" })}</span>
        <span class="m"><b>${esc(r.lab)}</b><span>${esc(r.match)} · ${esc(r.lg)} · ${esc(r.sc)}</span></span>
        <span class="r">@ ${fmtOdds(r.odds)}<small><span class="res ${r.w ? "w" : "l"}">${r.w ? "WON" : "LOST"}</span></small></span></div>`).join("")}
    </section>
    </div>
    <div class="col col-r2">

    <section class="method" aria-labelledby="method-title">
      <div class="sec-head"><h2 id="method-title">How the method works</h2></div>
      <ol class="steps">
        <li><span class="n">01</span><div><h4>Price every match</h4><p>A model fuses bookmaker prices with team form, shots and ratings from 22 European leagues into a fair probability for each outcome.</p></div></li>
        <li><span class="n">02</span><div><h4>Keep only real value</h4><p>A bet qualifies when the best price beats the fair price by more than ${fmtPct(M().cfg.thr, 0, false)}, at odds under ${fmtOdds(M().cfg.hi)}. Never more than ${M().cfg.K} a day.</p></div></li>
        <li><span class="n">03</span><div><h4>Size it with Kelly</h4><p>Each stake is a fraction of Kelly on your current bankroll, recalculated after every result. It grows with wins and shrinks in drawdowns.</p></div></li>
      </ol>
      <a class="ghost glass clear" href="#backtest">See the full backtest<svg class="i"><use href="#i-arrow"/></svg></a>
      <p class="fine">Backtest: ${fmtN(res.n)} bets from Jul 2020 to ${fmtDate(dayToDate(to), { month: "short", year: "numeric" })} (${nf1.format(yrs)} years), a period never used to choose the method. It assumes the best price of ~17 bookmakers was available before kick-off, with no stake limits. Real limits and price moves cut results. Past results don’t guarantee future returns. 18+ · Bet responsibly.</p>
    </section>
    </div>
  </div>`;

  // hero chart + range switch
  const setHead = (v, label) => {
    const first = H.cur?.[0]?.v ?? bank0;
    $("#hero-bank").textContent = nf0.format(v);
    const pct = v / first - 1;
    $("#hero-pct").textContent = fmtPct(pct, 0);
    $("#hero-pill").classList.toggle("down", pct < 0);
    if (label !== undefined) $("#hero-label").textContent = label;
  };
  const rangeLabel = { all: "Bankroll · since Jul 2020", "3y": "Bankroll · last 3 years", "1y": "Bankroll · last 12 months" };
  const chart = new EquityChart($("#hero-chart"), {
    label: "Bankroll growth since July 2020",
    onProgress: (v) => setHead(v),
    onScrub: (pt) => pt ? setHead(pt.v, fmtDate(pt.t, { month: "short", year: "numeric" })) : setHead(H.cur[H.cur.length - 1].v, rangeLabel[H.range]),
  });
  const apply = (animate) => {
    const end = series[series.length - 1].t, start = H.range === "1y" ? end - YEAR_MS : H.range === "3y" ? end - 3 * YEAR_MS : -Infinity;
    H.cur = series.filter((p) => p.t >= start);
    const d0 = new Date(H.cur[0].t);
    $("#hero-from").innerHTML = `from <b>${fmtMoney(H.cur[0].v)}</b> · ${MON[d0.getMonth()]} ${d0.getFullYear()}`;
    $("#hero-label").textContent = rangeLabel[H.range];
    chart.set(H.cur, { animate, log: H.log, zero: !H.log && H.range === "all" });
  };
  apply("first");
  $$("#hero-seg button").forEach((b, i) => b.onclick = () => {
    H.range = b.dataset.r;
    $$("#hero-seg button").forEach((x) => x.setAttribute("aria-selected", x === b));
    $("#hero-seg").style.setProperty("--k", i);
    apply("switch");
  });
  // actions
  $$("[data-place]", el).forEach((b) => b.onclick = () => {
    const i = +b.dataset.place, p = shown[i], st = stakes[i];
    const idx = S.journal.findIndex((x) => x.key === p.f.key && x.sel === p.sel);
    if (idx >= 0) { S.journal.splice(idx, 1); saveJournal(); toast("Removed from your bets"); RENDER.home(); renderSidebar(); return; }
    logBet(p.f, p.sel, p.odds, st, p.p);
    toast("Bet logged", `${selText(p.f, p.sel)} · ${fmtMoney(st)} @ ${fmtOdds(p.odds)}. Change the odds in My bets if Stake paid a different price.`, "i-check");
    RENDER.home(); renderSidebar();
  });
  $$("[data-check]", el).forEach((b) => b.onclick = () => { const [key, sel] = b.dataset.check.split("|"); openStakeFor(key, sel); });
  $$("[data-go-match]", el).forEach((li) => li.onclick = () => { S.ui.openMatch = li.dataset.goMatch; go("matches"); });
  $("#home-open-live")?.addEventListener("click", () => openSheet($("#modal-qr"), renderQR));
};
function logBet(f, sel, odds, stake, p) {
  S.journal.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created: Date.now(), key: f.key, lg: f.lg, t: f.t,
    label: `${teamLabel(f.h)} v ${teamLabel(f.a)}`, sel, odds: +(+odds).toFixed(2), stake: +(+stake).toFixed(2), p, status: "open" });
  saveJournal();
  S.follows.add(f.key); saveFollows();
}
