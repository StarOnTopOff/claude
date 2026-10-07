/* ============================== app shell: nav bubble, liquid-glass lenses, ocean ============================== */
function movePill() {
  const i = Math.max(0, VIEWS.indexOf(S.view));
  $("#tabbar")?.style.setProperty("--k", i);
  $("#side-nav")?.style.setProperty("--k", i);
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === S.view));
}

/* Chromium can bend the backdrop through an SVG displacement map: real refraction at the glass edge. */
const CHROMIUM = /Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS/.test(navigator.userAgent);
function lensMap(W, H, rad, band) {
  const k = 0.5, w = Math.ceil(W * k), h = Math.ceil(H * k), c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d"), img = ctx.createImageData(w, h), D = img.data;
  for (let j = 0; j < h; j++) {
    const py = (j + 0.5) / k, dy = py - H / 2, qy = Math.abs(dy) - (H / 2 - rad);
    for (let i = 0; i < w; i++) {
      const px = (i + 0.5) / k, dx = px - W / 2, qx = Math.abs(dx) - (W / 2 - rad);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), out = Math.hypot(ox, oy);
      const dist = -(out + Math.min(Math.max(qx, qy), 0) - rad);
      let nx = 0, ny = 0;
      if (qx > 0 && qy > 0) { nx = ox / (out || 1); ny = oy / (out || 1); } else if (qx > qy) nx = 1; else ny = 1;
      if (dx < 0) nx = -nx;
      if (dy < 0) ny = -ny;
      let m = dist < band ? 1 - Math.max(dist, 0) / band : 0;
      m *= m;
      const o = (j * w + i) * 4;
      D[o] = 128 - nx * m * 127; D[o + 1] = 128 - ny * m * 127; D[o + 2] = 128; D[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
let lensTimer = 0;
function buildLenses() {
  clearTimeout(lensTimer);
  lensTimer = setTimeout(() => {
    if (!CHROMIUM || matchMedia("(prefers-reduced-transparency: reduce)").matches) return;
    const defs = $("#lensDefs");
    defs.innerHTML = "";
    $$(".lens").forEach((el, n) => {
      const W = el.offsetWidth, H = el.offsetHeight;
      if (!W || !H || W * H > 2.2e6 || getComputedStyle(el).display === "none" || !el.offsetParent && getComputedStyle(el).position !== "fixed") return;
      const cs = getComputedStyle(el), rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, W / 2, H / 2);
      const band = Math.min(26, W / 2, H / 2), sc = el.classList.contains("tabbar") ? 34 : 44, id = "lens" + n;
      defs.insertAdjacentHTML("beforeend", `
        <filter id="${id}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feImage href="${lensMap(W, H, rad, band)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="map"/>
          <feDisplacementMap in="SourceGraphic" in2="map" scale="${sc}" xChannelSelector="R" yChannelSelector="G" result="dR"/>
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
          <feDisplacementMap in="SourceGraphic" in2="map" scale="${sc * 0.9}" xChannelSelector="R" yChannelSelector="G" result="dG"/>
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
          <feDisplacementMap in="SourceGraphic" in2="map" scale="${sc * 0.8}" xChannelSelector="R" yChannelSelector="G" result="dB"/>
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
          <feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/>
        </filter>`);
      const bf = `url(#${id}) blur(${el.classList.contains("tabbar") ? 18 : 22}px) saturate(165%) brightness(1.05)`;
      el.style.backdropFilter = bf; el.style.webkitBackdropFilter = bf;
    });
  }, 900); // after entrance animations have settled
}

/* marine snow + bokeh */
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function startBackground() {
  const cv = $("#snow"), cx = cv.getContext("2d");
  let parts = [], CW = 0, CH = 0;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2); CW = innerWidth; CH = innerHeight;
    cv.width = CW * dpr; cv.height = CH * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = mulberry(5), n = Math.min(150, Math.round(CW * CH / 8000));
    parts = Array.from({ length: n }, (_, i) => {
      const bokeh = i % 9 === 0;
      return { x: r() * CW, y: r() * CH, r: bokeh ? 5 + r() * 10 : 0.5 + r() * 1.4, a: bokeh ? 0.05 + r() * 0.07 : 0.14 + r() * 0.5, vy: 0.04 + r() * 0.18, ph: r() * 6.28, sw: 0.1 + r() * 0.3, bokeh };
    });
    if (RM) draw(0);
  };
  const draw = (t) => {
    cx.clearRect(0, 0, CW, CH);
    for (const p of parts) {
      if (!RM) { p.y += p.vy; p.x += Math.sin(t * 0.00035 + p.ph) * p.sw * 0.35; if (p.y > CH + 20) { p.y = -20; p.x = Math.random() * CW; } }
      const a = p.a * (1 - Math.min(1, p.y / CH) * 0.55) * (0.75 + 0.25 * Math.sin(t * 0.0012 + p.ph * 3));
      if (p.bokeh) {
        const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(170,215,255,${a})`); g.addColorStop(1, "rgba(170,215,255,0)");
        cx.fillStyle = g;
      } else cx.fillStyle = `rgba(200,230,255,${a})`;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
    }
  };
  size();
  let rT;
  addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { size(); buildLenses(); movePill(); }, 160); });
  if (!RM) { const loop = (t) => { if (!document.hidden) draw(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  // specular highlight follows the pointer on glass
  document.addEventListener("pointermove", (e) => {
    const g = e.target.closest?.(".glass");
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty("--mx", (e.clientX - r.left) + "px"); g.style.setProperty("--my", (e.clientY - r.top) + "px");
  }, { passive: true });
  const topbar = $("#topbar");
  const onScroll = () => topbar.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
}

/* sidebar: today's exposure, mini QR, data status */
function renderSidebar() {
  const today = S.picks.filter((p) => dayDiff(p.f.t) === 0);
  const stakes = stakesFor(today);
  const tot = stakes.reduce((a, b) => a + b, 0), bank = currentBankroll();
  const placed = today.filter((p) => S.journal.some((b) => b.key === p.f.key && b.sel === p.sel)).length;
  $("#side-today").innerHTML = `<div class="eyebrow">Today · at risk</div>
    <div class="row"><span class="big">${fmtMoney(tot)}</span><span class="s">${today.length} of ${M().cfg.K} picks</span></div>
    <div class="expo" aria-hidden="true">${stakes.map((s, i) => `<i class="${placed > i ? "p" : ""}" style="flex:${Math.max(s, bank * 0.004)}"></i>`).join("")}<i class="rest" style="flex:${Math.max(bank - tot, 1)}"></i></div>
    <div class="legend">${bank ? fmtPct(tot / bank, 1, false) : "0%"} of bankroll · ${placed} placed</div>`;
  $("#side-nmatch").textContent = upcoming().filter((f) => f.t < Date.now() + 7 * DAY).length || "";
  const st = $("#side-status");
  st.classList.toggle("on", S.live.mode === "live");
  st.querySelector("span").textContent = S.live.mode === "live" ? "Live data · refreshed automatically" : `Snapshot · built ${fmtDate(Date.parse(S.data.fx.generated), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
  const g = $("#greet"), nextK = upcoming().find((f) => f.t > Date.now());
  g.querySelector("h1").textContent = new Intl.DateTimeFormat(LOCALE, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const nToday = S.picks.filter((p) => dayDiff(p.f.t) === 0).length;
  g.querySelector("p").innerHTML = `${nToday ? `${nToday} pick${nToday > 1 ? "s" : ""} today` : "No pick today yet"}${nextK ? ` · next kick-off <b data-cd="${nextK.t}">${countdownShort(nextK.t - Date.now())}</b>` : ""}`;
  const mini = $("#side-qr-mini"), url = shareCandidates()[0]?.[1];
  if (url && mini.dataset.url !== url) { drawQR(mini, url); mini.dataset.url = url; }
}
