/* ============================== IA ============================== */
function teamForm(team, n = 5) {
  const out = [];
  for (const r of S.results) {
    if (r.h !== team && r.a !== team) continue;
    const gf = r.h === team ? r.s[0] : r.s[1], ga = r.h === team ? r.s[1] : r.s[0];
    out.push(gf > ga ? "V" : gf === ga ? "N" : "D");
    if (out.length >= n) break;
  }
  return out;
}
function fixtureBrief(f) {
  const p = f.pFair;
  return {
    date: new Date(f.t).toISOString().slice(0, 16).replace("T", " ") + " UTC", league: S.fx.leagues[f.lg].name,
    home: teamLabel(f.h), away: teamLabel(f.a), elo: [Math.round(S.ratings[f.h] || 0), Math.round(S.ratings[f.a] || 0)],
    probs_1N2: p ? p.map((x) => +x.toFixed(3)) : null, fair_odds_1N2: p ? p.map((x) => +(1 / x).toFixed(2)) : null, prob_source: f.fairSrc,
    form_home: teamForm(f.h).join(""), form_away: teamForm(f.a).join(""),
    bet365: f.b365 || null, best_odds: f.max || null, champion_pick: f.pick ? { outcome: SEL[f.pick.k], odds: f.pick.odds, edge: +f.pick.edge.toFixed(3) } : null,
    live: f.live ? `${f.live.hs}-${f.live.as} ${f.live.detail || ""}` : null,
  };
}
function stratBrief(s) {
  return { rule: stratRule(s), bets: s.n, roi_train: s.roi_tr, roi_val: s.roi_va, roi_test_out_of_sample: s.roi_te, bets_test: s.n_te, max_drawdown_units: s.mdd, smoothness_r2: s.r2 };
}
function aiContext() {
  const b = S.bt, ch = strat(b.champion), js = journalStats();
  return [
    "Tu es l'analyste de l'appli Abysse (value betting football). Réponds en français, de façon directe et concise (listes courtes, chiffres précis).",
    "Règles : ne promets jamais de gain ; rappelle que l'avantage est mince et incertain ; la seule stratégie validée hors-échantillon consiste à miser quand la cote disponible (Stake pour l'utilisateur) dépasse le prix juste du marché (cotes d'un autre bookmaker sans marge), sur des cotes ≤ 1,60. Les estimations du modèle Elo seules ne sont pas rentables d'après le backtest : présente-les comme indicatives. Encourage une mise raisonnable (Kelly fractionné) et le jeu responsable si l'utilisateur parle de se refaire, de dettes ou de miser gros.",
    `Données : ${fmtN(b.n_matches)} matchs ${b.data_from}→${b.data_to}, ${b.n_tested} stratégies testées, périodes entraînement ${b.splits.train.join("-")}, validation ${b.splits.val.join("-")}, test ${b.splits.test[0]}→.`,
    "Stratégie championne : " + JSON.stringify(stratBrief(ch)),
    "Choix naïf (meilleure en entraînement seulement) : " + JSON.stringify(stratBrief(strat(b.trap))),
    `Réglages utilisateur : bankroll ${S.settings.bankroll} €, mise ${S.settings.staking === "kelly" ? "Kelly ×" + S.settings.kelly + " plafonnée à " + S.settings.cap * 100 + " %" : S.settings.flat * 100 + " % par pari"}. Journal : ${S.journal.length} paris, résultat ${js.profit.toFixed(2)} €.`,
    `Date actuelle : ${new Date().toISOString()}. Matchs des 4 prochains jours (extrait) : ` + JSON.stringify(upcoming().filter((f) => f.t < Date.now() + 4 * DAY).slice(0, 40).map(fixtureBrief)),
  ].join("\n\n");
}
const AI_TOOLS = () => [
  {
    name: "get_matches", description: "Liste des matchs à venir (jusqu'à 40) avec probabilités, cotes justes, Elo, forme récente et éventuel pari recommandé. Filtres optionnels : team (nom d'équipe), league (nom du championnat), days (horizon en jours, défaut 7).",
    inputSchema: { type: "object", properties: { team: { type: "string" }, league: { type: "string" }, days: { type: "number" } } },
    execute(i) {
      const days = Number(i.days) || 7, team = String(i.team || ""), lg = String(i.league || "").toLowerCase();
      return upcoming().filter((f) => f.t < Date.now() + days * DAY)
        .filter((f) => !team || Math.max(nameSim(team, teamLabel(f.h)), nameSim(team, teamLabel(f.a)), nameSim(team, f.h), nameSim(team, f.a)) >= 0.6)
        .filter((f) => !lg || S.fx.leagues[f.lg].name.toLowerCase().includes(lg)).slice(0, 40).map(fixtureBrief);
    },
  },
  {
    name: "check_stake_odds", description: "Évalue des cotes Stake 1N2 pour un match : renvoie la cote juste, l'avantage par issue et la mise conseillée selon la règle championne. Paramètres : home, away (noms), stake_odds [1,N,2], ref_odds [1,N,2] optionnel (autre bookmaker).",
    inputSchema: { type: "object", properties: { home: { type: "string" }, away: { type: "string" }, stake_odds: { type: "array", items: { type: "number" } }, ref_odds: { type: "array", items: { type: "number" } } }, required: ["stake_odds"] },
    execute(i) {
      const ex = (i.stake_odds || []).map(Number);
      if (ex.length !== 3 || !ex.every((x) => x > 1)) throw new Error("stake_odds doit contenir 3 cotes décimales > 1");
      const r = parseStakeText(`${i.home || ""}\n${i.away || ""}`), f = r.fixture;
      const ref = Array.isArray(i.ref_odds) && i.ref_odds.length === 3 ? i.ref_odds.map(Number) : f && validOdds(f.b365) ? f.b365 : null;
      const pElo = f ? f.pElo : null;
      const p = ref ? novigPower(ref) : pElo;
      if (!p) return { error: "Match inconnu et pas de cotes de référence : impossible d'estimer le prix juste." };
      const champ = strat(S.bt.champion), rule = ref && f ? applyRule(champ, f.lg, ref, ex, pElo) : null;
      return { match: f ? `${teamLabel(f.h)} - ${teamLabel(f.a)}` : null, prob_source: ref ? "référence sans marge" : "Elo (indicatif)", fair_odds: p.map((x) => +(1 / x).toFixed(2)), edges: p.map((x, k) => +(x * ex[k] - 1).toFixed(3)), champion_rule_ok: rule ? rule.ok : null, suggested_stake_eur: rule && rule.ok ? +stakeFor(rule.p, rule.odds).toFixed(2) : 0 };
    },
  },
];

RENDER.ia = function () {
  const el = $("#view-ia"), ai = S.ai;
  const nextBig = upcoming().filter((f) => f.t > Date.now() && f.t < Date.now() + 7 * DAY && ["E0", "SP1", "D1", "I1", "F1"].includes(f.lg)).sort((a, b) => (S.ratings[b.h] + S.ratings[b.a]) - (S.ratings[a.h] + S.ratings[a.a]))[0];
  const sugg = [
    "Quels favoris surveiller sur Stake ce week-end ?",
    "Explique-moi la stratégie championne simplement.",
    nextBig ? `Analyse ${teamLabel(nextBig.h)} – ${teamLabel(nextBig.a)}.` : null,
    `Combien miser avec ${fmtN(S.settings.bankroll)} € de bankroll ?`,
    "Pourquoi ne pas parier seulement avec les cotes Stake ?",
  ].filter(Boolean);
  el.innerHTML = `
  <div class="page-head"><div><div class="eyebrow">${ai.sample ? "Claude · branché sur tes données" : "Analyste intégré"}</div><h1>Analyste IA</h1>
    <p>${ai.sample ? "Pose tes questions : l'IA lit les matchs, les probabilités, le backtest et ton journal avant de répondre." : "Réponses calculées à partir des données de l'appli. Ouvre la page depuis Claude pour discuter librement avec l'IA."}</p></div></div>
  <section class="glass panel">
    <div class="chat" id="chat">${ai.turns.length ? "" : `<div class="msg bot">Salut. Je connais les ${fmtN(S.bt.n_matches)} matchs du backtest, les ${fmtN(upcoming().length)} matchs à venir et ton journal. Choisis une question ou écris la tienne.</div>`}</div>
    <div class="chips" style="margin:10px 0">${sugg.map((q) => `<button class="fchip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="composer">
      <textarea class="input" id="ai-in" rows="1" placeholder="${ai.sample ? "Écris ta question…" : "Nom d'une équipe, « week-end », « mise »…"}"></textarea>
      <button class="btn" id="ai-send" aria-label="Envoyer">${icon("i-send")}</button>
      <button class="btn ghost" id="ai-stop" hidden>Stop</button>
    </div>
  </section>
  <p class="foot">${ai.sample ? "Chaque question utilise ton propre compte Claude. L'IA ne voit que les données de cette page." : "Mode hors-ligne : les réponses sont générées localement à partir des mêmes données."}</p>`;
  const chat = $("#chat");
  for (const t of ai.turns) chat.insertAdjacentHTML("beforeend", `<div class="msg ${t.role === "user" ? "user" : "bot"}">${esc(t.content)}</div>`);
  chat.scrollTop = chat.scrollHeight;
  $$("[data-q]", el).forEach((b) => b.onclick = () => ask(b.dataset.q));
  const inp = $("#ai-in");
  $("#ai-send").onclick = () => { const q = inp.value.trim(); if (q) { inp.value = ""; ask(q); } };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#ai-send").click(); } });
  $("#ai-stop").onclick = () => ai.ctl?.abort();
};

async function ask(q) {
  const ai = S.ai;
  if (ai.busy) return;
  const chat = $("#chat");
  ai.turns.push({ role: "user", content: q });
  chat.insertAdjacentHTML("beforeend", `<div class="msg user">${esc(q)}</div>`);
  const bubble = document.createElement("div");
  bubble.className = "msg bot thinking";
  bubble.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> Analyse en cours…`;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  if (!ai.sample) {
    await new Promise((r) => setTimeout(r, 450));
    const a = localAnswer(q);
    bubble.classList.remove("thinking"); bubble.textContent = a;
    ai.turns.push({ role: "assistant", content: a });
    chat.scrollTop = chat.scrollHeight;
    return;
  }
  ai.busy = true; ai.ctl = new AbortController();
  $("#ai-send").disabled = true; $("#ai-stop").hidden = false;
  const history = ai.turns.slice(-10);
  const input = [{ role: "user", content: aiContext() }, ...history];
  if (input[1]?.role === "assistant") input.splice(1, 1);
  try {
    const opts = { signal: ai.ctl.signal, cache: false, onText: ({ text }) => { bubble.classList.remove("thinking"); bubble.textContent = text; chat.scrollTop = chat.scrollHeight; } };
    if (ai.hasTools) { delete opts.cache; opts.tools = AI_TOOLS(); }
    const { text, truncated } = await ai.sample(input, opts);
    bubble.classList.remove("thinking");
    bubble.textContent = text + (truncated ? "\n\n(réponse coupée : pose une question plus précise)" : "");
    ai.turns.push({ role: "assistant", content: text });
  } catch (e) {
    bubble.classList.remove("thinking");
    if (e?.code === "cancelled") bubble.textContent = e.text || "Arrêté.";
    else if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)) {
      ai.sample = null;
      const a = localAnswer(q);
      bubble.textContent = a + "\n\n(IA Claude non autorisée sur cette page : réponse de l'analyste intégré.)";
      ai.turns.push({ role: "assistant", content: a });
    } else if (e?.code === "refused") bubble.textContent = "L'IA a refusé cette demande. Reformule ta question.";
    else bubble.textContent = (e?.text ? e.text + "\n\n" : "") + (e?.code === "rate_limited" ? "Trop de questions d'un coup : réessaie dans un moment." : "La réponse a été interrompue. Réessaie.");
  } finally {
    ai.busy = false;
    const s = $("#ai-send"), st = $("#ai-stop");
    if (s) s.disabled = false;
    if (st) st.hidden = true;
    chat.scrollTop = chat.scrollHeight;
  }
}

function localAnswer(q) {
  const ql = q.toLowerCase(), ch = strat(S.bt.champion), now = Date.now();
  const L = [];
  // a team mentioned?
  let hit = null, hs = 0;
  for (const f of upcoming(now)) {  // sorted by kickoff, so ties keep the nearest match
    const s = Math.max(nameSim(q, teamLabel(f.h)), nameSim(q, f.h)) + Math.max(nameSim(q, teamLabel(f.a)), nameSim(q, f.a));
    if (s > hs + 1e-9) { hs = s; hit = f; }
  }
  if (hit && hs >= 0.7 && !/strat|mise|miser|bankroll|stake seul|pourquoi/.test(ql)) {
    const f = hit, p = f.pFair;
    L.push(`${teamLabel(f.h)} – ${teamLabel(f.a)} (${S.fx.leagues[f.lg].name}), ${fmtDayHead(f.t)} à ${fmtTime(f.t)}.`);
    if (p) {
      L.push(`Probabilités (${f.fairSrc}) : ${teamLabel(f.h)} ${fmtPct(p[0], 0, false)}, nul ${fmtPct(p[1], 0, false)}, ${teamLabel(f.a)} ${fmtPct(p[2], 0, false)}.`);
      L.push(`Cotes justes : ${p.map((x, i) => SEL[i] + " " + fmtOdds(1 / x)).join(" · ")}.`);
    }
    L.push(`Elo : ${fmtN(S.ratings[f.h])} contre ${fmtN(S.ratings[f.a])} (écart ${fmtN(S.ratings[f.h] - S.ratings[f.a])}).`);
    const fh = teamForm(f.h), fa = teamForm(f.a);
    if (fh.length || fa.length) L.push(`Forme récente (du plus récent) : ${teamLabel(f.h)} ${fh.join(" ") || "–"} · ${teamLabel(f.a)} ${fa.join(" ") || "–"}.`);
    if (f.pick) L.push(`Pari validé par la règle championne : ${SEL[f.pick.k]} @ ${fmtOdds(f.pick.odds)}, avantage ${fmtPct(f.pick.edge, 1)}, mise ${fmtEur(stakeFor(f.pick.p, f.pick.odds), 2)}.`);
    else if (f.fav && f.fav.fair < ch.hi) L.push(`À surveiller : si Stake paie le ${SEL[f.fav.k]} (${selLabel(f, f.fav.k)}) au-dessus de ${fmtOdds(f.fav.fair)}, il y a value selon le modèle. Confirme avec la cote d'un 2ᵉ bookmaker dans l'onglet Stake.`);
    else L.push(`Le favori est coté au-dessus de ${fmtOdds(ch.hi)} : hors de la plage où la stratégie a un avantage prouvé. Je passerais.`);
    return L.join("\n");
  }
  if (/week|ce soir|surveill|favori|aujourd|demain|quels? match/.test(ql)) {
    const rows = upcoming(now).filter((f) => f.t < now + 4 * DAY && f.fav && f.fav.fair < ch.hi).slice(0, 10);
    if (!rows.length) return "Aucun favori assez net (cote juste < 1,60) dans les 4 prochains jours.";
    L.push(`Favoris éligibles à la stratégie dans les 4 prochains jours (cote juste < ${fmtOdds(ch.hi)}) :`);
    for (const f of rows) L.push(`• ${fmtDate(f.t, { weekday: "short", day: "numeric" })} ${fmtTime(f.t)} · ${teamLabel(f.h)} – ${teamLabel(f.a)} : ${SEL[f.fav.k]} ${selLabel(f, f.fav.k)}, mise si Stake ≥ ${fmtOdds(f.fav.fair)}${f.pick ? " (VALUE confirmée)" : ""}`);
    L.push("Ces cotes justes viennent du modèle Elo : vérifie chaque match avec la cote d'un autre bookmaker avant de miser.");
    return L.join("\n");
  }
  if (/mise|miser|bankroll|combien|kelly/.test(ql)) {
    const bank = S.settings.bankroll, o = 1.45, p = 1 / 1.40;
    const e = p * o - 1, k = Math.min(S.settings.cap, S.settings.kelly * e / (o - 1));
    return [`Avec ${fmtEur(bank)} et ton réglage ${S.settings.staking === "kelly" ? "Kelly ×" + S.settings.kelly : S.settings.flat * 100 + " % fixe"} :`,
      `• Exemple : cote Stake 1,45 alors que le prix juste est 1,40 → avantage ${fmtPct(e, 1)} → mise ${fmtEur(bank * k, 2)} (${fmtPct(k, 2, false)} de la bankroll).`,
      `• La plupart des paris de la stratégie se situent entre 0,5 % et 2 % de la bankroll. Le plafond par pari est ${fmtPct(S.settings.cap, 0, false)}.`,
      "• Sur le backtest, Kelly ×1/4 donne la courbe la plus régulière ; Kelly ×1/2 double les gains mais aussi les creux.",
      `• Ta limite du jour est ${fmtEur(S.settings.dailyLimit)} : modifiable dans Réglages.`].join("\n");
  }
  if (/seul|uniquement|stake|pourquoi/.test(ql)) {
    const sg = strat(S.bt.champion_single);
    return ["Parce que le backtest est clair :",
      `• Les stratégies qui jouent un seul bookmaker contre ses propres cotes ou contre le modèle Elo perdent hors-échantillon. La meilleure d'entre elles faisait ${fmtPct(sg?.roi_va, 1)} en validation et ${fmtPct(sg?.roi_te, 1)} après ${S.bt.splits.test[0]}.`,
      "• La marge du bookmaker (≈ 5 à 7 % sur un 1N2) mange tout avantage d'un modèle simple.",
      `• Ce qui reste rentable : profiter du bookmaker qui paie au-dessus du prix juste du marché. C'est la championne : ${fmtPct(ch.roi_te, 1)} par pari depuis ${S.bt.splits.test[0]} sur ${fmtN(ch.n_te)} paris.`,
      "• Donc : compare toujours Stake à un 2ᵉ bookmaker dans l'onglet Stake. Si Stake ne paie pas plus que le prix juste, tu ne joues pas."].join("\n");
  }
  return [`La stratégie championne : ${stratRule(ch)}`,
    `• ${fmtN(ch.n)} paris depuis 2005, ROI ${fmtPct(ch.roi_tr, 1)} en entraînement, ${fmtPct(ch.roi_va, 1)} en validation, ${fmtPct(ch.roi_te, 1)} hors-échantillon.`,
    `• Courbe très régulière (R² ${nf2.format(ch.r2)}), pire creux ${fmtN(ch.mdd)} unités.`,
    "• En pratique : repère les gros favoris (cote juste ≤ 1,60), compare la cote Stake au prix juste d'un autre bookmaker, mise seulement si Stake paie plus.",
    "Tu peux me demander une équipe, « week-end » ou « combien miser »."].join("\n");
}
