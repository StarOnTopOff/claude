/* ============================== AI analyst ============================== */
function teamForm(team, n = 5) {
  const out = [];
  for (const r of S.results) {
    if (r.h !== team && r.a !== team) continue;
    const gf = r.h === team ? r.s[0] : r.s[1], ga = r.h === team ? r.s[1] : r.s[0];
    out.push(gf > ga ? "W" : gf === ga ? "D" : "L");
    if (out.length >= n) break;
  }
  return out;
}
function fixtureBrief(f) {
  const p = f.pFair;
  return {
    kickoff_utc: new Date(f.t).toISOString().slice(0, 16).replace("T", " "), league: leagueName(f.lg),
    home: teamLabel(f.h), away: teamLabel(f.a), elo: [Math.round(S.ratings[f.h] || 0), Math.round(S.ratings[f.a] || 0)],
    probs_home_draw_away: p ? p.map((x) => +x.toFixed(3)) : null, fair_odds: p ? p.map((x) => +(1 / x).toFixed(2)) : null, prob_source: f.fairSrc,
    form_home: teamForm(f.h).join(""), form_away: teamForm(f.a).join(""),
    pick: f.pick ? { bet: selText(f, f.pick.sel), best_price: f.pick.odds, min_odds_on_stake: +minOdds(f.pick.p).toFixed(2), edge: +f.pick.edge.toFixed(3) } : null,
    live: f.live ? `${f.live.hs}-${f.live.as} ${f.live.detail || ""}` : null,
  };
}
function methodBrief() {
  const st = S.data.bt.stats, f = String(riskF());
  const t = st.test[f], s = st.sel[f];
  return {
    rule: M().summary, max_bets_per_day: M().cfg.K, kelly_fraction: riskF(),
    since_jul_2020: { bets: t.n, roi_per_bet: +t.roi_flat.toFixed(4), bankroll_1000_became: Math.round(t.final), cagr: +t.cagr.toFixed(3), max_drawdown: t.maxdd, per_year: t.years },
    selection_period_2006_2020: { bets: s.n, roi_per_bet: +s.roi_flat.toFixed(4), max_drawdown: s.maxdd },
  };
}
function aiContext() {
  const js = journalStats();
  return [
    "You are the analyst inside Abysse, a football value-betting app. Answer in English, short and concrete (bullets, exact numbers).",
    "Ground rules: never promise profit; the edge is thin and results vary a lot over weeks. The app's method was chosen using 2006-2020 only and then measured on Jul 2020 → today. It bets at most 3 times a day, only when the price beats the fair probability, and sizes stakes with fractional Kelly on the current bankroll. On Stake, a pick is only worth it if Stake's price is at least the 'min odds on Stake'. If the user talks about chasing losses, debt or betting money they need, tell them plainly to stop and point to BeGambleAware / Joueurs Info Service.",
    "Method: " + JSON.stringify(methodBrief()),
    `User: bankroll now ${fmtMoney(currentBankroll(), 2)} (start ${fmtMoney(S.settings.bankroll)}), ${S.journal.length} bets logged, result ${fmtMoney(js.profit, 2, true)}.`,
    `Now: ${new Date().toISOString()}. Today's and upcoming picks: ` + JSON.stringify(S.picks.slice(0, 9).map((p) => fixtureBrief(p.f))),
    "Upcoming matches (excerpt): " + JSON.stringify(upcoming().filter((f) => f.t < Date.now() + 4 * DAY).slice(0, 30).map(fixtureBrief)),
  ].join("\n\n");
}
const AI_TOOLS = () => [
  {
    name: "get_matches", description: "Upcoming matches (max 40) with probabilities, fair odds, Elo, recent form and the app's pick if any. Optional filters: team (name), league (name), days (horizon, default 7).",
    inputSchema: { type: "object", properties: { team: { type: "string" }, league: { type: "string" }, days: { type: "number" } } },
    execute(i) {
      const days = Number(i.days) || 7, team = String(i.team || ""), lg = String(i.league || "").toLowerCase();
      return upcoming().filter((f) => f.t < Date.now() + days * DAY)
        .filter((f) => !team || Math.max(nameSim(team, teamLabel(f.h)), nameSim(team, teamLabel(f.a)), nameSim(team, f.h), nameSim(team, f.a)) >= 0.6)
        .filter((f) => !lg || leagueName(f.lg).toLowerCase().includes(lg)).slice(0, 40).map(fixtureBrief);
    },
  },
  {
    name: "check_stake_price", description: "Check a Stake price for a selection of a match: returns the method's probability, the minimum odds, the edge and the Kelly stake from the user's bankroll. Params: home, away (team names), selection (H, D, A, O or U), stake_odds.",
    inputSchema: { type: "object", properties: { home: { type: "string" }, away: { type: "string" }, selection: { type: "string" }, stake_odds: { type: "number" } }, required: ["home", "away", "selection", "stake_odds"] },
    execute(i) {
      const f = findFixture(`${i.home}\n${i.away}`);
      if (!f) return { error: "Match not found in the upcoming fixtures." };
      const r = checkPrice(f, String(i.selection).toUpperCase(), Number(i.stake_odds));
      return r ? { match: `${teamLabel(f.h)} - ${teamLabel(f.a)}`, ...r } : { error: "No probability available for this selection (no market odds published yet)." };
    },
  },
];

RENDER.ai = function () {
  const el = $("#view-ai"), ai = S.ai;
  const next = S.picks.find((p) => p.f.t > Date.now());
  const sugg = [
    "Explain today's picks in simple words.",
    "How did the method do since 2020, year by year?",
    next ? `Should I bet ${selText(next.f, next.sel)}?` : null,
    `How much should I stake with ${fmtMoney(currentBankroll())}?`,
    "Why max 3 bets a day?",
  ].filter(Boolean);
  el.innerHTML = `
  <header class="page-head">
    <div class="eyebrow">${ai.sample ? "Claude · reads your data" : "Built-in analyst"}</div>
    <h1>AI analyst</h1>
    <p>${ai.sample ? "Ask anything. The AI sees today's picks, the backtest, upcoming matches and your bets before it answers." : "Answers computed from the app's own data. Open the app inside Claude to chat freely with the AI."}</p>
  </header>
  <section class="panel glass chat-panel">
    <div class="chat" id="chat">${ai.turns.length ? "" : `<div class="msg bot">Hi. I know the ${fmtN(S.data.bt.bets.d.length)} bets of the backtest, ${fmtN(upcoming().length)} upcoming matches and your betting log. Pick a question or type yours.</div>`}</div>
    <div class="chips">${sugg.map((q) => `<button class="chip-btn" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div class="composer">
      <textarea class="input" id="ai-in" rows="1" placeholder="${ai.sample ? "Ask the AI…" : "A team name, “today”, “stake”…"}" aria-label="Your question"></textarea>
      <button class="btn primary icon-only" id="ai-send" aria-label="Send">${icon("i-send")}</button>
      <button class="btn ghost" id="ai-stop" hidden>Stop</button>
    </div>
  </section>`;
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
  bubble.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> Thinking…`;
  chat.appendChild(bubble);
  chat.scrollTop = chat.scrollHeight;
  if (!ai.sample) {
    await new Promise((r) => setTimeout(r, 400));
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
    bubble.textContent = text + (truncated ? "\n\n(Answer cut short: ask something narrower.)" : "");
    ai.turns.push({ role: "assistant", content: text });
  } catch (e) {
    bubble.classList.remove("thinking");
    if (e?.code === "cancelled") bubble.textContent = e.text || "Stopped.";
    else if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)) {
      ai.sample = null;
      const a = localAnswer(q);
      bubble.textContent = a + "\n\n(Claude isn't allowed on this page, so the built-in analyst answered.)";
      ai.turns.push({ role: "assistant", content: a });
    } else if (e?.code === "refused") bubble.textContent = "The AI declined this one. Try rephrasing.";
    else bubble.textContent = (e?.text ? e.text + "\n\n" : "") + (e?.code === "rate_limited" ? "Too many questions at once. Try again in a moment." : "The answer was interrupted. Try again.");
  } finally {
    ai.busy = false;
    const s = $("#ai-send"), st = $("#ai-stop");
    if (s) s.disabled = false;
    if (st) st.hidden = true;
    chat.scrollTop = chat.scrollHeight;
  }
}

function findFixture(text) {
  let best = null, bs = 0;
  const now = Date.now();
  const lines = String(text).split(/\n| vs | v | - | – /i).map((x) => x.trim()).filter(Boolean);
  for (const f of S.fixtures) {
    if (f.t < now - 3 * 36e5 || f.t > now + 21 * DAY) continue;
    let sh = 0, sa = 0;
    for (const l of lines) { sh = Math.max(sh, nameSim(l, teamLabel(f.h)), nameSim(l, f.h)); sa = Math.max(sa, nameSim(l, teamLabel(f.a)), nameSim(l, f.a)); }
    if (sh + sa > bs + 1e-9) { bs = sh + sa; best = f; }
  }
  return bs >= 1.2 ? best : null;
}

function localAnswer(q) {
  const ql = q.toLowerCase(), now = Date.now(), st = S.data.bt.stats, f = String(riskF());
  const t = st.test[f];
  const L = [];
  // a team mentioned?
  let hit = null, hs = 0;
  for (const fx of upcoming(now)) {
    const s = Math.max(nameSim(q, teamLabel(fx.h)), nameSim(q, fx.h)) + Math.max(nameSim(q, teamLabel(fx.a)), nameSim(q, fx.a));
    if (s > hs + 1e-9) { hs = s; hit = fx; }
  }
  if (hit && hs >= 0.7 && !/since|year|how much|stake with|why/.test(ql)) {
    const fx = hit, p = fx.pFair;
    L.push(`${teamLabel(fx.h)} vs ${teamLabel(fx.a)} (${leagueName(fx.lg)}), ${fmtDayHead(fx.t)} at ${fmtTime(fx.t)}.`);
    if (p) L.push(`Probabilities (${fx.fairSrc}): ${teamLabel(fx.h)} ${fmtPct(p[0], 0, false)}, draw ${fmtPct(p[1], 0, false)}, ${teamLabel(fx.a)} ${fmtPct(p[2], 0, false)}. Fair odds ${p.map((x) => fmtOdds(1 / x)).join(" / ")}.`);
    L.push(`Elo ${fmtN(S.ratings[fx.h])} vs ${fmtN(S.ratings[fx.a])}. Form (latest first): ${teamLabel(fx.h)} ${teamForm(fx.h).join(" ") || "–"}, ${teamLabel(fx.a)} ${teamForm(fx.a).join(" ") || "–"}.`);
    if (fx.pick) {
      const [stake] = stakesFor([fx.pick]);
      L.push(`It's one of the app's picks: ${selText(fx, fx.pick.sel)}, best price ${fmtOdds(fx.pick.odds)}, edge ${fmtPct(fx.pick.edge, 1)}. On Stake, take it only at ${fmtOdds(minOdds(fx.pick.p))} or more. Suggested stake: ${fmtMoney(stake, 2)}.`);
    } else L.push("Not a pick: no price beats the fair odds by enough. I'd skip it.");
    return L.join("\n");
  }
  if (/since|year|2020|backtest|history|track/.test(ql)) {
    L.push(`Since July 2020 (never used to choose the method), at your risk level:`);
    L.push(`• ${fmtN(t.n)} bets, ${fmtPct(t.roi_flat, 1)} profit per bet, ${fmtMoney(1000)} → ${fmtMoney(t.final)} (${fmtPct(t.cagr, 0)} a year), worst dip ${fmtPct(-t.maxdd, 0)}.`);
    for (const [y, v] of Object.entries(t.years)) L.push(`• ${y}: ${fmtPct(v, 1)}`);
    return L.join("\n");
  }
  if (/stake|how much|bankroll|kelly|risk/.test(ql)) {
    const bank = currentBankroll();
    return [`With ${fmtMoney(bank)} and the “${(RISK_PROFILES.find((r) => r.f === riskF()) || {}).name || "custom"}” risk level (Kelly × ${riskF()}):`,
      "• Each pick's stake = bankroll × Kelly fraction × edge ÷ (odds − 1). Bigger edge and shorter odds mean a bigger stake.",
      `• Example: 3% edge at odds 1.50 → ${fmtMoney(bank * riskF() * 0.03 / 0.5, 2)}.`,
      "• Stakes are recalculated from your current bankroll after every settled bet, so they grow when you win and shrink when you lose.",
      "• You can change the risk level in Settings. Higher = faster growth and deeper drawdowns."].join("\n");
  }
  if (/why|3|three|max/.test(ql)) {
    return ["Why max 3 bets a day:",
      "• Most days only a handful of prices really beat the fair odds. Taking the 3 strongest keeps the quality high.",
      "• Fewer simultaneous bets means each one can be sized properly with Kelly without risking too much on one day.",
      `• Over ${fmtN(t.n)} bets since July 2020 it made ${fmtPct(t.roi_flat, 1)} per bet with this cap.`].join("\n");
  }
  const today = S.picks.filter((p) => p.f.t > now - 2 * 36e5).slice(0, 3);
  if (today.length) {
    L.push("Next picks:");
    const stakes = stakesFor(today);
    today.forEach((p, i) => L.push(`• ${fmtWhen(p.f.t)} · ${teamLabel(p.f.h)} vs ${teamLabel(p.f.a)}: ${selText(p.f, p.sel)}, min odds on Stake ${fmtOdds(minOdds(p.p))}, stake ${fmtMoney(stakes[i], 2)}.`));
    L.push("Only bet if Stake's price is at or above the minimum.");
  } else {
    L.push("No picks right now: the bookmaker prices for the next matches aren't published yet, or none beats the fair odds.");
    L.push("The method waits for value instead of forcing bets. Ask me about a team to see its probabilities.");
  }
  return L.join("\n");
}
