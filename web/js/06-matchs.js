/* ============================== Matchs ============================== */
function matchRow(f, now) {
  const st = liveStatus(f, now);
  const p = f.pFair;
  const isLive = st.k === "live";
  const sc = f.live && f.live.state !== "pre" ? [f.live.hs, f.live.as] : f.s || null;
  const fol = S.follows.has(f.key);
  const fairs = p ? p.map((x) => 1 / x) : null;
  const k = f.fav?.k;
  const badge = isLive ? `<span class="tag live"><span class="dot pulse"></span>${esc(st.txt)}</span>`
    : st.k === "ft" ? `<span class="tag ft">Terminé</span>`
    : f.pick ? `<span class="tag pick">Value ${SEL[f.pick.k]} · ${fmtPct(f.pick.edge, 1)}</span>`
    : st.k === "maybe" ? `<span class="tag info">Coup d'envoi passé</span>`
    : f.fav && f.fav.fair < 1.6 ? `<span class="tag info">Favori ≤ 1,60</span>` : "";
  return `<div class="match ${isLive ? "is-live" : ""} ${f.pick ? "is-pick" : ""} ${f.flash && Date.now() - f.flash < 3000 ? "goal-flash" : ""}" data-key="${esc(f.key)}">
    <div class="m-time"><b>${fmtTime(f.t)}</b><span class="cd" ${st.k === "pre" ? `data-cd="${f.t}" data-cdc="1"` : ""}>${st.k === "pre" ? countdownShort(f.t - now, true) : esc(st.txt)}</span></div>
    <div class="m-teams">
      <div class="m-team">${crest(f.h)}<span class="nm">${esc(teamLabel(f.h))}</span><span class="elo">${fmtN(S.ratings[f.h])}</span>${sc ? `<span class="sc">${sc[0]}</span>` : ""}</div>
      <div class="m-team">${crest(f.a)}<span class="nm">${esc(teamLabel(f.a))}</span><span class="elo">${fmtN(S.ratings[f.a])}</span>${sc ? `<span class="sc">${sc[1]}</span>` : ""}</div>
      <div class="m-meta"><span>${esc(S.fx.leagues[f.lg].name)}</span>${f.r ? `<span>· ${esc(f.r.replace("Matchday", "J."))}</span>` : ""}</div>
    </div>
    <div class="m-side">
      <div class="row" style="gap:6px">${badge}<button class="star" aria-pressed="${fol}" aria-label="Suivre ce match" data-follow="${esc(f.key)}">${icon(fol ? "i-star" : "i-star-o")}</button></div>
      ${p ? `<div class="probbar" title="1 ${nf0.format(p[0] * 100)} % · N ${nf0.format(p[1] * 100)} % · 2 ${nf0.format(p[2] * 100)} %"><i class="h" style="width:${p[0] * 100}%"></i><i class="d" style="width:${p[1] * 100}%"></i><i class="a" style="width:${p[2] * 100}%"></i></div>
      <div class="fair">${fairs.map((o, i) => `<span class="${i === k ? "best" : ""}">${SEL[i]} ${fmtOdds(o)}</span>`).join("")}</div>` : `<span class="muted" style="font-size:12px">Elo indisponible</span>`}
    </div>
    <div class="match-detail" data-detail></div>
  </div>`;
}
function matchDetail(f) {
  const p = f.pFair, champ = strat(S.bt.champion);
  const rows = p ? p.map((x, i) => `<tr><td>${SEL[i]} · ${esc(selLabel(f, i))}</td><td class="n">${fmtPct(x, 1, false)}</td><td class="n">${fmtOdds(1 / x)}</td>
    <td class="n">${validOdds(f.b365) ? fmtOdds(f.b365[i]) : "–"}</td><td class="n">${validOdds(f.max) ? fmtOdds(f.max[i]) : "–"}</td></tr>`).join("") : "";
  return `
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Issue</th><th class="n">Proba</th><th class="n">Cote juste</th><th class="n">Bet365</th><th class="n">Meilleure</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 10px">Source des probabilités : ${esc(f.fairSrc || "–")}. Elo ${esc(teamLabel(f.h))} ${fmtN(S.ratings[f.h])} · ${esc(teamLabel(f.a))} ${fmtN(S.ratings[f.a])}.</p>
    <div class="lbl muted" style="font-size:12px;margin-bottom:6px">Cotes Stake (1 · N · 2)</div>
    <div class="odds-row"><input class="input" inputmode="decimal" placeholder="1" id="qs-${esc(f.key)}-0"><input class="input" inputmode="decimal" placeholder="N" id="qs-${esc(f.key)}-1"><input class="input" inputmode="decimal" placeholder="2" id="qs-${esc(f.key)}-2"></div>
    <div data-qv style="margin-top:10px"></div>
    <div class="row" style="margin-top:10px"><button class="btn small" data-open-stake="${esc(f.key)}">${icon("i-target")}Comparateur complet</button>
    <span class="muted" style="font-size:12px">Règle championne : ${esc(bandPhrase(champ))}, ${esc(S.bt.labels.group[champ.group])}.</span></div>`;
}
function quickVerdict(f, stakeOdds) {
  const champ = strat(S.bt.champion);
  const ref = validOdds(f.b365) ? f.b365 : validOdds(f.ref) ? f.ref : null;
  let r;
  if (ref) r = applyRule(champ, f.lg, ref, stakeOdds, f.pElo);
  else if (f.pElo) {
    // no market reference: compare with the Elo fair price (indicative only)
    let best = null;
    f.pElo.forEach((p, k) => { const e = p * stakeOdds[k] - 1; if (!best || e > best.edge) best = { k, edge: e, odds: stakeOdds[k], p }; });
    r = Object.assign(best, { ok: best.edge > 0 && best.odds >= champ.lo && best.odds < champ.hi, elo: true });
  }
  if (!r || !Number.isFinite(r.edge)) return `<div class="callout">Entre les trois cotes Stake.</div>`;
  const stake = stakeFor(r.p, r.odds);
  return r.ok
    ? `<div class="callout good"><b>Value sur ${SEL[r.k]} (${esc(selLabel(f, r.k))}) @ ${fmtOdds(r.odds)}</b> · avantage ${fmtPct(r.edge, 1)} · mise conseillée <b>${fmtEur(stake, 2)}</b>${r.elo ? "<br><span class='muted'>Estimation Elo seule : ajoute la cote d'un autre bookmaker pour confirmer.</span>" : ""}</div>`
    : `<div class="callout bad"><b>Pas de pari.</b> Meilleur avantage : ${fmtPct(r.edge, 1)} sur ${SEL[r.k]} @ ${fmtOdds(r.odds)}${r.inBand === false || (r.odds >= champ.hi) ? " (hors de la plage de cotes de la stratégie)" : ""}.</div>`;
}

RENDER.matchs = function () {
  const el = $("#view-matchs"), F = S.ui.matchFilter, now = Date.now();
  const lgs = Object.entries(S.fx.leagues).filter(([c, v]) => v.of || S.fixtures.some((f) => f.lg === c));
  let list;
  if (F.mode === "results") {
    list = S.results.filter((r) => F.lg === "all" || r.lg === F.lg).slice(0, 150);
  } else {
    const horizon = { today: (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); })(), "48h": now + 2 * DAY, "7d": now + 7 * DAY, all: Infinity }[F.when];
    list = upcoming(now).filter((f) => f.t <= horizon && (F.lg === "all" || f.lg === F.lg));
    if (F.only === "follow") list = list.filter((f) => S.follows.has(f.key));
    if (F.only === "value") list = list.filter((f) => f.pick || (f.fav && f.fav.fair < 1.6));
  }
  const shown = list.slice(0, F.limit || 120);
  let lastDay = "";
  const body = shown.map((f) => {
    const dh = fmtDayHead(f.t);
    const head = dh !== lastDay ? `<div class="day-head">${esc(dh)}</div>` : "";
    lastDay = dh;
    return head + (F.mode === "results" ? matchRow(Object.assign({}, f, { pFair: eloProbs(f.lg, f.h, f.a) }), now) : matchRow(f, now));
  }).join("");
  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Saison ${esc(S.fx.season)} · ${S.live.mode === "live" ? "scores en direct" : "instantané du " + fmtDate(Date.parse(S.fx.generated))}</div>
    <h1>Matchs</h1><p>Probabilités du modèle, cote juste de chaque issue, compte à rebours avant le coup d'envoi${S.live.mode === "live" ? " et score en direct" : ""}. Touche un match pour tester les cotes Stake.</p></div>
  </div>
  <div class="glass panel filters" style="padding:12px;margin-bottom:6px">
    <div class="row" style="gap:8px">
      <div class="seg" role="group" aria-label="Mode">${[["upcoming", "À venir"], ["results", "Résultats"]].map(([k, l]) => `<button data-f-mode="${k}" aria-pressed="${(F.mode || "upcoming") === k}">${l}</button>`).join("")}</div>
      ${F.mode === "results" ? "" : `<div class="seg" role="group" aria-label="Période">${[["today", "Aujourd'hui"], ["48h", "48 h"], ["7d", "7 jours"], ["all", "Tout"]].map(([k, l]) => `<button data-f-when="${k}" aria-pressed="${F.when === k}">${l}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Filtre">${[["all", "Tous"], ["value", "Value / favoris"], ["follow", "Suivis"]].map(([k, l]) => `<button data-f-only="${k}" aria-pressed="${F.only === k}">${l}</button>`).join("")}</div>`}
    </div>
    <div class="chips" style="margin-top:10px"><button class="fchip" data-f-lg="all" aria-pressed="${F.lg === "all"}">Toutes</button>${lgs.map(([c, v]) => `<button class="fchip" data-f-lg="${c}" aria-pressed="${F.lg === c}">${esc(v.name)}</button>`).join("")}</div>
  </div>
  <div id="match-list">${body || `<div class="empty">Aucun match pour ce filtre.</div>`}</div>
  ${list.length > shown.length ? `<div class="row" style="justify-content:center;margin-top:10px"><button class="btn ghost" id="more-matches">Afficher plus (${list.length - shown.length})</button></div>` : ""}`;

  $$("[data-f-mode]", el).forEach((b) => b.onclick = () => { F.mode = b.dataset.fMode; F.limit = 120; RENDER.matchs(); });
  $$("[data-f-when]", el).forEach((b) => b.onclick = () => { F.when = b.dataset.fWhen; F.limit = 120; RENDER.matchs(); });
  $$("[data-f-only]", el).forEach((b) => b.onclick = () => { F.only = b.dataset.fOnly; RENDER.matchs(); });
  $$("[data-f-lg]", el).forEach((b) => b.onclick = () => { F.lg = b.dataset.fLg; RENDER.matchs(); });
  $("#more-matches")?.addEventListener("click", () => { F.limit = (F.limit || 120) + 150; RENDER.matchs(); });
  bindMatchRows(el);
  if (S.ui.openMatch) {
    const row = el.querySelector(`.match[data-key="${CSS.escape(S.ui.openMatch)}"]`);
    if (row) toggleMatch(row, true);
  }
};
function bindMatchRows(root) {
  $$(".match", root).forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-follow],[data-detail] *,[data-open-stake]")) return;
      toggleMatch(row);
    });
  });
  $$("[data-follow]", root).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const k = b.dataset.follow;
    if (S.follows.has(k)) S.follows.delete(k); else { S.follows.add(k); const f = S.fixByKey.get(k); if (f) toast("Match suivi", `${teamLabel(f.h)} – ${teamLabel(f.a)} : rappel 15 min avant, buts et score final.`, "i-star"); }
    saveFollows();
    b.setAttribute("aria-pressed", S.follows.has(k));
    b.innerHTML = icon(S.follows.has(k) ? "i-star" : "i-star-o");
  }));
  $$("[data-open-stake]", root).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openStakeFor(b.dataset.openStake); }));
}
function toggleMatch(row, force) {
  const open = force ?? !row.classList.contains("open");
  row.classList.toggle("open", open);
  const f = S.fixByKey.get(row.dataset.key) || S.results.find((r) => r.key === row.dataset.key);
  S.ui.openMatch = open ? row.dataset.key : null;
  if (!open || !f) return;
  const det = row.querySelector("[data-detail]");
  if (!f.pElo && !f.pFair) { f.pElo = eloProbs(f.lg, f.h, f.a); f.pFair = f.pElo; f.fav = f.pFair ? { k: f.pFair.indexOf(Math.max(...f.pFair)), fair: 1 / Math.max(...f.pFair) } : null; }
  det.innerHTML = matchDetail(f);
  det.querySelectorAll("[data-open-stake]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openStakeFor(b.dataset.openStake); }));
  const inputs = [0, 1, 2].map((i) => det.querySelector(`#qs-${CSS.escape(f.key)}-${i}`));
  const upd = () => {
    const v = inputs.map((x) => parseFloat(String(x.value).replace(",", ".")));
    det.querySelector("[data-qv]").innerHTML = v.every((x) => x > 1) ? quickVerdict(f, v) : "";
  };
  inputs.forEach((x) => x.addEventListener("input", upd));
}
