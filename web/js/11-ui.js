/* ============================== sheets: QR, notifications, settings ============================== */
const LINKS = window.ABYSSE_LINKS || {};
function framedInClaude() {
  try { return window.top !== window.self || /claudeusercontent|claude\.ai/.test(location.hostname); } catch { return true; }
}
function shareCandidates() {
  const list = [];
  if (S.settings.shareUrl) list.push(["My link", S.settings.shareUrl]);
  if (!framedInClaude() && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)) list.push(["This page", location.href.split("#")[0]]);
  if (LINKS.pages) list.push(["Live web app", LINKS.pages]);
  if (LINKS.artifact) list.push(["Claude version", LINKS.artifact]);
  return list.filter((x, i, a) => a.findIndex((y) => y[1] === x[1]) === i);
}
function drawQR(host, text) {
  host.innerHTML = "";
  if (typeof window.qrcode !== "function") { host.innerHTML = `<p class="qr-missing">The QR generator couldn't load. Copy the link below instead.</p>`; return; }
  const qr = window.qrcode(0, "M");
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), px = 10, size = n * px, cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, size, size);
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fill(); };
  const finder = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
  c.fillStyle = "#06122e";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k) && !finder(r, k)) rr(k * px + 0.8, r * px + 0.8, px - 1.6, px - 1.6, 3);
  for (const [r, k] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const g = c.createLinearGradient(k * px, r * px, (k + 7) * px, (r + 7) * px);
    g.addColorStop(0, "#3b82ff"); g.addColorStop(1, "#06122e");
    c.fillStyle = g; rr(k * px, r * px, 7 * px, 7 * px, 16);
    c.fillStyle = "#fff"; rr((k + 1) * px, (r + 1) * px, 5 * px, 5 * px, 11);
    c.fillStyle = "#06122e"; rr((k + 2) * px, (r + 2) * px, 3 * px, 3 * px, 7);
  }
  cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "QR code for " + text);
  host.appendChild(cv);
}
function renderQR() {
  const el = $("#modal-qr"), cands = shareCandidates();
  const cur = S.ui.qrUrl && cands.some((c) => c[1] === S.ui.qrUrl) ? S.ui.qrUrl : cands[0]?.[1] || "";
  S.ui.qrUrl = cur;
  el.innerHTML = `
    <div class="sheet-head"><h2>Open on your phone</h2><button class="icon-btn" data-close aria-label="Close">${icon("i-x")}</button></div>
    ${cands.length > 1 ? `<div class="seg qr-seg">${cands.map(([l, u]) => `<button data-qr="${esc(u)}" aria-pressed="${u === cur}">${esc(l)}</button>`).join("")}</div>` : ""}
    <div class="qr-box" id="qr-box"></div>
    <p class="muted center">Point your phone's camera at the code, then tap the link that pops up.</p>
    <div class="row nowrap"><input class="input" id="qr-url" value="${esc(cur)}" placeholder="Paste the link to share" aria-label="QR code link"><button class="btn primary icon-only" id="qr-copy" aria-label="Copy link">${icon("i-copy")}</button></div>`;
  if (cur) drawQR($("#qr-box"), cur); else $("#qr-box").innerHTML = `<p class="qr-missing">Paste a link below.</p>`;
  $$("[data-qr]", el).forEach((b) => b.onclick = () => { S.ui.qrUrl = b.dataset.qr; renderQR(); });
  $("[data-close]", el).onclick = closeSheet;
  $("#qr-url").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (/^https?:\/\/\S+$/.test(v)) { S.settings.shareUrl = v; saveSettings(); S.ui.qrUrl = v; drawQR($("#qr-box"), v); }
  });
  $("#qr-copy").onclick = () => {
    const v = $("#qr-url").value;
    navigator.clipboard?.writeText(v).then(() => toast("Link copied", v, "i-copy"), () => { $("#qr-url").select(); toast("Link selected", "Copy it with Ctrl+C or a long press."); });
  };
}

function renderNotifSheet() {
  const el = $("#sheet-notif");
  const ic = (k) => (k === "goals" ? "i-goal" : k === "picks" ? "i-target" : "i-bell");
  el.innerHTML = `
    <div class="sheet-head"><h2>Notifications</h2><button class="icon-btn" data-close aria-label="Close">${icon("i-x")}</button></div>
    ${S.notifications.length ? `<div class="notif-list">${S.notifications.map((n) => `<div class="notif-item ${n.read ? "" : "unread"}"><span class="notif-ic">${icon(ic(n.kind))}</span><div><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div><div class="w">${fmtDate(n.t, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div></div>`).join("")}</div>
      <div class="row"><button class="btn ghost small" id="nt-clear">Clear all</button></div>`
      : `<div class="empty">Nothing yet. Star a match to get a reminder 15 minutes before kick-off, goals and the final score. New picks show up here too.</div>`}`;
  S.notifications.forEach((n) => (n.read = true));
  store.set("notifications", S.notifications);
  updateBadge();
  $("[data-close]", el).onclick = closeSheet;
  $("#nt-clear")?.addEventListener("click", () => { S.notifications = []; store.set("notifications", []); renderNotifSheet(); });
}

function renderSettings() {
  const el = $("#sheet-settings"), st = S.settings, test = S.data.bt.stats.test;
  const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span></span></label>`;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  el.innerHTML = `
    <div class="sheet-head"><h2>Settings</h2><button class="icon-btn" data-close aria-label="Close">${icon("i-x")}</button></div>

    <div class="set-group">
      <div class="set-label">Bankroll</div>
      <div class="set-row"><div><div class="l">Starting bankroll</div><div class="d">Your bets are added on top of it. Stakes follow your current bankroll.</div></div><input class="input num w-110" id="set-bank" inputmode="decimal" value="${st.bankroll}" aria-label="Starting bankroll"></div>
      <div class="set-row"><div class="l">Currency</div><div class="seg">${["USD", "EUR", "GBP"].map((c) => `<button data-cur="${c}" aria-pressed="${st.currency === c}">${c === "USD" ? "$" : c === "EUR" ? "€" : "£"}</button>`).join("")}</div></div>
    </div>

    <div class="set-group">
      <div class="set-label">Risk level</div>
      <div class="risk-list">${RISK_PROFILES.map((r) => { const t = test[String(r.f)]; return `
        <button class="risk ${riskF() === r.f ? "on" : ""}" data-risk="${r.f}">
          <span class="risk-name">${r.name}${r.f === M().kelly_f ? ` <em>recommended</em>` : ""}</span>
          <span class="risk-note">${r.note}</span>
          <span class="risk-res">Since Jul 2020: ${fmtMoney(1000)} → <b>${fmtMoney(t.final)}</b> · worst dip ${fmtPct(-t.maxdd, 0)}</span>
        </button>`; }).join("")}</div>
    </div>

    <div class="set-group">
      <div class="set-label">Notifications</div>
      <div class="set-row"><div><div class="l">New picks</div><div class="d">When the method finds a bet</div></div>${sw("n-picks", st.notif.picks)}</div>
      <div class="set-row"><div><div class="l">Kick-off reminders</div><div class="d">15 min before picks, starred matches and your bets</div></div>${sw("n-kickoff", st.notif.kickoff)}</div>
      <div class="set-row"><div><div class="l">Goals</div><div class="d">Live, in the hosted version</div></div>${sw("n-goals", st.notif.goals)}</div>
      <div class="set-row"><div><div class="l">Bet results</div></div>${sw("n-results", st.notif.results)}</div>
      <div class="set-row"><div><div class="l">System notifications</div><div class="d">${perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked by the browser" : perm === "unsupported" ? "Not available here" : "Show alerts even when the tab is in the background"}</div></div>${perm === "granted" ? sw("n-browser", st.browser) : `<button class="btn ghost small" id="n-ask" ${perm === "denied" || perm === "unsupported" ? "disabled" : ""}>Allow</button>`}</div>
    </div>

    <div class="set-group">
      <div class="set-label">My leagues</div>
      <div class="chips">${Object.entries(S.data.fx.leagues).filter(([, v]) => v.of).map(([c, v]) => `<button class="chip-btn" data-set-lg="${c}" aria-pressed="${st.leagues.includes(c)}">${esc(v.name)}</button>`).join("")}</div>
    </div>

    <div class="set-group">
      <div class="set-label">Data</div>
      <p class="muted small">Built ${fmtDate(Date.parse(S.data.fx.generated), { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} · history to ${esc(S.data.bt.data_to)} · Elo ${esc(S.data.fx.elo_snapshot)}. ${S.live.mode === "live" ? "Live scores on." : "Live scores are off in this copy of the app."}</p>
      <div class="row"><button class="btn ghost small" id="set-reset">Reset my bets and settings</button></div>
    </div>
    <p class="muted small fine">Betting is gambling. Even a winning method goes through long losing runs, and bookmakers often limit winning accounts. Only bet money you can afford to lose. Help: BeGambleAware.org · Joueurs Info Service 09 74 75 13 13.</p>`;
  const rer = () => renderSettings();
  $("[data-close]", el).onclick = closeSheet;
  $("#set-bank").onchange = (e) => { const v = parseFloat(String(e.target.value).replace(",", ".")); if (v > 0) { st.bankroll = v; saveSettings(); refreshView(); } };
  $$("[data-cur]", el).forEach((b) => b.onclick = () => { st.currency = b.dataset.cur; saveSettings(); rer(); refreshView(); });
  $$("[data-risk]", el).forEach((b) => b.onclick = () => { st.risk = +b.dataset.risk; saveSettings(); rer(); refreshView(); });
  $$("[data-set-lg]", el).forEach((b) => b.onclick = () => {
    const c = b.dataset.setLg, i = st.leagues.indexOf(c);
    if (i >= 0) st.leagues.splice(i, 1); else st.leagues.push(c);
    saveSettings(); b.setAttribute("aria-pressed", st.leagues.includes(c)); refreshView();
  });
  for (const k of ["picks", "kickoff", "goals", "results"]) $("#n-" + k).onchange = (e) => { st.notif[k] = e.target.checked; saveSettings(); };
  $("#n-browser")?.addEventListener("change", (e) => { st.browser = e.target.checked; saveSettings(); });
  $("#n-ask")?.addEventListener("click", async () => {
    try { const r = await Notification.requestPermission(); st.browser = r === "granted"; saveSettings(); if (r === "granted") new Notification("Abysse", { body: "Notifications are on." }); } catch { /* frame refuses */ }
    rer();
  });
  $("#set-reset").onclick = (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed) {
      S.journal = []; saveJournal(); Object.assign(st, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      st.leagues = Object.keys(S.data.fx.leagues).filter((c) => S.data.fx.leagues[c].of);
      saveSettings(); S.follows.clear(); saveFollows(); toast("Reset done"); rer(); refreshView();
    } else {
      b.dataset.armed = "1"; b.textContent = "Tap again to confirm"; b.classList.remove("ghost"); b.classList.add("danger");
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Reset my bets and settings"; b.classList.add("ghost"); b.classList.remove("danger"); } }, 4000);
    }
  };
}
function refreshView() { if (S.ready && RENDER[S.view]) RENDER[S.view](); }
