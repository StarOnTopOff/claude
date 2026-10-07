/* ============================== sheets: QR, notifications, settings ============================== */
const LINKS = window.ABYSSE_LINKS || {};
function framedInClaude() {
  try { return window.top !== window.self || /claudeusercontent|claude\.ai/.test(location.hostname); } catch { return true; }
}
function shareCandidates() {
  const list = [];
  if (S.settings.shareUrl) list.push(["Mon lien", S.settings.shareUrl]);
  if (!framedInClaude() && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)) list.push(["Cette page", location.href.split("#")[0]]);
  if (LINKS.artifact) list.push(["Version Claude", LINKS.artifact]);
  if (LINKS.pages) list.push(["Version web (direct)", LINKS.pages]);
  return list.filter((x, i, a) => a.findIndex((y) => y[1] === x[1]) === i);
}
function drawQR(host, text) {
  host.innerHTML = "";
  if (typeof window.qrcode !== "function") { host.innerHTML = `<p style="color:#061230;font-size:13px;padding:10px">Le générateur de QR code n'a pas pu se charger. Copie le lien ci-dessous.</p>`; return; }
  const qr = window.qrcode(0, "M");
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), px = 8, size = n * px, cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, size, size);
  const finder = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    if (!qr.isDark(r, k) || finder(r, k)) continue;
    c.fillStyle = "#071634";
    c.beginPath(); c.roundRect ? c.roundRect(k * px + 0.6, r * px + 0.6, px - 1.2, px - 1.2, 2.4) : c.rect(k * px, r * px, px, px); c.fill();
  }
  for (const [r, k] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const g = c.createLinearGradient(k * px, r * px, (k + 7) * px, (r + 7) * px);
    g.addColorStop(0, "#2f7bff"); g.addColorStop(1, "#071634");
    c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(k * px, r * px, 7 * px, 7 * px, 12) : c.rect(k * px, r * px, 7 * px, 7 * px); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.roundRect ? c.roundRect((k + 1) * px, (r + 1) * px, 5 * px, 5 * px, 8) : c.rect((k + 1) * px, (r + 1) * px, 5 * px, 5 * px); c.fill();
    c.fillStyle = "#071634"; c.beginPath(); c.roundRect ? c.roundRect((k + 2) * px, (r + 2) * px, 3 * px, 3 * px, 5) : c.rect((k + 2) * px, (r + 2) * px, 3 * px, 3 * px); c.fill();
  }
  cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "QR code vers " + text);
  host.appendChild(cv);
}
function renderQR() {
  const el = $("#modal-qr"), cands = shareCandidates();
  const cur = S.ui.qrUrl && cands.some((c) => c[1] === S.ui.qrUrl) ? S.ui.qrUrl : cands[0]?.[1] || "";
  S.ui.qrUrl = cur;
  el.innerHTML = `
    <div class="row" style="justify-content:space-between"><b style="font-family:var(--font-display);font-weight:600">Ouvrir sur ton téléphone</b><button class="icon-btn" data-close aria-label="Fermer">${icon("i-x")}</button></div>
    ${cands.length > 1 ? `<div class="seg" style="margin-top:12px">${cands.map(([l, u]) => `<button data-qr="${esc(u)}" aria-pressed="${u === cur}">${esc(l)}</button>`).join("")}</div>` : ""}
    <div class="qr-box" id="qr-box"></div>
    <p class="muted" style="font-size:13px;margin:0 0 10px">Vise ce code avec l'appareil photo du téléphone, puis touche le lien qui apparaît.</p>
    <div class="row" style="flex-wrap:nowrap"><input class="input" id="qr-url" value="${esc(cur)}" placeholder="Colle le lien à partager" aria-label="Lien du QR code" style="font-size:12.5px"><button class="btn small" id="qr-copy" aria-label="Copier le lien">${icon("i-copy")}</button></div>
    ${!cur ? `<p class="muted" style="font-size:12px;margin:10px 0 0">Colle ici le lien de partage de la page : le QR code se met à jour tout seul.</p>` : ""}`;
  if (cur) drawQR($("#qr-box"), cur); else $("#qr-box").innerHTML = `<p style="color:#061230;font-size:13px">Aucun lien</p>`;
  $$("[data-qr]", el).forEach((b) => b.onclick = () => { S.ui.qrUrl = b.dataset.qr; renderQR(); });
  $("[data-close]", el).onclick = closeSheet;
  $("#qr-url").addEventListener("input", (e) => {
    const v = e.target.value.trim();
    if (/^https?:\/\/\S+$/.test(v)) { S.settings.shareUrl = v; saveSettings(); S.ui.qrUrl = v; drawQR($("#qr-box"), v); }
  });
  $("#qr-copy").onclick = () => {
    const v = $("#qr-url").value;
    navigator.clipboard?.writeText(v).then(() => toast("Lien copié", v, "i-copy"), () => { $("#qr-url").select(); toast("Sélectionné", "Copie le lien avec Ctrl+C ou un appui long."); });
  };
}

function renderNotifSheet() {
  const el = $("#sheet-notif");
  el.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="font-family:var(--font-display);font-weight:600">Notifications</b><button class="icon-btn" data-close aria-label="Fermer">${icon("i-x")}</button></div>
    ${S.notifications.length ? S.notifications.map((n) => `<div class="notif-item"><div class="toast-i">${icon(n.kind === "goals" ? "i-goal" : n.kind === "value" ? "i-target" : "i-bell")}</div><div style="min-width:0"><div class="t">${esc(n.title)}</div><div class="b">${esc(n.body)}</div><div class="w">${fmtDate(n.t, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div></div>`).join("")
      : `<div class="empty">Rien pour l'instant. Suis un match (étoile) pour recevoir le rappel du coup d'envoi, les buts et le score final.</div>`}
    ${S.notifications.length ? `<div class="row" style="margin-top:10px"><button class="btn small ghost" id="nt-clear">Tout effacer</button></div>` : ""}`;
  S.notifications.forEach((n) => (n.read = true));
  store.set("notifications", S.notifications);
  updateBadge();
  $("[data-close]", el).onclick = closeSheet;
  $("#nt-clear")?.addEventListener("click", () => { S.notifications = []; store.set("notifications", []); renderNotifSheet(); });
  $$(".toast-i", el).forEach((x) => { x.style.cssText = "width:30px;height:30px;flex:none;border-radius:10px;display:grid;place-items:center;background:rgba(47,123,255,.25)"; x.querySelector("svg").style.cssText = "width:16px;height:16px"; });
}

function renderSettings() {
  const el = $("#sheet-settings"), st = S.settings;
  const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span></span></label>`;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  el.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="font-family:var(--font-display);font-weight:600">Réglages</b><button class="icon-btn" data-close aria-label="Fermer">${icon("i-x")}</button></div>
    <div class="eyebrow" style="margin-top:10px">Bankroll et mises</div>
    <div class="set-row"><div><div class="l">Bankroll (€)</div><div class="d">Sert au calcul des mises conseillées</div></div><input class="input num" id="set-bank" style="width:110px" inputmode="decimal" value="${st.bankroll}"></div>
    <div class="set-row"><div class="l">Méthode</div><div class="seg">${[["kelly", "Kelly"], ["pct", "% bankroll"]].map(([k, l]) => `<button data-set-st="${k}" aria-pressed="${st.staking === k || (k === "pct" && st.staking === "flat")}">${l}</button>`).join("")}</div></div>
    ${st.staking === "kelly" ? `<div class="set-row"><div><div class="l">Fraction de Kelly</div><div class="d">1/4 = la courbe la plus régulière du backtest</div></div><div class="seg">${[[0.125, "1/8"], [0.25, "1/4"], [0.5, "1/2"]].map(([k, l]) => `<button data-set-k="${k}" aria-pressed="${st.kelly === k}">${l}</button>`).join("")}</div></div>
    <div class="set-row"><div class="l">Plafond par pari</div><div class="seg">${[[0.02, "2 %"], [0.03, "3 %"], [0.05, "5 %"]].map(([k, l]) => `<button data-set-cap="${k}" aria-pressed="${st.cap === k}">${l}</button>`).join("")}</div></div>`
    : `<div class="set-row"><div class="l">Mise par pari</div><div class="seg">${[[0.005, "0,5 %"], [0.01, "1 %"], [0.02, "2 %"]].map(([k, l]) => `<button data-set-f="${k}" aria-pressed="${st.flat === k}">${l}</button>`).join("")}</div></div>`}
    <div class="set-row"><div><div class="l">Limite de mise par jour (€)</div><div class="d">Alerte si un pari la dépasse</div></div><input class="input num" id="set-limit" style="width:110px" inputmode="decimal" value="${st.dailyLimit}"></div>

    <div class="eyebrow" style="margin-top:16px">Notifications</div>
    <div class="set-row"><div><div class="l">Rappel avant le coup d'envoi</div><div class="d">15 min avant les matchs suivis et les paris</div></div>${sw("n-kickoff", st.notif.kickoff)}</div>
    <div class="set-row"><div><div class="l">Buts en direct</div><div class="d">Matchs suivis, version web en direct</div></div>${sw("n-goals", st.notif.goals)}</div>
    <div class="set-row"><div><div class="l">Nouvelles value</div><div class="d">Quand la règle championne trouve un pari</div></div>${sw("n-value", st.notif.value)}</div>
    <div class="set-row"><div><div class="l">Résultats de mes paris</div></div>${sw("n-results", st.notif.results)}</div>
    <div class="set-row"><div><div class="l">Notifications du système</div><div class="d">${perm === "granted" ? "Autorisées" : perm === "denied" ? "Bloquées par le navigateur" : perm === "unsupported" ? "Non disponibles ici" : "Affichées même si l'onglet est en arrière-plan"}</div></div>${perm === "granted" ? sw("n-browser", st.browser) : `<button class="btn small ghost" id="n-ask" ${perm === "denied" || perm === "unsupported" ? "disabled" : ""}>Autoriser</button>`}</div>

    <div class="eyebrow" style="margin-top:16px">Mes championnats</div>
    <div class="chips" style="margin:8px 0">${Object.entries(S.fx.leagues).filter(([, v]) => v.of).map(([c, v]) => `<button class="fchip" data-set-lg="${c}" aria-pressed="${st.leagues.includes(c)}">${esc(v.name)}</button>`).join("")}</div>

    <div class="eyebrow" style="margin-top:16px">Données</div>
    <p class="muted" style="font-size:12.5px;margin:6px 0">Instantané généré le ${fmtDate(Date.parse(S.fx.generated), { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })} · Elo au ${esc(S.fx.elo_snapshot)} · historique jusqu'au ${esc(S.bt.data_to)}. ${S.live.mode === "live" ? "Direct actif (openfootball + ESPN)." : "Direct indisponible sur cette page."}</p>
    <div class="row"><button class="btn small ghost" id="set-reset">Effacer journal et réglages</button></div>
    <div class="callout" style="margin-top:14px;font-size:12.5px"><b>Jeu responsable.</b> Le pari reste un jeu d'argent : même une stratégie positive traverse de longues séries perdantes, et les bookmakers limitent souvent les gagnants. Fixe une limite et tiens-la. Besoin d'aide : Joueurs Info Service, 09 74 75 13 13.</div>`;
  const rer = () => renderSettings();
  $("[data-close]", el).onclick = closeSheet;
  $("#set-bank").onchange = (e) => { const v = pnum(e.target.value); if (v > 0) { st.bankroll = v; saveSettings(); refreshView(); } };
  $("#set-limit").onchange = (e) => { const v = pnum(e.target.value); if (v > 0) { st.dailyLimit = v; saveSettings(); } };
  $$("[data-set-st]", el).forEach((b) => b.onclick = () => { st.staking = b.dataset.setSt; saveSettings(); rer(); refreshView(); });
  $$("[data-set-k]", el).forEach((b) => b.onclick = () => { st.kelly = +b.dataset.setK; saveSettings(); rer(); refreshView(); });
  $$("[data-set-cap]", el).forEach((b) => b.onclick = () => { st.cap = +b.dataset.setCap; saveSettings(); rer(); refreshView(); });
  $$("[data-set-f]", el).forEach((b) => b.onclick = () => { st.flat = +b.dataset.setF; saveSettings(); rer(); refreshView(); });
  $$("[data-set-lg]", el).forEach((b) => b.onclick = () => {
    const c = b.dataset.setLg, i = st.leagues.indexOf(c);
    if (i >= 0) st.leagues.splice(i, 1); else st.leagues.push(c);
    saveSettings(); b.setAttribute("aria-pressed", st.leagues.includes(c)); refreshView();
  });
  for (const k of ["kickoff", "goals", "value", "results"]) $("#n-" + k).onchange = (e) => { st.notif[k] = e.target.checked; saveSettings(); };
  $("#n-browser")?.addEventListener("change", (e) => { st.browser = e.target.checked; saveSettings(); });
  $("#n-ask")?.addEventListener("click", async () => {
    try { const r = await Notification.requestPermission(); st.browser = r === "granted"; saveSettings(); if (r === "granted") new Notification("Abysse", { body: "Notifications activées." }); } catch { /* frame refuses */ }
    rer();
  });
  $("#set-reset").onclick = (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed) { S.journal = []; saveJournal(); Object.assign(st, JSON.parse(JSON.stringify(DEFAULT_SETTINGS))); saveSettings(); S.follows.clear(); saveFollows(); toast("Données effacées"); rer(); refreshView(); }
    else { b.dataset.armed = "1"; b.textContent = "Confirmer l'effacement"; b.classList.remove("ghost"); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Effacer journal et réglages"; b.classList.add("ghost"); } }, 4000); }
  };
}
function refreshView() { if (S.ready && RENDER[S.view]) RENDER[S.view](); }

/* ============================== background: slow deep-blue light field ============================== */
function startBackground() {
  const cv = $("#bg"), c = cv.getContext("2d");
  let w, h, dpr;
  const orbs = [
    { x: .15, y: .1, r: .55, hue: 218, a: .55, sx: .00007, sy: .00005 },
    { x: .85, y: .25, r: .45, hue: 205, a: .35, sx: .00005, sy: .00008 },
    { x: .55, y: .95, r: .6, hue: 226, a: .45, sx: .00006, sy: .00004 },
    { x: .3, y: .6, r: .3, hue: 196, a: .22, sx: .00009, sy: .00006 },
  ];
  const size = () => { dpr = Math.min(1.5, window.devicePixelRatio || 1); w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); addEventListener("resize", size);
  const draw = (t) => {
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "#02040a"; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "lighter";
    const m = Math.max(w, h);
    for (const o of orbs) {
      const x = (o.x + Math.sin(t * o.sx + o.hue) * .08) * w, y = (o.y + Math.cos(t * o.sy + o.hue) * .07) * h, r = o.r * m;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${o.hue},95%,48%,${o.a * .55})`); g.addColorStop(.45, `hsla(${o.hue + 8},90%,30%,${o.a * .22})`); g.addColorStop(1, "hsla(225,90%,10%,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    // faint caustic ribbons
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = "rgba(120,180,255,.035)"; c.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      c.beginPath();
      for (let x = 0; x <= w; x += 24) {
        const y = h * (.18 + k * .17) + Math.sin(x * .004 + t * .00025 + k) * 26 + Math.sin(x * .011 - t * .0004 + k * 2) * 10;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  };
  if (reduceMotion) { draw(0); addEventListener("resize", () => draw(0)); return; }
  let last = 0;
  const loop = (t) => { if (!document.hidden && t - last > 33) { draw(t); last = t; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
