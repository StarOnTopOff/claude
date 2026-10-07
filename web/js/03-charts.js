/* ============================== bankroll chart (SVG) ============================== */
const RM = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_MS = 365.25 * DAY;

function hermiteSlopes(xs, ys) {
  const n = xs.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1);
  m[0] = d[0] || 0; m[n - 1] = d[n - 2] || 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
}
function monoPath(P) {
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), m = hermiteSlopes(xs, ys);
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const h = xs[i + 1] - xs[i];
    d += `C${(xs[i] + h / 3).toFixed(1)},${(ys[i] + m[i] * h / 3).toFixed(1)} ${(xs[i + 1] - h / 3).toFixed(1)},${(ys[i + 1] - m[i + 1] * h / 3).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return d;
}
let chartSeq = 0;
class EquityChart {
  constructor(host, o = {}) {
    this.host = host; this.o = o; this.id = "ec" + (++chartSeq);
    host.classList.add("chart");
    host.innerHTML = `<svg aria-label="${esc(o.label || "Bankroll growth chart")}" role="img"></svg><div class="tip"><b></b><span></span></div>`;
    this.svg = host.querySelector("svg"); this.tip = host.querySelector(".tip");
    const id = this.id;
    this.svg.innerHTML = `<defs>
      <linearGradient id="${id}s" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#2556e8" stop-opacity=".75"/><stop offset=".55" stop-color="#5a96ff"/><stop offset="1" stop-color="#d4efff"/></linearGradient>
      <linearGradient id="${id}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4f8dff" stop-opacity=".42"/><stop offset=".55" stop-color="#2a66ff" stop-opacity=".10"/><stop offset="1" stop-color="#2a66ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}x" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#cfe6ff" stop-opacity=".55"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>
      <filter id="${id}g" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
      <clipPath id="${id}c"><rect x="0" y="-20" width="0" height="2000"/></clipPath></defs>`;
    this.clip = this.svg.querySelector("clipPath rect");
    this.gGrid = svgEl("g", {}, this.svg); this.gAx = svgEl("g", {}, this.svg); this.gReg = svgEl("g", {}, this.svg);
    const gData = svgEl("g", { "clip-path": `url(#${id}c)` }, this.svg);
    this.pArea = svgEl("path", { fill: `url(#${id}a)` }, gData);
    this.pGlow = svgEl("path", { fill: "none", stroke: "#4f8dff", "stroke-width": 7, "stroke-opacity": .5, filter: `url(#${id}g)` }, gData);
    this.pLine = svgEl("path", { fill: "none", stroke: `url(#${id}s)`, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, gData);
    this.gDD = svgEl("g", { class: "dd", opacity: 0 }, this.svg);
    this.ddDot = svgEl("circle", { r: 3.2, fill: "#050b1e", stroke: "#ff8fa0", "stroke-width": 1.5 }, this.gDD);
    this.ddTxt = svgEl("text", { "text-anchor": "middle" }, this.gDD);
    this.cross = svgEl("line", { stroke: `url(#${id}x)`, "stroke-width": 1, opacity: 0 }, this.svg);
    this.head = svgEl("g", {}, this.svg);
    this.halo = svgEl("circle", { r: 6, fill: "#9fd2ff", class: "halo" }, this.head);
    svgEl("circle", { r: 7, fill: "#9fd2ff", opacity: .18 }, this.head);
    svgEl("circle", { r: 3.6, fill: "#f2f9ff" }, this.head);
    this.hov = svgEl("circle", { r: 4.5, fill: "#f2f9ff", stroke: "#2a66ff", "stroke-width": 2, opacity: 0 }, this.svg);
    host.addEventListener("pointermove", (e) => this.onMove(e));
    host.addEventListener("pointerdown", (e) => this.onMove(e));
    host.addEventListener("pointerleave", () => this.onLeave());
    host.addEventListener("pointercancel", () => this.onLeave());
    this.ro = new ResizeObserver(() => { if (this.data) this.draw(false); });
    this.ro.observe(host);
  }
  set(data, opt = {}) {
    this.data = data.length > 1 ? data : [data[0] || { t: 0, v: 1 }, { t: (data[0]?.t || 0) + DAY, v: data[0]?.v || 1 }];
    Object.assign(this.o, opt);
    this.draw(opt.animate ?? "first");
  }
  layout() {
    const W = this.host.clientWidth, H = this.host.clientHeight;
    if (!W || !H) return null;
    let data = this.data;
    const maxPts = Math.max(60, Math.floor(W / 2.5));
    if (data.length > maxPts) { const k = Math.ceil(data.length / maxPts); data = data.filter((p, i) => i % k === 0 || i === data.length - 1); }
    const desk = innerWidth >= 1100, padR = desk ? 30 : 22, padT = 18, padB = 26;
    const vals = data.map((p) => p.v), log = !!this.o.log;
    let vmax = Math.max(...vals), vmin = Math.min(...vals);
    if (log) { vmin = Math.log(Math.max(vmin * 0.9, 1e-6)); vmax = Math.log(vmax * 1.08); }
    else { vmax *= 1.05; vmin = this.o.zero ? 0 : vmin - (vmax - vmin) * 0.08; }
    if (vmax - vmin < 1e-9) vmax = vmin + 1;
    const t0 = data[0].t, t1 = data[data.length - 1].t;
    const X = (t) => (t - t0) / ((t1 - t0) || 1) * (W - padR);
    const Y = (v) => padT + (1 - ((log ? Math.log(Math.max(v, 1e-6)) : v) - vmin) / (vmax - vmin)) * (H - padT - padB);
    return { W, H, data, P: data.map((p) => [X(p.t), Y(p.v)]), X, Y, vmin, vmax, padB, t0, t1, desk, log };
  }
  draw(animate) {
    const g = this.layout();
    if (!g) { cancelAnimationFrame(this.raf); return; }
    this.geo = g;
    const { W, H, P, X, Y, vmin, vmax, padB, t0, t1, desk, log } = g;
    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const line = monoPath(P), base = H - padB + 2;
    this.pLine.setAttribute("d", line); this.pGlow.setAttribute("d", line);
    this.pArea.setAttribute("d", `${line}L${P[P.length - 1][0].toFixed(1)},${base}L${P[0][0].toFixed(1)},${base}Z`);
    // horizontal grid with money labels
    this.gGrid.innerHTML = ""; this.gAx.innerHTML = ""; this.gReg.innerHTML = "";
    const gx = desk ? 0 : 20, money = (v) => CUR() + (v >= 1e6 ? nf1.format(v / 1e6) + "M" : v >= 1e4 ? nf0.format(v / 1e3) + "k" : v >= 1e3 ? nf1.format(v / 1e3).replace(/\.0$/, "") + "k" : nf0.format(v));
    const ticks = [];
    if (log) {
      for (let e = Math.floor(vmin / Math.LN10) - 1; e <= Math.ceil(vmax / Math.LN10); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (Math.log(v) > vmin && Math.log(v) < vmax) ticks.push(v); }
    } else {
      const span = vmax - vmin, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
      for (let v = Math.ceil(vmin / step) * step; v < vmax; v += step) ticks.push(v);
    }
    for (const v of ticks) {
      const y = Y(v);
      if (y < 14 || y > H - padB - 4) continue;
      svgEl("line", { x1: gx, x2: W, y1: y, y2: y, class: "gl" }, this.gGrid);
      svgEl("text", { x: gx, y: y - 5, class: "ax" }, this.gAx).textContent = money(v);
    }
    // shaded periods (e.g. the out-of-sample test)
    for (const r of this.o.regions || []) {
      const a = Math.max(0, X(r.from)), b = Math.min(W, X(r.to));
      if (b - a < 2) continue;
      svgEl("rect", { x: a, y: 0, width: b - a, height: H - padB, fill: r.fill }, this.gReg);
      if (r.label && b - a > 70) svgEl("text", { x: a + 6, y: 12, class: "ax", fill: r.ink || "" }, this.gReg).textContent = r.label;
    }
    // x ticks
    const xt = [], d0 = new Date(t0), d1 = new Date(t1);
    if (t1 - t0 > 2.2 * YEAR_MS) {
      const yrs = d1.getFullYear() - d0.getFullYear(), every = Math.max(1, Math.ceil(yrs / Math.max(3, Math.floor(W / 64))));
      for (let y = d0.getFullYear() + 1; y <= d1.getFullYear(); y++) if ((y - d0.getFullYear() - 1) % every === 0) xt.push([new Date(y, 0, 1).getTime(), String(y)]);
    } else {
      const c = new Date(d0.getFullYear(), d0.getMonth() + 1, 1), every = t1 - t0 > YEAR_MS * 1.2 ? 4 : t1 - t0 > YEAR_MS * 0.5 ? 2 : 1;
      while (c.getTime() < t1) { if (c.getMonth() % every === 0) xt.push([c.getTime(), MON[c.getMonth()] + (c.getMonth() === 0 ? " ’" + String(c.getFullYear()).slice(2) : "")]); c.setMonth(c.getMonth() + 1); }
    }
    for (const [t, l] of xt) { const x = X(t); if (x < 26 || x > W - 30) continue; svgEl("text", { x, y: H - 7, class: "ax", "text-anchor": "middle" }, this.gAx).textContent = l; }
    // max drawdown trough
    let pk = 0, dd = 0, trT = null;
    this.data.forEach((p) => { if (p.v > pk) pk = p.v; const x = 1 - p.v / pk; if (x > dd) { dd = x; trT = p; } }); // on the full series, not the thinned one
    if (trT && dd > 0.08) {
      const x = X(trT.t), y = Y(trT.v);
      this.ddDot.setAttribute("cx", x); this.ddDot.setAttribute("cy", y);
      this.ddTxt.setAttribute("x", Math.min(Math.max(x, 20), W - 20)); this.ddTxt.setAttribute("y", Math.min(y + 17, H - padB - 2));
      this.ddTxt.textContent = "−" + Math.round(dd * 100) + "%";
      this.gDD.dataset.on = 1;
    } else this.gDD.dataset.on = "";
    this.reveal(animate);
  }
  yAtX(x) {
    if (!this.geo) return 0;
    const P = this.geo.P;
    for (let i = 1; i < P.length; i++) if (P[i][0] >= x) { const f = (x - P[i - 1][0]) / ((P[i][0] - P[i - 1][0]) || 1); return P[i - 1][1] + f * (P[i][1] - P[i - 1][1]); }
    return P[P.length - 1][1];
  }
  vAtX(x) {
    if (!this.geo) return 0;
    const P = this.geo.P, D = this.geo.data;
    for (let i = 1; i < P.length; i++) if (P[i][0] >= x) { const f = (x - P[i - 1][0]) / ((P[i][0] - P[i - 1][0]) || 1); return D[i - 1].v + f * (D[i].v - D[i - 1].v); }
    return D[D.length - 1].v;
  }
  reveal(animate) {
    cancelAnimationFrame(this.raf);
    const { W, P, data } = this.geo, end = P[P.length - 1];
    const finish = () => {
      this.clip.setAttribute("width", W + 40);
      this.head.setAttribute("transform", `translate(${end[0]},${end[1]})`);
      this.gDD.setAttribute("opacity", this.gDD.dataset.on ? 1 : 0);
      this.halo.style.display = "";
      this.o.onProgress?.(data[data.length - 1].v, true);
    };
    if (!animate || RM) return finish();
    const dur = animate === "first" ? 1700 : 1000, t0 = performance.now(), delay = animate === "first" ? 300 : 0;
    this.gDD.setAttribute("opacity", 0); this.halo.style.display = "none";
    const ease = (t) => 1 - Math.pow(1 - t, 3.2);
    const frame = (now) => {
      if (!this.geo || !this.host.isConnected) return;
      const k = Math.min(1, Math.max(0, (now - t0 - delay) / dur)), x = P[0][0] + ease(k) * (end[0] - P[0][0]);
      this.clip.setAttribute("width", x + 6);
      this.head.setAttribute("transform", `translate(${x},${this.yAtX(x)})`);
      this.o.onProgress?.(this.vAtX(x), false);
      if (k < 1) this.raf = requestAnimationFrame(frame); else finish();
    };
    this.raf = requestAnimationFrame(frame);
  }
  onMove(e) {
    const g = this.geo;
    if (!g) return;
    const r = this.host.getBoundingClientRect(), x = e.clientX - r.left;
    let best = 0, bd = Infinity;
    g.P.forEach((p, i) => { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = i; } });
    const [px, py] = g.P[best], pt = g.data[best];
    this.cross.setAttribute("x1", px); this.cross.setAttribute("x2", px); this.cross.setAttribute("y1", 0); this.cross.setAttribute("y2", g.H - g.padB); this.cross.setAttribute("opacity", 1);
    this.hov.setAttribute("cx", px); this.hov.setAttribute("cy", py); this.hov.setAttribute("opacity", 1);
    this.tip.querySelector("b").textContent = fmtMoney(pt.v);
    this.tip.querySelector("span").textContent = fmtDate(pt.t, { month: "short", day: "numeric", year: "numeric" });
    const tw = this.tip.offsetWidth, tx = Math.min(Math.max(px, tw / 2 + 8), g.W - tw / 2 - 8);
    this.tip.style.left = tx + "px"; this.tip.style.top = Math.max(0, py - 62) + "px";
    this.host.classList.add("hover");
    this.o.onScrub?.(pt);
  }
  onLeave() {
    if (!this.geo) return;
    this.cross.setAttribute("opacity", 0); this.hov.setAttribute("opacity", 0); this.host.classList.remove("hover");
    this.o.onScrub?.(null);
  }
}

/* yearly return bars (HTML) */
function yearBars(host, years) {
  const vals = years.map(([, v]) => v), mx = Math.max(...vals.map(Math.abs), 0.01);
  host.innerHTML = `<div class="ybars">${years.map(([y, v], i) => {
    const h = Math.max(3, Math.abs(v) / mx * 86);
    return `<div class="ybar ${v < 0 ? "neg" : ""}" title="${y}: ${fmtPct(v, 1)}"><b style="bottom:calc(${h}% + 24px)">${fmtPct(v, 0)}</b><i style="height:${h}%;animation-delay:${i * 60}ms"></i><span>’${String(y).slice(2)}</span></div>`;
  }).join("")}</div>`;
}
