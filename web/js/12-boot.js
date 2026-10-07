/* ============================== boot ============================== */
function tick() {
  const now = Date.now();
  for (const el of $$("[data-cd]")) {
    const t = +el.dataset.cd;
    el.textContent = t > now ? countdownShort(t - now, !!el.dataset.cdc) : "kick-off";
  }
  for (const el of $$("[data-cdbig]")) {
    const { d, h, m, s } = countdownParts(+el.dataset.cdbig - now), p = (x) => String(x).padStart(2, "0");
    const parts = { d, h: p(h), m: p(m), s: p(s) };
    for (const u of el.querySelectorAll("[data-u]")) { const v = String(parts[u.dataset.u]); if (u.textContent !== v) { u.textContent = v; u.classList.remove("tickf"); void u.offsetWidth; u.classList.add("tickf"); } }
  }
  const c = $("#clock");
  if (c) c.textContent = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  // kick-off reminders for picks, starred matches and open bets
  for (const f of S.fixtures) {
    if (f.t < now - 6e4 || f.t > now + 16 * 6e4 || !watched(f)) continue;
    const label = `${teamLabel(f.h)} vs ${teamLabel(f.a)}`;
    if (f.t - now <= 15 * 6e4 && f.t > now) notify("kickoff", "Kick-off in 15 min", label, "ko15|" + f.key);
    if (f.t <= now) notify("kickoff", "Kick-off", label, "ko|" + f.key);
  }
}
function announcePicks() {
  const now = Date.now();
  for (const p of S.picks) {
    if (p.f.t < now || p.f.t > now + 2 * DAY) continue;
    notify("picks", `New pick: ${selText(p.f, p.sel)}`, `${teamLabel(p.f.h)} vs ${teamLabel(p.f.a)} · min odds ${fmtOdds(minOdds(p.p))} · ${fmtWhen(p.f.t)}`, "pick|" + p.f.key + "|" + p.sel);
  }
}
function bindChrome() {
  $("#btn-qr").onclick = () => openSheet($("#modal-qr"), renderQR);
  $("#side-qr").onclick = () => openSheet($("#modal-qr"), renderQR);
  $("#btn-notif").onclick = () => openSheet($("#sheet-notif"), renderNotifSheet);
  $("#btn-settings").onclick = () => openSheet($("#sheet-settings"), renderSettings);
  $("#scrim").onclick = closeSheet;
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const v = a.getAttribute("href").slice(1);
    if (VIEWS.includes(v)) { e.preventDefault(); go(v); }
  });
}
async function boot() {
  bindChrome();
  startBackground?.();
  go(location.hash.slice(1) || "home", false);
  try {
    initData(await loadPayload());
  } catch (e) {
    $("#view-home").innerHTML = `<section class="panel glass"><h2>Couldn't load the data</h2><p class="muted">This browser can't unpack the embedded data (${esc(e?.message || e)}). Update it (Chrome, Safari 16.4+, Firefox 113+).</p></section>`;
    console.error(e);
    return;
  }
  S.ready = true;
  go(location.hash.slice(1) || "home", false);
  renderStatus(); updateBadge(); settleJournal(); announcePicks(); renderSidebar();
  setInterval(tick, 1000);
  liveLoop(true);
  if (window.claude?.use) {
    window.claude.use("sample").then(async (s) => {
      if (!s) return;
      S.ai.sample = s;
      try { const lim = await s.limits(); S.ai.hasImages = !!lim.images; S.ai.hasTools = !!lim.tools; } catch { /* limits unavailable */ }
      if (["ai", "stake"].includes(S.view)) RENDER[S.view]();
    }).catch(() => {});
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
