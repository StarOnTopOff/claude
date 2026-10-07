/* ============================== Stake: price check + my bets ============================== */
S.ui.stake = { key: null, sel: "H", price: "", tab: "check" };
const pnum = (v) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };

function openStakeFor(key, sel) {
  const st = S.ui.stake;
  st.key = key; st.sel = sel || "H"; st.price = ""; st.tab = "check";
  if (S.view === "stake") RENDER.stake(); else go("stake");
}
function parseStakeText(text) {
  const t = String(text || "").replace(/(\d),(\d)/g, "$1.$2");
  const odds = [];
  for (const m of t.matchAll(/(?<![\d.])(\d{1,3}\.\d{1,3})(?![\d.])/g)) { const v = +m[1]; if (v >= 1.01 && v <= 200) odds.push(v); }
  return { odds, fixture: findFixture(t.replace(/\d+\.\d+/g, " ")) };
}

RENDER.stake = function () {
  const el = $("#view-stake"), st = S.ui.stake;
  el.innerHTML = `
  <header class="page-head" data-enter style="--i:0">
    <div class="eyebrow">Stake</div>
    <h1>${st.tab === "check" ? "Check a price" : "My bets"}</h1>
    <p>${st.tab === "check" ? "Enter the odds Stake offers. The app compares them with the method’s fair price and tells you whether to bet and how much." : "Every bet you log. Open bets settle themselves when the final score comes in, and your bankroll updates the next stakes."}</p>
    <div class="segx" style="align-self:flex-start;margin-top:6px">${[["check", "Check a price"], ["bets", `My bets · ${S.journal.length}`]].map(([k, l]) => `<button data-stab="${k}" aria-pressed="${st.tab === k}">${l}</button>`).join("")}</div>
  </header>
  <div id="stake-body"></div>`;
  $$("[data-stab]", el).forEach((b) => b.onclick = () => { st.tab = b.dataset.stab; RENDER.stake(); });
  if (st.tab === "bets") renderBets($("#stake-body")); else renderCheck($("#stake-body"));
};

function renderCheck(host) {
  const st = S.ui.stake, now = Date.now();
  const opts = upcoming(now).filter((x) => x.t < now + 14 * DAY);
  if (!st.key || !S.fixByKey.get(st.key)) st.key = (S.picks.find((p) => p.f.t > now) || {}).f?.key || opts[0]?.key || null;
  const f = st.key ? S.fixByKey.get(st.key) : null;
  const sels = ["H", "D", "A", "O", "U"];
  host.innerHTML = `
  <div class="check-grid">
    <section class="panel glass check" data-enter style="--i:1">
      <div class="field"><label for="ck-match">Match</label>
        <select class="input" id="ck-match">${opts.map((x) => `<option value="${esc(x.key)}" ${x.key === st.key ? "selected" : ""}>${x.pick ? "★ " : ""}${esc(teamLabel(x.h))} v ${esc(teamLabel(x.a))} · ${esc(fmtWhen(x.t))}</option>`).join("")}</select></div>
      ${f ? `<div class="field"><span class="lbl">Bet</span><div class="sel-row">${sels.map((s) => {
        const mp = methodProb(f, s);
        return `<button class="sel-btn" data-sel="${s}" aria-pressed="${st.sel === s}" ${mp ? "" : "disabled"}><b>${selShort(s)}</b><span>${mp && mp.src !== "elo" ? fmtOdds(minOdds(mp.p)) : mp ? fmtOdds(1 / mp.p) : "–"}</span></button>`;
      }).join("")}</div><span class="muted small">${f.cands || f.watch ? "Under each bet: the lowest Stake odds worth taking." : "Under each bet: fair odds from the Elo model (no bookmaker prices yet)."}</span></div>
      <div class="field"><label for="ck-price">Stake’s odds for “${esc(selText(f, st.sel))}”</label><input class="input num" id="ck-price" inputmode="decimal" placeholder="e.g. 1.47" value="${esc(st.price)}"></div>` : `<div class="empty">No upcoming match in the next 14 days.</div>`}
      <details class="more-box" id="ck-auto"><summary>${icon("i-image", "i")}Fill it from Stake</summary>
        <div class="check">
          <div class="field"><label for="ck-paste">Paste the text you copied on the Stake match page</label><textarea class="input" id="ck-paste" rows="3" placeholder="Arsenal 1.47 Draw 4.60 Leeds United 7.00"></textarea></div>
          <div id="ck-shot" hidden><div class="drop" id="ck-drop">Or drop a screenshot of Stake here: the AI reads the teams and the odds.<br><input type="file" id="ck-file" accept="image/png,image/jpeg,image/webp" style="margin-top:10px;max-width:100%"></div></div>
          <p class="muted small" id="ck-msg"></p>
        </div>
      </details>
    </section>
    <section id="ck-verdict"></section>
  </div>`;
  $("#ck-match")?.addEventListener("change", (e) => { st.key = e.target.value; st.price = ""; const ff = S.fixByKey.get(st.key); st.sel = ff?.pick?.sel || ff?.fav?.sel || "H"; renderCheck(host); });
  $$("[data-sel]", host).forEach((b) => b.onclick = () => { st.sel = b.dataset.sel; renderCheck(host); $("#ck-price")?.focus(); });
  $("#ck-price")?.addEventListener("input", (e) => { st.price = e.target.value; renderVerdict(); });
  $("#ck-paste").addEventListener("input", (e) => {
    const r = parseStakeText(e.target.value), msg = $("#ck-msg");
    if (r.fixture) { st.key = r.fixture.key; }
    const fx = S.fixByKey.get(st.key);
    if (r.odds.length >= 3 && fx) {
      const k = "HDA".indexOf(st.sel);
      st.price = String(r.odds[k >= 0 ? k : 0]);
      renderCheck(host); $("#ck-auto").open = true;
      $("#ck-msg").textContent = `Found ${r.odds.slice(0, 3).map(fmtOdds).join(" / ")}${r.fixture ? ` for ${teamLabel(fx.h)} v ${teamLabel(fx.a)}` : " (match not recognised: pick it in the list)"}.`;
    } else msg.textContent = r.odds.length ? `Only ${r.odds.length} price(s) found: copy the whole 1X2 block.` : "";
  });
  if (S.ai.sample && S.ai.hasImages) setupShot(host);
  renderVerdict();
}

function setupShot(host) {
  $("#ck-shot").hidden = false;
  const drop = $("#ck-drop"), file = $("#ck-file"), st = S.ui.stake;
  const run = async (blob) => {
    const msg = $("#ck-msg");
    msg.innerHTML = `<span class="typing"><i></i><i></i><i></i></span> Reading the screenshot…`;
    try {
      const out = await S.ai.sample.json(
        "This image is a screenshot from a sports betting website (usually Stake). Find the football match shown and its full-time result (1X2 / match winner) decimal odds, and the over/under 2.5 goals odds if visible. " +
        'Reply with only JSON: {"home": string, "away": string, "odds_1x2": [home, draw, away] or null, "odds_ou25": [over, under] or null}. Convert American odds to decimal.',
        { images: blob, modelTier: "quick" });
      const fx = findFixture(`${out?.home}\n${out?.away}`);
      if (fx) st.key = fx.key;
      const o1 = Array.isArray(out?.odds_1x2) ? out.odds_1x2.map(Number) : null, o2 = Array.isArray(out?.odds_ou25) ? out.odds_ou25.map(Number) : null;
      const k = "HDA".indexOf(st.sel), j = "OU".indexOf(st.sel);
      const price = k >= 0 && o1?.[k] > 1 ? o1[k] : j >= 0 && o2?.[j] > 1 ? o2[j] : o1?.[0];
      if (!(price > 1)) { msg.textContent = "I can't see 1X2 odds on this image."; return; }
      st.price = price.toFixed(2);
      renderCheck(host); $("#ck-auto").open = true;
      toast("Odds read by the AI", `${out.home} v ${out.away}${o1 ? " · " + o1.map(fmtOdds).join(" / ") : ""}`, "i-ai");
    } catch (e) {
      if (["not_granted", "sampling_disabled", "images_unavailable", "capability_disabled"].includes(e?.code)) { $("#ck-shot").hidden = true; msg.textContent = ""; }
      else msg.textContent = e?.code === "rate_limited" ? "Too many requests to the AI. Try again in a moment." : "Couldn't read it. Try a sharper screenshot or paste the text.";
    }
  };
  file.addEventListener("change", () => file.files[0] && run(file.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const fl = e.dataTransfer.files[0]; if (fl) run(fl); });
}

function renderVerdict() {
  const host = $("#ck-verdict");
  if (!host) return;
  const st = S.ui.stake, f = S.fixByKey.get(st.key), odds = pnum(st.price);
  if (!f) { host.innerHTML = ""; return; }
  const mp = methodProb(f, st.sel);
  if (!mp) { host.innerHTML = `<article class="verdict glass"><h3>No price yet</h3><p>The bookmakers haven't published odds for this match, so the method can't price it. Come back closer to kick-off.</p></article>`; return; }
  if (!(odds > 1)) {
    host.innerHTML = `<article class="verdict glass" data-enter style="--i:2">
      <span class="eyebrow">${esc(selText(f, st.sel))}</span>
      <h3>${mp.src === "elo" ? "Fair odds " + fmtOdds(1 / mp.p) : "Bet only at " + fmtOdds(minOdds(mp.p)) + " or more"}</h3>
      <p>${mp.src === "elo" ? "Only the Elo model can price this match for now (no bookmaker odds yet). It's shown for information: the method doesn't bet on Elo alone." : "Type Stake's odds for this bet to get the verdict and your stake."}</p></article>`;
    return;
  }
  const r = checkPrice(f, st.sel, odds);
  const bank = currentBankroll();
  const headline = r.ok ? `Bet it: ${esc(selText(f, st.sel))} @ ${fmtOdds(odds)}`
    : r.why === "elo-only" ? "Information only"
    : r.why === "odds-too-high" ? "Outside the method"
    : r.why === "league" ? "League not covered" : "Skip it";
  const text = r.ok ? `Stake pays more than the fair price (${fmtOdds(r.fair_odds)}). The edge is ${fmtPct(r.edge, 1)}, which clears the ${fmtPct(M().cfg.thr, 0, false)} bar. Stake ${fmtMoney(r.stake, 2)}, ${fmtPct(r.stake / bank, 1, false)} of your ${fmtMoney(bank)} bankroll.`
    : r.why === "elo-only" ? "Without bookmaker odds the price comes from the Elo model only. The backtest shows Elo alone isn't enough to bet on."
    : r.why === "odds-too-high" ? `The method only bets odds under ${fmtOdds(M().cfg.hi)}: above that, results were too unstable in the backtest.`
    : r.why === "league" ? "The method doesn't cover this league." : `At ${fmtOdds(odds)} Stake pays ${r.edge >= 0 ? "too little above" : "less than"} the fair price. You need at least ${fmtOdds(r.min_odds)}.`;
  host.innerHTML = `<article class="verdict glass ${r.ok ? "good" : "bad"}" data-enter style="--i:2">
    <span class="eyebrow">${esc(teamLabel(f.h))} v ${esc(teamLabel(f.a))} · ${esc(fmtWhen(f.t))}</span>
    <h3>${headline}</h3><p>${text}</p>
    <dl class="vnums">
      <div><dt>Your price</dt><dd>${fmtOdds(odds)}</dd></div>
      <div><dt>Min odds</dt><dd>${r.source === "elo" ? "–" : fmtOdds(r.min_odds)}</dd></div>
      <div><dt>Edge</dt><dd class="${r.source === "elo" ? "" : cls(r.edge)}">${r.source === "elo" ? "–" : fmtPct(r.edge, 1)}</dd></div>
      <div><dt>Stake</dt><dd>${r.ok ? fmtMoney(r.stake) : "–"}</dd></div>
    </dl>
    ${r.ok ? `<div class="actions"><button class="btn-main" id="ck-log"><span>I placed it</span></button></div>` : ""}
  </article>`;
  $("#ck-log")?.addEventListener("click", () => {
    logBet(f, st.sel, odds, r.stake, r.p);
    toast("Bet logged", `${selText(f, st.sel)} · ${fmtMoney(r.stake, 2)} @ ${fmtOdds(odds)}`, "i-check");
    st.tab = "bets"; RENDER.stake(); renderSidebar();
  });
}

function renderBets(host) {
  const js = journalStats(), bank = currentBankroll();
  const settled = S.journal.filter((b) => b.status === "won" || b.status === "lost").slice().sort((a, b) => a.t - b.t);
  host.innerHTML = `
  <section class="panel glass" data-enter style="--i:1">
    <dl class="bankcard">
      <div><dt class="k">Bankroll</dt><dd class="v">${fmtMoney(bank)}</dd></div>
      <div><dt class="k">Result</dt><dd class="v ${cls(js.profit)}">${fmtMoney(js.profit, 0, true)}</dd></div>
      <div><dt class="k">ROI</dt><dd class="v ${cls(js.roi)}">${fmtPct(js.roi, 1)}</dd></div>
      <div><dt class="k">Open</dt><dd class="v">${js.open}${js.openStake ? `<small class="muted" style="font-size:12px"> · ${fmtMoney(js.openStake)}</small>` : ""}</dd></div>
    </dl>
    ${settled.length >= 2 ? `<div id="bets-chart" style="height:180px;margin-top:14px"></div>` : ""}
  </section>
  <section class="panel glass" data-enter style="--i:2">
    <div class="panel-head"><span class="panel-title">History</span><span class="meta">Saved in this browser only</span></div>
    ${S.journal.length ? `<div class="tbl-wrap"><table class="jtbl"><thead><tr><th>Date</th><th>Bet</th><th class="n">Odds</th><th class="n">Stake</th><th class="n">Result</th><th></th></tr></thead><tbody>
      ${S.journal.map((b) => {
        const pl = b.status === "won" ? b.stake * (b.odds - 1) : b.status === "lost" ? -b.stake : 0;
        const fx = S.fixByKey.get(b.key);
        const lab = fx ? selText(fx, b.sel) : SEL_LABEL[b.sel];
        return `<tr><td class="mono muted" style="white-space:nowrap">${fmtDate(b.t, { month: "short", day: "numeric" })}</td>
          <td><b style="font-weight:500">${esc(lab)}</b><br><span class="muted small">${esc(b.label)}${b.score ? ` · ${b.score[0]}–${b.score[1]}` : ""}</span></td>
          <td class="n">${b.status === "open" ? `<input class="input num" style="width:76px;height:34px" data-edit-odds="${b.id}" value="${fmtOdds(b.odds)}" inputmode="decimal" aria-label="Odds">` : fmtOdds(b.odds)}</td>
          <td class="n">${b.status === "open" ? `<input class="input num" style="width:86px;height:34px" data-edit-stake="${b.id}" value="${b.stake.toFixed(2)}" inputmode="decimal" aria-label="Stake">` : fmtMoney(b.stake, 2)}</td>
          <td class="n">${b.status === "open" ? `<span class="tag info">open</span>` : b.status === "void" ? `<span class="tag ft">void</span>` : `<b class="${cls(pl)}">${fmtMoney(pl, 2, true)}</b>`}</td>
          <td><div class="acts">${b.status === "open" ? `<button class="btn small" data-j="won" data-id="${b.id}">Won</button><button class="btn small" data-j="lost" data-id="${b.id}">Lost</button>` : ""}<button class="btn small icon-only" style="width:34px" data-j="del" data-id="${b.id}" aria-label="Delete">${icon("i-x", "i")}</button></div></td></tr>`;
      }).join("")}</tbody></table></div>`
      : `<div class="empty">No bets yet. Tap “I placed it” on a pick, or check a Stake price and log it.</div>`}
  </section>`;
  $$("[data-j]", host).forEach((b) => b.onclick = () => {
    const i = S.journal.findIndex((x) => x.id === b.dataset.id);
    if (i < 0) return;
    if (b.dataset.j === "del") S.journal.splice(i, 1); else S.journal[i].status = b.dataset.j;
    saveJournal(); RENDER.stake(); renderSidebar();
  });
  $$("[data-edit-odds]", host).forEach((inp) => inp.onchange = () => { const b = S.journal.find((x) => x.id === inp.dataset.editOdds), v = pnum(inp.value); if (b && v > 1) { b.odds = v; saveJournal(); } });
  $$("[data-edit-stake]", host).forEach((inp) => inp.onchange = () => { const b = S.journal.find((x) => x.id === inp.dataset.editStake), v = pnum(inp.value); if (b && v > 0) { b.stake = v; saveJournal(); renderSidebar(); } });
  if (settled.length >= 2) {
    let v = S.settings.bankroll;
    const pts = [{ t: settled[0].t - DAY, v }];
    for (const b of settled) { v += b.status === "won" ? b.stake * (b.odds - 1) : -b.stake; pts.push({ t: Math.max(b.t, pts[pts.length - 1].t + 1), v }); }
    new EquityChart($("#bets-chart"), { label: "Your bankroll" }).set(pts);
  }
}
