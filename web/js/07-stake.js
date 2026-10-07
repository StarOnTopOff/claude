/* ============================== Stake : comparateur + journal ============================== */
S.ui.stake = { key: null, stake: ["", "", ""], ref: ["", "", ""], lg: "E0", label: "" };
S.ui.stakeTab = "check";

function openStakeFor(key) {
  const f = S.fixByKey.get(key);
  const st = S.ui.stake;
  st.key = f ? key : null;
  st.stake = ["", "", ""];
  st.ref = f && validOdds(f.b365) ? f.b365.map(String) : f && validOdds(f.ref) ? f.ref.map((x) => x.toFixed(2)) : ["", "", ""];
  if (f) { st.lg = f.lg; st.label = `${teamLabel(f.h)} – ${teamLabel(f.a)}`; }
  S.ui.stakeTab = "check";
  if (S.view === "stake") RENDER.stake(); else go("stake");
}
const pnum = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };

function parseStakeText(text) {
  const t = String(text || "").replace(/(\d),(\d)/g, "$1.$2");
  const odds = [];
  for (const m of t.matchAll(/(?<![\d.])(\d{1,3}\.\d{1,3})(?![\d.])/g)) { const v = +m[1]; if (v >= 1.01 && v <= 200) odds.push(v); }
  const stop = /^(draw|nul|match nul|x|1|2|1x2|1 x 2|vainqueur.*|r[ée]sultat.*|winner.*|live|en direct|stake|bet|parier|cash ?out|plus|more|\+\d+)$/i;
  const lines = t.split(/\n|\|/).map((l) => l.replace(/\d+\.\d+/g, "").replace(/\s+/g, " ").trim()).filter((l) => /[a-zà-ÿ]{3}/i.test(l) && !stop.test(l));
  let best = null, bs = 0;
  const now = Date.now();
  for (const f of S.fixtures) {
    if (f.t < now - 3 * 36e5 || f.t > now + 14 * DAY) continue;
    let sh = 0, sa = 0;
    for (const l of lines) { sh = Math.max(sh, nameSim(l, teamLabel(f.h)), nameSim(l, f.h)); sa = Math.max(sa, nameSim(l, teamLabel(f.a)), nameSim(l, f.a)); }
    if (sh + sa > bs) { bs = sh + sa; best = f; }
  }
  return { odds: odds.slice(0, 3), fixture: bs >= 1.2 ? best : null, teams: lines.slice(0, 2) };
}

function comparatorResult() {
  const st = S.ui.stake, f = st.key ? S.fixByKey.get(st.key) : null;
  const ex = st.stake.map(pnum), ref = st.ref.map(pnum);
  if (!ex.every((x) => x > 1)) return null;
  const lg = f ? f.lg : st.lg;
  const pElo = f ? f.pElo : null;
  const hasRef = ref.every((x) => x > 1);
  const pRef = hasRef ? novigPower(ref) : null;
  const pFair = pRef || pElo || novigPower(ex);
  const src = pRef ? "Cotes de référence sans marge" : pElo ? "Modèle Elo (indicatif)" : "Cotes Stake sans marge";
  const champ = strat(S.bt.champion);
  const rule = hasRef ? applyRule(champ, lg, ref, ex, pElo) : null;
  const tiles = pFair.map((p, k) => ({ k, p, fair: 1 / p, odds: ex[k], edge: p * ex[k] - 1 }));
  const best = tiles.reduce((a, b) => (b.edge > a.edge ? b : a));
  const margin = ex.reduce((a, o) => a + 1 / o, 0) - 1;
  return { f, lg, ex, ref, hasRef, pFair, src, rule, tiles, best, margin, champ };
}

RENDER.stake = function () {
  const el = $("#view-stake");
  el.innerHTML = `
  <div class="page-head">
    <div><div class="eyebrow">Comparateur de cotes</div><h1>Cotes Stake</h1>
    <p>Entre les cotes affichées sur Stake. L'appli calcule la cote juste, ton avantage et la mise selon ta bankroll, avec exactement la règle validée par le backtest.</p></div>
    <div class="seg" role="tablist">${[["check", "Vérifier un pari"], ["journal", `Mes paris (${S.journal.length})`]].map(([k, l]) => `<button data-stab="${k}" aria-pressed="${S.ui.stakeTab === k}">${l}</button>`).join("")}</div>
  </div>
  <div id="stake-body"></div>`;
  $$("[data-stab]", el).forEach((b) => b.onclick = () => { S.ui.stakeTab = b.dataset.stab; RENDER.stake(); });
  if (S.ui.stakeTab === "journal") renderJournal($("#stake-body")); else renderChecker($("#stake-body"));
};

function renderChecker(host) {
  const st = S.ui.stake, f = st.key ? S.fixByKey.get(st.key) : null;
  const opts = upcoming().filter((x) => x.t < Date.now() + 14 * DAY).slice(0, 400);
  host.innerHTML = `
  <div class="grid-2">
    <section class="glass panel">
      <div class="panel-head"><h2>1 · Le match</h2>${f ? `<span class="tag info">${esc(S.fx.leagues[f.lg].name)} · ${fmtDate(f.t, { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(f.t)}</span>` : ""}</div>
      <div class="field"><label for="st-match">Choisis le match</label>
        <select class="input" id="st-match"><option value="">Autre match (saisie libre)</option>${opts.map((x) => `<option value="${esc(x.key)}" ${x.key === st.key ? "selected" : ""}>${esc(teamLabel(x.h))} – ${esc(teamLabel(x.a))} · ${fmtDate(x.t, { day: "2-digit", month: "2-digit" })} ${fmtTime(x.t)}</option>`).join("")}</select></div>
      ${f ? "" : `<div class="field" style="margin-top:10px"><label for="st-lg">Championnat</label><select class="input" id="st-lg">${Object.entries(S.fx.leagues).map(([c, v]) => `<option value="${c}" ${c === st.lg ? "selected" : ""}>${esc(v.name)} (${esc(v.country)})</option>`).join("")}</select></div>`}
      <details class="more" style="margin-top:14px" ${st.pasteOpen ? "open" : ""} id="st-paste-wrap"><summary>Remplir automatiquement depuis Stake</summary>
        <div class="stack">
          <div class="field"><label for="st-paste">Colle le texte copié sur la page du match Stake</label><textarea class="input" id="st-paste" placeholder="Arsenal&#10;1.45&#10;Nul&#10;4.60&#10;Chelsea&#10;7.00"></textarea></div>
          <div id="st-ai-shot" hidden>
            <div class="drop" id="st-drop">${icon("i-image")}<br>Ou dépose une capture d'écran de Stake : l'IA lit les équipes et les cotes.<br><input type="file" id="st-file" accept="image/png,image/jpeg,image/webp" style="margin-top:8px;max-width:100%"></div>
          </div>
          <div id="st-paste-msg" class="muted" style="font-size:12.5px"></div>
        </div>
      </details>
    </section>

    <section class="glass panel">
      <div class="panel-head"><h2>2 · Les cotes</h2><span class="sub">1 · N · 2</span></div>
      <div class="field"><span class="lbl">Cotes Stake</span>
        <div class="odds-row">${[0, 1, 2].map((i) => `<input class="input" inputmode="decimal" id="st-s${i}" placeholder="${SEL[i]}" value="${esc(st.stake[i])}" aria-label="Cote Stake ${SEL[i]}">`).join("")}</div></div>
      <div class="field" style="margin-top:12px"><span class="lbl">Cotes de référence d'un autre bookmaker (Bet365, Winamax, Unibet, Pinnacle…)${f && validOdds(f.b365) ? " · pré-remplies avec Bet365" : ""}</span>
        <div class="odds-row">${[0, 1, 2].map((i) => `<input class="input" inputmode="decimal" id="st-r${i}" placeholder="${SEL[i]}" value="${esc(st.ref[i])}" aria-label="Cote de référence ${SEL[i]}">`).join("")}</div></div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Pourquoi deux bookmakers ? Dans le backtest, les stratégies qui jouent un seul bookmaker sans le comparer à un autre finissent perdantes. Le gain vient de prendre Stake quand il paie plus que le prix juste du marché.</p>
    </section>
  </div>
  <section class="glass panel" style="margin-top:14px" id="st-result"></section>`;

  const sync = () => {
    st.stake = [0, 1, 2].map((i) => $("#st-s" + i).value);
    st.ref = [0, 1, 2].map((i) => $("#st-r" + i).value);
    renderVerdict();
  };
  [0, 1, 2].forEach((i) => { $("#st-s" + i).addEventListener("input", sync); $("#st-r" + i).addEventListener("input", sync); });
  $("#st-match").addEventListener("change", (e) => { if (e.target.value) openStakeFor(e.target.value); else { st.key = null; RENDER.stake(); } });
  $("#st-lg")?.addEventListener("change", (e) => { st.lg = e.target.value; renderVerdict(); });
  $("#st-paste-wrap").addEventListener("toggle", (e) => { st.pasteOpen = e.target.open; });
  $("#st-paste").addEventListener("input", (e) => {
    const r = parseStakeText(e.target.value);
    const msg = $("#st-paste-msg");
    if (r.odds.length >= 3) {
      if (r.fixture && r.fixture.key !== st.key) { openStakeFor(r.fixture.key); st.pasteOpen = true; st.stake = r.odds.map(String); RENDER.stake(); toast("Match reconnu", `${teamLabel(r.fixture.h)} – ${teamLabel(r.fixture.a)}`, "i-target"); return; }
      st.stake = r.odds.map(String);
      [0, 1, 2].forEach((i) => { $("#st-s" + i).value = st.stake[i]; });
      msg.textContent = `Cotes détectées : ${r.odds.map(fmtOdds).join(" · ")}${r.fixture ? "" : " (match non reconnu : choisis-le dans la liste)"}`;
      renderVerdict();
    } else msg.textContent = r.odds.length ? `Seulement ${r.odds.length} cote(s) trouvée(s) : copie tout le bloc 1X2.` : "";
  });
  if (S.ai.sample && S.ai.hasImages) setupShot();
  renderVerdict();
}

function setupShot() {
  const box = $("#st-ai-shot"), drop = $("#st-drop"), file = $("#st-file");
  if (!box) return;
  box.hidden = false;
  const run = async (blob) => {
    const msg = $("#st-paste-msg");
    msg.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> L'IA lit la capture…`;
    try {
      const out = await S.ai.sample.json(
        "This image is a screenshot from a sports betting website (usually Stake). Find the football match shown and its full-time result (1X2 / match winner) decimal odds. " +
        'Reply with only JSON: {"home": string, "away": string, "odds": [home, draw, away]} using decimal numbers. If American odds are shown, convert to decimal. If no 1X2 market is visible, use null for odds.',
        { images: blob, modelTier: "quick" });
      const odds = Array.isArray(out?.odds) ? out.odds.map(Number) : null;
      if (!odds || !odds.every((x) => x > 1)) { msg.textContent = "Je ne vois pas de cotes 1X2 sur cette image."; return; }
      const r = parseStakeText(`${out.home}\n${out.away}`);
      if (r.fixture) openStakeFor(r.fixture.key);
      S.ui.stake.stake = odds.map((x) => x.toFixed(2));
      S.ui.stake.pasteOpen = true;
      RENDER.stake();
      toast("Cotes lues par l'IA", `${out.home} – ${out.away} : ${odds.map(fmtOdds).join(" · ")}`, "i-spark");
    } catch (e) {
      if (["not_granted", "sampling_disabled", "images_unavailable", "capability_disabled"].includes(e?.code)) { box.hidden = true; msg.textContent = ""; }
      else msg.textContent = e?.code === "rate_limited" ? "Trop de demandes à l'IA. Réessaie dans un moment." : "La lecture a échoué. Essaie avec une capture plus nette ou colle le texte.";
    }
  };
  file.addEventListener("change", () => file.files[0] && run(file.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const fl = e.dataTransfer.files[0]; if (fl) run(fl); });
}

function renderVerdict() {
  const host = $("#st-result");
  if (!host) return;
  const R = comparatorResult(), st = S.ui.stake;
  if (!R) {
    host.innerHTML = `<div class="panel-head"><h2>3 · Le verdict</h2></div><div class="empty">Entre les trois cotes Stake pour voir la cote juste, ton avantage et la mise conseillée.</div>`;
    return;
  }
  const f = R.f, champ = R.champ;
  const name = (k) => (f ? selLabel(f, k) : ["Domicile", "Nul", "Extérieur"][k]);
  const rule = R.rule;
  const chosen = rule ? rule : R.best;
  const stake = rule && !rule.ok ? 0 : Math.max(0, stakeFor(chosen.p, chosen.odds));
  const today = new Date().toDateString();
  const spentToday = S.journal.filter((b) => new Date(b.created).toDateString() === today).reduce((a, b) => a + b.stake, 0);
  let call;
  if (rule && rule.ok) call = `<div class="callout good"><b>Pari validé : ${SEL[rule.k]} · ${esc(name(rule.k))} @ ${fmtOdds(rule.odds)}</b><br>Avantage ${fmtPct(rule.edge, 1)} sur le prix juste du marché. Conforme à la stratégie championne (${esc(bandPhrase(champ))}, ${esc(S.bt.labels.group[champ.group])}). Mise conseillée : <b>${fmtEur(stake, 2)}</b> (${S.settings.staking === "kelly" ? `Kelly ×${S.settings.kelly}, plafond ${fmtPct(S.settings.cap, 0, false)}` : `${fmtPct(S.settings.flat, 1, false)} de la bankroll`}).</div>`;
  else if (rule && rule.passes && !rule.inBand) call = `<div class="callout"><b>Value hors stratégie.</b> ${SEL[rule.k]} @ ${fmtOdds(rule.odds)} offre ${fmtPct(rule.edge, 1)}, mais la stratégie ne joue que ${esc(bandPhrase(champ))}. Hors de cette plage, le backtest n'a pas trouvé d'avantage durable : passe ou mise très petit.</div>`;
  else if (rule && !S.groups[champ.group].includes(R.lg)) call = `<div class="callout">Championnat hors stratégie.</div>`;
  else if (rule) call = `<div class="callout bad"><b>Pas de value.</b> Stake paie moins que le prix juste sur les trois issues (meilleur écart : ${fmtPct(rule.edge, 1)} sur ${SEL[rule.k]}). Ne joue pas ce match.</div>`;
  else call = `<div class="callout ${R.best.edge > 0 ? "" : "bad"}"><b>${R.best.edge > 0 ? `Value possible sur ${SEL[R.best.k]} · ${esc(name(R.best.k))} @ ${fmtOdds(R.best.odds)} (${fmtPct(R.best.edge, 1)})` : "Pas de value visible"}</b><br>Estimation sans cotes de référence (${esc(R.src)}). Ajoute les cotes d'un 2ᵉ bookmaker pour appliquer la règle validée.</div>`;
  if (spentToday + stake > S.settings.dailyLimit) call += `<div class="callout bad" style="margin-top:8px">Avec ce pari tu dépasserais ta limite du jour (${fmtEur(S.settings.dailyLimit)}). Déjà misé aujourd'hui : ${fmtEur(spentToday, 2)}.</div>`;
  host.innerHTML = `
    <div class="panel-head"><h2>3 · Le verdict</h2><span class="sub">Marge de Stake sur ce match : <b class="num">${fmtPct(R.margin, 1, false)}</b> · proba : ${esc(R.src)}</span></div>
    <div class="verdicts">${R.tiles.map((t) => `<div class="vt ${t.edge > 0 && (!rule || (rule.k === t.k && rule.ok)) ? "value" : ""}">
      <h4>${SEL[t.k]} · ${esc(name(t.k))}</h4>
      <div class="line"><span>Proba juste</span><b>${fmtPct(t.p, 1, false)}</b></div>
      <div class="line"><span>Cote juste</span><b>${fmtOdds(t.fair)}</b></div>
      <div class="line"><span>Cote Stake</span><b>${fmtOdds(t.odds)}</b></div>
      <div class="edge ${cls(t.edge)}">${fmtPct(t.edge, 1)}</div></div>`).join("")}</div>
    <div style="margin-top:12px">${call}</div>
    <div class="row" style="margin-top:12px">
      <div class="field" style="width:130px"><label for="st-amt">Mise (€)</label><input class="input num" id="st-amt" inputmode="decimal" value="${stake > 0 ? stake.toFixed(2) : ""}"></div>
      <div class="field" style="width:150px"><label for="st-sel">Issue</label><select class="input" id="st-sel">${[0, 1, 2].map((k) => `<option value="${k}" ${k === chosen.k ? "selected" : ""}>${SEL[k]} · ${esc(name(k))}</option>`).join("")}</select></div>
      <button class="btn" id="st-add" style="align-self:flex-end">Ajouter au journal</button>
    </div>`;
  $("#st-add").onclick = () => {
    const k = +$("#st-sel").value, amt = pnum($("#st-amt").value);
    if (!(amt > 0)) { toast("Mise manquante", "Indique un montant supérieur à 0 €."); return; }
    S.journal.unshift({
      id: Date.now().toString(36), created: Date.now(), key: f?.key || null, lg: R.lg, t: f?.t || Date.now(),
      label: f ? `${teamLabel(f.h)} – ${teamLabel(f.a)}` : st.label || "Match", sel: k, odds: R.ex[k], stake: amt,
      p: R.pFair[k], edge: R.pFair[k] * R.ex[k] - 1, status: "open",
    });
    saveJournal();
    if (f) { S.follows.add(f.key); saveFollows(); }
    toast("Pari ajouté", `${SEL[k]} @ ${fmtOdds(R.ex[k])} · ${fmtEur(amt, 2)}. Il se règlera tout seul au score final.`, "i-target");
    S.ui.stakeTab = "journal"; RENDER.stake();
  };
}

function renderJournal(host) {
  const js = journalStats();
  const settled = S.journal.filter((b) => b.status === "won" || b.status === "lost").slice().sort((a, b) => a.t - b.t);
  host.innerHTML = `
  <div class="kpis" style="margin-top:0">
    <div class="kpi"><div class="k">Bankroll</div><div class="v">${fmtEur(S.settings.bankroll + js.profit, 2)}</div></div>
    <div class="kpi"><div class="k">Résultat</div><div class="v ${cls(js.profit)}">${fmtEur(js.profit, 2, true)}</div></div>
    <div class="kpi"><div class="k">ROI</div><div class="v ${cls(js.roi)}">${fmtPct(js.roi)}</div></div>
    <div class="kpi"><div class="k">Misé</div><div class="v">${fmtEur(js.turnover, 0)}</div></div>
    <div class="kpi"><div class="k">En cours</div><div class="v">${js.open}</div></div>
  </div>
  ${settled.length >= 2 ? `<section class="glass panel" style="margin-top:14px"><div class="panel-head"><h2>Évolution de la bankroll</h2></div><div id="jr-chart"></div></section>` : ""}
  <section class="glass panel" style="margin-top:14px">
    <div class="panel-head"><h2>Historique</h2><span class="sub">Stocké uniquement dans ce navigateur</span></div>
    ${S.journal.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Match</th><th>Issue</th><th class="n">Cote</th><th class="n">Mise</th><th class="n">Résultat</th><th></th></tr></thead><tbody>
    ${S.journal.map((b) => {
      const pl = b.status === "won" ? b.stake * (b.odds - 1) : b.status === "lost" ? -b.stake : 0;
      return `<tr><td class="mono" style="white-space:nowrap">${fmtDate(b.t, { day: "2-digit", month: "2-digit" })}</td><td>${esc(b.label)}${b.score ? ` <span class="muted mono">${b.score[0]}–${b.score[1]}</span>` : ""}</td><td>${SEL[b.sel]}</td>
      <td class="n">${fmtOdds(b.odds)}</td><td class="n">${fmtEur(b.stake, 2)}</td>
      <td class="n">${b.status === "open" ? `<span class="tag info">en cours</span>` : b.status === "void" ? `<span class="tag ft">annulé</span>` : `<b class="${cls(pl)}">${fmtEur(pl, 2, true)}</b>`}</td>
      <td style="white-space:nowrap">${b.status === "open" ? `<button class="btn small ghost" data-j="won" data-id="${b.id}">Gagné</button> <button class="btn small ghost" data-j="lost" data-id="${b.id}">Perdu</button> ` : ""}<button class="btn small ghost" data-j="del" data-id="${b.id}" aria-label="Supprimer">${icon("i-x")}</button></td></tr>`;
    }).join("")}</tbody></table></div>` : `<div class="empty">Ton journal est vide. Vérifie un pari dans l'onglet « Vérifier un pari » puis ajoute-le ici.</div>`}
  </section>`;
  $$("[data-j]", host).forEach((b) => b.onclick = () => {
    const i = S.journal.findIndex((x) => x.id === b.dataset.id);
    if (i < 0) return;
    if (b.dataset.j === "del") S.journal.splice(i, 1); else S.journal[i].status = b.dataset.j;
    saveJournal(); RENDER.stake();
  });
  if (settled.length >= 2) {
    let bank = S.settings.bankroll;
    const pts = [{ x: dateToDay(new Date(settled[0].t)) - 1, y: bank }];
    for (const b of settled) { bank += b.status === "won" ? b.stake * (b.odds - 1) : -b.stake; pts.push({ x: dateToDay(new Date(b.t)) + pts.length * 1e-3, y: bank }); }
    new LineChart($("#jr-chart"), 180).set(pts, { baseline: S.settings.bankroll, yfmt: (v) => fmtN(v) + " €", tip: (p) => `${fmtDate(dayToDate(Math.floor(p.x)))} · <b>${fmtEur(p.y, 2)}</b>` });
  }
}
