/* ============================== boot ============================== */
function tick() {
  const now = Date.now();
  tickClock();
  for (const el of $$("[data-cd]")) {
    const t = +el.dataset.cd;
    el.textContent = t > now ? countdownShort(t - now, !!el.dataset.cdc) : "coup d'envoi";
  }
  for (const el of $$("[data-cdbig]")) el.innerHTML = cdBig(+el.dataset.cdbig - now);
  // kickoff reminders for followed matches, picks and open bets
  for (const f of S.fixtures) {
    if (f.t < now - 6e4 || f.t > now + 16 * 6e4 || !watched(f)) continue;
    const label = `${teamLabel(f.h)} – ${teamLabel(f.a)}`;
    if (f.t - now <= 15 * 6e4 && f.t > now) notify("kickoff", "Coup d'envoi dans 15 min", label, "ko15|" + f.key);
    if (f.t <= now) notify("kickoff", "C'est parti", label, "ko|" + f.key);
  }
}
function announcePicks() {
  const now = Date.now();
  for (const f of S.fixtures) {
    if (!f.pick || f.t < now || f.t > now + 2 * DAY) continue;
    notify("value", `Value : ${SEL[f.pick.k]} ${selLabel(f, f.pick.k)}`, `${teamLabel(f.h)} – ${teamLabel(f.a)} @ ${fmtOdds(f.pick.odds)} (${fmtPct(f.pick.edge, 1)}) · ${fmtDayHead(f.t)} ${fmtTime(f.t)}`, "pick|" + f.key);
  }
}
function bindChrome() {
  $("#btn-qr").onclick = () => openSheet($("#modal-qr"), renderQR);
  $("#btn-notif").onclick = () => openSheet($("#sheet-notif"), renderNotifSheet);
  $("#btn-settings").onclick = () => openSheet($("#sheet-settings"), renderSettings);
  $("#scrim").onclick = closeSheet;
  $$("#nav a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); go(a.dataset.view); }));
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && !a.closest("#nav")) { const v = a.getAttribute("href").slice(1); if (VIEWS.includes(v)) { e.preventDefault(); go(v); } }
  });
}
async function boot() {
  bindChrome();
  startBackground();
  go(location.hash.slice(1) || "home", false);
  try {
    initData(await loadPayload());
  } catch (e) {
    $("#view-home").innerHTML = `<div class="glass panel"><h2>Chargement impossible</h2><p class="muted">Ce navigateur ne sait pas décompresser les données embarquées (${esc(e?.message || e)}). Mets-le à jour (Chrome, Safari 16.4+, Firefox 113+).</p></div>`;
    return;
  }
  S.ready = true;
  go(location.hash.slice(1) || "home", false);
  renderStatus(); updateBadge(); settleJournal(); announcePicks();
  setInterval(tick, 1000);
  liveLoop(true);
  if (window.claude?.use) {
    window.claude.use("sample").then(async (s) => {
      if (!s) return;
      S.ai.sample = s;
      try { const lim = await s.limits(); S.ai.hasImages = !!lim.images; S.ai.hasTools = !!lim.tools; } catch { /* limits unavailable */ }
      if (["ia", "stake"].includes(S.view)) RENDER[S.view]();
    }).catch(() => {});
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
