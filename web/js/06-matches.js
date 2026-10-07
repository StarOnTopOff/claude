/* ============================== Matches ============================== */
function methodProb(f, sel) {
  const c = f.cands?.find((x) => x.sel === sel);
  if (c && Number.isFinite(c.p)) return { p: c.p, src: "method" };
  const w = f.watch?.find((x) => x.sel === sel);
  if (w && Number.isFinite(w.p)) return { p: w.p, src: "market" };
  if (f.pElo && "HDA".includes(sel)) return { p: f.pElo["HDA".indexOf(sel)], src: "elo" };
  return null;
}
// A Stake price for one selection: edge vs the method's probability and the Kelly stake from the bankroll.
function checkPrice(f, sel, odds) {
  const mp = methodProb(f, sel);
  if (!mp || !(odds > 1)) return null;
  const edge = mp.p * odds - 1, cfg = M().cfg;
  const inGroupOk = inGroup(f.lg), mktOk = cfg.mkts === "all" || (cfg.mkts === "1X2" ? "HDA".includes(sel) : "OU".includes(sel));
  const ok = edge > cfg.thr && odds >= cfg.lo && odds < cfg.hi && inGroupOk && mktOk && mp.src !== "elo";
  const stake = ok ? stakesFor([{ kelly: edge / (odds - 1) }])[0] : 0;
  return { p: +mp.p.toFixed(4), source: mp.src, min_odds: +minOdds(mp.p).toFixed(2), fair_odds: +(1 / mp.p).toFixed(2), edge: +edge.toFixed(4), ok, stake: +stake.toFixed(2),
    why: ok ? "value" : mp.src === "elo" ? "elo-only" : !inGroupOk ? "league" : !(odds < cfg.hi) ? "odds-too-high" : "no-edge" };
}

function matchRow(f, now) {
  const st = liveStatus(f, now), p = f.pFair, isLive = st.k === "live";
  const sc = f.live && f.live.state !== "pre" ? [f.live.hs, f.live.as] : f.s || null;
  const fol = S.follows.has(f.key);
  const status = isLive ? `<span class="tag live"><span class="dot"></span>${esc(st.txt)}</span>`
    : st.k === "ft" ? `<span class="tag ft">FT</span>`
    : f.pick ? `<span class="tag pick">Pick · ${esc(selShort(f.pick.sel))}</span>`
    : st.k === "maybe" ? `<span class="tag info">In play</span>` : "";
  return `<article class="mrow glass clear ${isLive ? "is-live" : ""} ${f.pick ? "is-pick" : ""} ${f.flash && Date.now() - f.flash < 3000 ? "flash" : ""}" data-key="${esc(f.key)}">
    <div class="mt"><b>${fmtTime(f.t)}</b>${st.k === "pre" ? `<span data-cd="${f.t}" data-cdc="1">${countdownShort(f.t - now, true)}</span>` : `<span class="${isLive ? "live" : ""}">${esc(st.txt)}</span>`}</div>
    <div class="mteams">
      <div class="mteam">${crest(f.h)}<span class="nm">${esc(teamLabel(f.h))}</span>${sc ? `<span class="sc">${sc[0]}</span>` : ""}</div>
      <div class="mteam">${crest(f.a)}<span class="nm">${esc(teamLabel(f.a))}</span>${sc ? `<span class="sc">${sc[1]}</span>` : ""}</div>
      <div class="mmeta">${esc(leagueName(f.lg))}${f.r ? " · " + esc(String(f.r).replace("Matchday", "MD")) : ""}</div>
    </div>
    <div class="mside">
      <div class="row nowrap" style="gap:6px">${status}<button class="star" aria-pressed="${fol}" aria-label="Follow this match" data-follow="${esc(f.key)}"><svg><use href="#i-star"/></svg></button></div>
      ${p ? `<div class="pbar" title="Home ${nf0.format(p[0] * 100)}% · Draw ${nf0.format(p[1] * 100)}% · Away ${nf0.format(p[2] * 100)}%"><i class="h" style="width:${p[0] * 100}%"></i><i class="d" style="width:${p[1] * 100}%"></i><i class="a" style="width:${p[2] * 100}%"></i></div>
      <div class="fair">${p.map((x, i) => `<span class="${i === f.fav?.k ? "fav" : ""}">${"1X2"[i]} ${fmtOdds(1 / x)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="mdetail" data-detail></div>
  </article>`;
}
function matchDetail(f) {
  const sels = ["H", "D", "A", "O", "U"].filter((s) => methodProb(f, s));
  const rows = sels.map((s) => {
    const mp = methodProb(f, s), c = f.cands?.find((x) => x.sel === s);
    return `<tr class="${f.pick?.sel === s ? "hit" : ""}"><td>${esc(selText(f, s))}</td><td>${fmtPct(mp.p, 1, false)}</td><td>${fmtOdds(1 / mp.p)}</td><td>${mp.src === "elo" ? "–" : fmtOdds(minOdds(mp.p))}</td><td>${c ? fmtOdds(c.mx) : "–"}</td></tr>`;
  }).join("");
  const src = f.cands ? "Fusion model (the method)" : f.watch ? f.fairSrc : "Elo model (information only)";
  const form = (t) => teamForm(t).join(" ") || "–";
  return `<div class="tbl-wrap"><table class="otbl"><thead><tr><th>Outcome</th><th>Prob.</th><th>Fair</th><th>Min on Stake</th><th>Best price</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:10px 0 12px">Source: ${esc(src)} · Elo ${fmtN(S.ratings[f.h])} v ${fmtN(S.ratings[f.a])} · form ${esc(teamLabel(f.h))} ${esc(form(f.h))}, ${esc(teamLabel(f.a))} ${esc(form(f.a))}</p>
    <div class="row"><button class="btn primary small" data-open-check="${esc(f.key)}">${icon("i-target", "i")}Check a Stake price</button>${f.pick ? `<span class="muted small">Pick: ${esc(selText(f, f.pick.sel))} · min odds ${fmtOdds(minOdds(f.pick.p))}</span>` : ""}</div>`;
}

RENDER.matches = function () {
  const el = $("#view-matches"), F = S.ui.matchFilter, now = Date.now();
  const lgs = Object.entries(S.data.fx.leagues).filter(([c, v]) => v.of || S.fixtures.some((f) => f.lg === c));
  let list;
  if (F.mode === "results") list = S.results.filter((r) => F.lg === "all" || r.lg === F.lg).slice(0, 150).map((r) => computeFixture(Object.assign({}, r)));
  else {
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const horizon = { today: endToday.getTime(), "48h": now + 2 * DAY, "7d": now + 7 * DAY, all: Infinity }[F.when];
    list = upcoming(now).filter((f) => f.t <= horizon && (F.lg === "all" || f.lg === F.lg));
    if (F.only === "follow") list = list.filter((f) => S.follows.has(f.key));
    if (F.only === "picks") list = list.filter((f) => f.pick);
    if (F.only === "live") list = list.filter((f) => f.live?.state === "in");
  }
  const shown = list.slice(0, F.limit || 100);
  let lastDay = "";
  const body = shown.map((f) => {
    const dh = fmtDayHead(f.t), head = dh !== lastDay ? `<div class="day-head">${esc(dh)}</div>` : "";
    lastDay = dh;
    return head + matchRow(f, now);
  }).join("");
  el.innerHTML = `
  <header class="page-head" data-enter style="--i:0">
    <div class="eyebrow">Season ${esc(S.data.fx.season)} · ${S.live.mode === "live" ? "live scores" : "snapshot of " + esc(fmtDate(Date.parse(S.data.fx.generated), { month: "short", day: "numeric" }))}</div>
    <h1>Matches</h1>
    <p>Kick-off countdowns, live scores, the probability of every outcome and the fair odds. Tap a match to check a Stake price.</p>
  </header>
  <div class="filters glass" data-enter style="--i:1">
    <div class="row scroll-x" style="gap:8px">
      <div class="segx">${[["upcoming", "Upcoming"], ["results", "Results"]].map(([k, l]) => `<button data-f-mode="${k}" aria-pressed="${(F.mode || "upcoming") === k}">${l}</button>`).join("")}</div>
      ${F.mode === "results" ? "" : `<div class="segx">${[["today", "Today"], ["48h", "48 h"], ["7d", "7 days"], ["all", "All"]].map(([k, l]) => `<button data-f-when="${k}" aria-pressed="${F.when === k}">${l}</button>`).join("")}</div>
      <div class="segx">${[["all", "All"], ["picks", "Picks"], ["live", "Live"], ["follow", "Starred"]].map(([k, l]) => `<button data-f-only="${k}" aria-pressed="${F.only === k}">${l}</button>`).join("")}</div>`}
    </div>
    <div class="chips scroll-x"><button class="chip-btn" data-f-lg="all" aria-pressed="${F.lg === "all"}">All leagues</button>${lgs.map(([c, v]) => `<button class="chip-btn" data-f-lg="${c}" aria-pressed="${F.lg === c}">${esc(v.name)}</button>`).join("")}</div>
  </div>
  <div class="mlist" id="match-list">${body || `<div class="empty glass" style="--r:24px">No match for this filter.</div>`}</div>
  ${list.length > shown.length ? `<div class="more"><button class="btn" id="more-matches">Show more (${list.length - shown.length})</button></div>` : ""}`;
  $$("[data-f-mode]", el).forEach((b) => b.onclick = () => { F.mode = b.dataset.fMode; F.limit = 100; RENDER.matches(); });
  $$("[data-f-when]", el).forEach((b) => b.onclick = () => { F.when = b.dataset.fWhen; F.limit = 100; RENDER.matches(); });
  $$("[data-f-only]", el).forEach((b) => b.onclick = () => { F.only = b.dataset.fOnly; RENDER.matches(); });
  $$("[data-f-lg]", el).forEach((b) => b.onclick = () => { F.lg = b.dataset.fLg; RENDER.matches(); });
  $("#more-matches")?.addEventListener("click", () => { F.limit = (F.limit || 100) + 150; RENDER.matches(); });
  bindMatchRows(el);
  if (S.ui.openMatch) {
    const row = el.querySelector(`.mrow[data-key="${CSS.escape(S.ui.openMatch)}"]`);
    if (row) { toggleMatch(row, true); row.scrollIntoView({ block: "center" }); }
  }
};
function bindMatchRows(root) {
  $$(".mrow", root).forEach((row) => row.addEventListener("click", (e) => {
    if (e.target.closest("[data-follow],[data-detail] *")) return;
    toggleMatch(row);
  }));
  $$("[data-follow]", root).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const k = b.dataset.follow;
    if (S.follows.has(k)) S.follows.delete(k);
    else { S.follows.add(k); const f = S.fixByKey.get(k); if (f) toast("Match starred", `${teamLabel(f.h)} v ${teamLabel(f.a)}: kick-off reminder, goals and final score.`, "i-star"); }
    saveFollows();
    b.setAttribute("aria-pressed", S.follows.has(k));
  }));
}
function toggleMatch(row, force) {
  const open = force ?? !row.classList.contains("open");
  row.classList.toggle("open", open);
  S.ui.openMatch = open ? row.dataset.key : null;
  const f = S.fixByKey.get(row.dataset.key) || S.results.find((r) => r.key === row.dataset.key);
  if (!open || !f) return;
  if (!f.pFair) computeFixture(f);
  const det = row.querySelector("[data-detail]");
  det.innerHTML = matchDetail(f);
  det.querySelector("[data-open-check]")?.addEventListener("click", (e) => { e.stopPropagation(); openStakeFor(f.key, f.pick?.sel || f.fav?.sel || "H"); });
}
