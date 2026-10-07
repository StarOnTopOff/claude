/* ============================== canvas charts ============================== */
const CSSV = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

class Chart {
  constructor(host, height) {
    this.host = host;
    host.classList.add("chart");
    host.style.height = height + "px";
    host.innerHTML = `<canvas></canvas><div class="chart-tip" hidden></div>`;
    this.cv = host.querySelector("canvas");
    this.tip = host.querySelector(".chart-tip");
    this.ctx = this.cv.getContext("2d");
    this.progress = 1;
    this.hover = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.cv.addEventListener("pointermove", (e) => this.onMove(e));
    this.cv.addEventListener("pointerleave", () => { this.hover = null; this.tip.hidden = true; this.draw(); });
    this.cv.addEventListener("click", (e) => this.onClick?.(e));
    this.resize();
  }
  resize() {
    const r = this.host.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }
  animate(ms = 900) {
    if (reduceMotion) { this.progress = 1; this.draw(); return; }
    const t0 = performance.now();
    const step = (t) => {
      this.progress = Math.min(1, (t - t0) / ms);
      this.progress = 1 - (1 - this.progress) ** 3;
      this.draw();
      if (this.progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  showTip(x, y, html) {
    this.tip.hidden = false;
    this.tip.innerHTML = html;
    const tw = this.tip.offsetWidth;
    this.tip.style.left = clamp(x, tw / 2 + 4, this.w - tw / 2 - 4) + "px";
    this.tip.style.top = Math.max(y, 40) + "px";
  }
  pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
}

class LineChart extends Chart {
  set(points, o = {}) {
    this.pts = points; this.o = o; this.animate(o.animMs ?? 900);
  }
  scales() {
    const P = this.pts, pad = { l: 8, r: 10, t: 14, b: 22 };
    let x0 = P[0].x, x1 = P[P.length - 1].x;
    if (x1 === x0) x1 = x0 + 1;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of P) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    if (this.o.baseline != null) { y0 = Math.min(y0, this.o.baseline); y1 = Math.max(y1, this.o.baseline); }
    const span = y1 - y0 || Math.abs(y1) || 1;
    y0 -= span * 0.08; y1 += span * 0.1;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * (this.w - pad.l - pad.r);
    const Y = (y) => pad.t + (1 - (y - y0) / (y1 - y0)) * (this.h - pad.t - pad.b);
    return { X, Y, x0, x1, y0, y1, pad };
  }
  draw() {
    const c = this.ctx, P = this.pts;
    if (!P || P.length < 2 || !this.w) { c && c.clearRect(0, 0, this.w || 0, this.h || 0); return; }
    const { X, Y, x0, x1, y0, y1, pad } = this.scales();
    c.clearRect(0, 0, this.w, this.h);
    // regions (train / val / test)
    for (const r of this.o.regions || []) {
      const a = clamp(X(Math.max(r.from, x0)), pad.l, this.w - pad.r), b = clamp(X(Math.min(r.to, x1)), pad.l, this.w - pad.r);
      if (b - a < 1) continue;
      c.fillStyle = r.color; c.fillRect(a, pad.t, b - a, this.h - pad.t - pad.b);
      if (r.label && b - a > 60) { c.fillStyle = r.ink || "rgba(200,215,255,.55)"; c.font = "600 10px " + CSSV("--font-body"); c.fillText(r.label, a + 6, pad.t + 12); }
    }
    // grid + y labels
    c.font = "10.5px " + CSSV("--font-data");
    c.textBaseline = "middle";
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = y0 + ((y1 - y0) * i) / ticks, y = Y(v);
      c.strokeStyle = "rgba(150,190,255,.07)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(this.w - pad.r, y); c.stroke();
      if (i > 0 && i < ticks) { c.fillStyle = "rgba(160,180,220,.55)"; c.fillText((this.o.yfmt || fmtN)(v), pad.l + 4, y - 7); }
    }
    // x labels: years
    c.textBaseline = "alphabetic"; c.fillStyle = "rgba(160,180,220,.55)";
    const yA = dayToDate(x0).getUTCFullYear(), yB = dayToDate(x1).getUTCFullYear();
    const stepY = Math.max(1, Math.ceil((yB - yA + 1) / Math.max(2, Math.floor(this.w / 70))));
    if (yB > yA) {
      for (let y = yA + 1; y <= yB; y += stepY) {
        const x = X(dateToDay(new Date(y, 0, 1)));
        if (x < pad.l + 10 || x > this.w - 24) continue;
        c.fillText(String(y), x - 12, this.h - 6);
      }
    } else {
      const months = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
      const m0 = dayToDate(x0).getUTCMonth(), m1 = dayToDate(x1).getUTCMonth();
      for (let m = m0 + 1; m <= m1; m++) { const x = X(dateToDay(new Date(yA, m, 1))); c.fillText(months[m], x - 10, this.h - 6); }
    }
    // baseline
    if (this.o.baseline != null) {
      c.setLineDash([4, 5]); c.strokeStyle = "rgba(200,215,255,.25)";
      c.beginPath(); c.moveTo(pad.l, Y(this.o.baseline)); c.lineTo(this.w - pad.r, Y(this.o.baseline)); c.stroke(); c.setLineDash([]);
    }
    // line + area up to progress
    const n = Math.max(2, Math.floor(P.length * this.progress));
    const grad = c.createLinearGradient(0, 0, this.w, 0);
    grad.addColorStop(0, "#2f7bff"); grad.addColorStop(1, "#8adcff");
    c.beginPath();
    for (let i = 0; i < n; i++) { const x = X(P[i].x), y = Y(P[i].y); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    const lastX = X(P[n - 1].x), lastY = Y(P[n - 1].y);
    c.save();
    c.lineTo(lastX, this.h - pad.b); c.lineTo(X(P[0].x), this.h - pad.b); c.closePath();
    const ag = c.createLinearGradient(0, pad.t, 0, this.h - pad.b);
    ag.addColorStop(0, "rgba(47,123,255,.32)"); ag.addColorStop(1, "rgba(47,123,255,0)");
    c.fillStyle = ag; c.fill(); c.restore();
    c.beginPath();
    for (let i = 0; i < n; i++) { const x = X(P[i].x), y = Y(P[i].y); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.strokeStyle = grad; c.lineWidth = 2; c.lineJoin = "round";
    c.shadowColor = "rgba(80,150,255,.7)"; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
    // endpoint glow
    c.fillStyle = "#cfeaff"; c.beginPath(); c.arc(lastX, lastY, 3.5, 0, 7); c.fill();
    c.strokeStyle = "rgba(138,220,255,.45)"; c.lineWidth = 6; c.beginPath(); c.arc(lastX, lastY, 7, 0, 7); c.stroke();
    // hover
    if (this.hover != null && this.progress === 1) {
      const p = P[this.hover], x = X(p.x), y = Y(p.y);
      c.strokeStyle = "rgba(200,220,255,.3)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, this.h - pad.b); c.stroke();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill();
    }
  }
  onMove(e) {
    if (!this.pts) return;
    const { x } = this.pos(e), { X, Y } = this.scales();
    let lo = 0, hi = this.pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (X(this.pts[mid].x) < x) lo = mid; else hi = mid; }
    const i = Math.abs(X(this.pts[lo].x) - x) < Math.abs(X(this.pts[hi].x) - x) ? lo : hi;
    this.hover = i; this.draw();
    const p = this.pts[i];
    this.showTip(X(p.x), Y(p.y) - 8, (this.o.tip || ((p) => `${fmtDate(dayToDate(p.x))} · <b>${fmtN(p.y)}</b>`))(p));
  }
}

class BarChart extends Chart {
  set(bars, o = {}) { this.bars = bars; this.o = o; this.animate(o.animMs ?? 700); }
  geom() {
    const B = this.bars, pad = { l: 6, r: 6, t: 12, b: 20 };
    let mx = 0;
    for (const b of B) mx = Math.max(mx, Math.abs(b.v));
    mx = mx || 1;
    const hasNeg = B.some((b) => b.v < 0), hasPos = B.some((b) => b.v > 0);
    const top = pad.t, bot = this.h - pad.b;
    const zero = hasNeg && hasPos ? top + (bot - top) * (Math.max(...B.map((b) => b.v)) / (Math.max(...B.map((b) => b.v)) - Math.min(...B.map((b) => b.v)))) : hasNeg ? top : bot;
    const scale = hasNeg && hasPos ? (bot - top) / (Math.max(...B.map((b) => b.v)) - Math.min(...B.map((b) => b.v))) : (bot - top) / mx;
    const bw = (this.w - pad.l - pad.r) / B.length;
    return { pad, zero, scale, bw };
  }
  draw() {
    const c = this.ctx, B = this.bars;
    if (!B || !B.length || !this.w) return;
    c.clearRect(0, 0, this.w, this.h);
    const { pad, zero, scale, bw } = this.geom();
    c.strokeStyle = "rgba(150,190,255,.15)"; c.beginPath(); c.moveTo(pad.l, zero); c.lineTo(this.w - pad.r, zero); c.stroke();
    const every = Math.max(1, Math.ceil(B.length / Math.floor(this.w / 44)));
    B.forEach((b, i) => {
      const x = pad.l + i * bw + bw * 0.16, w = Math.max(1, bw * 0.68), hgt = Math.abs(b.v) * scale * this.progress;
      const y = b.v >= 0 ? zero - hgt : zero;
      const g = c.createLinearGradient(0, y, 0, y + hgt);
      if (b.v >= 0) { g.addColorStop(0, "rgba(61,220,151,.95)"); g.addColorStop(1, "rgba(61,220,151,.35)"); }
      else { g.addColorStop(0, "rgba(255,95,122,.35)"); g.addColorStop(1, "rgba(255,95,122,.95)"); }
      c.fillStyle = this.hover === i ? (b.v >= 0 ? "#7ff0bd" : "#ff8fa1") : g;
      const r = Math.min(4, w / 2);
      c.beginPath(); c.roundRect ? c.roundRect(x, y, w, Math.max(hgt, 1), r) : c.rect(x, y, w, Math.max(hgt, 1)); c.fill();
      if (i % every === 0) { c.fillStyle = "rgba(160,180,220,.6)"; c.font = "10px " + CSSV("--font-data"); c.textAlign = "center"; c.fillText(b.label, x + w / 2, this.h - 6); c.textAlign = "left"; }
    });
  }
  onMove(e) {
    if (!this.bars) return;
    const { x } = this.pos(e), { pad, bw, zero } = this.geom();
    const i = clamp(Math.floor((x - pad.l) / bw), 0, this.bars.length - 1);
    this.hover = i; this.draw();
    const b = this.bars[i];
    this.showTip(pad.l + i * bw + bw / 2, zero - 10, `${esc(b.full || b.label)} · <b class="${cls(b.v)}">${(this.o.fmt || fmtN)(b.v)}</b>`);
  }
}

class ScatterChart extends Chart {
  set(pts, o = {}) { this.pts = pts; this.o = o; this.animate(o.animMs ?? 800); }
  scales() {
    const pad = { l: 40, r: 12, t: 12, b: 30 }, o = this.o;
    const X = (x) => pad.l + ((x - o.x0) / (o.x1 - o.x0)) * (this.w - pad.l - pad.r);
    const Y = (y) => pad.t + (1 - (y - o.y0) / (o.y1 - o.y0)) * (this.h - pad.t - pad.b);
    return { X, Y, pad };
  }
  draw() {
    const c = this.ctx, P = this.pts, o = this.o;
    if (!P || !this.w) return;
    const { X, Y, pad } = this.scales();
    c.clearRect(0, 0, this.w, this.h);
    c.font = "10px " + CSSV("--font-data"); c.fillStyle = "rgba(160,180,220,.6)";
    for (const v of o.xt) { const x = X(v); c.strokeStyle = v === 0 ? "rgba(200,215,255,.3)" : "rgba(150,190,255,.07)"; c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, this.h - pad.b); c.stroke(); c.fillText(o.fmt(v), x - 12, this.h - 14); }
    for (const v of o.yt) { const y = Y(v); c.strokeStyle = v === 0 ? "rgba(200,215,255,.3)" : "rgba(150,190,255,.07)"; c.beginPath(); c.moveTo(pad.l, y); c.lineTo(this.w - pad.r, y); c.stroke(); c.fillText(o.fmt(v), 2, y + 3); }
    c.fillStyle = "rgba(170,190,230,.75)"; c.font = "600 10.5px " + CSSV("--font-body");
    c.fillText(o.xl, this.w - pad.r - c.measureText(o.xl).width, this.h - 2);
    c.save(); c.translate(11, pad.t + 4); c.fillText(o.yl, 30, 8); c.restore();
    const n = Math.floor(P.length * this.progress);
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (p.hl) continue;
      c.fillStyle = p.c; c.fillRect(X(p.x) - 1.3, Y(p.y) - 1.3, 2.6, 2.6);
    }
    for (const p of P) {
      if (!p.hl) continue;
      const x = X(p.x), y = Y(p.y);
      c.fillStyle = p.c; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
      c.strokeStyle = p.c; c.lineWidth = 2; c.globalAlpha = .45; c.beginPath(); c.arc(x, y, 10, 0, 7); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = "#fff"; c.font = "600 11px " + CSSV("--font-body"); c.fillText(p.hl, x + 13, y + 4);
    }
    if (this.hover != null) { const p = P[this.hover]; c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.beginPath(); c.arc(X(p.x), Y(p.y), 6, 0, 7); c.stroke(); }
  }
  nearest(e) {
    const { x, y } = this.pos(e), { X, Y } = this.scales();
    let best = -1, bd = 144;
    this.pts.forEach((p, i) => { const d = (X(p.x) - x) ** 2 + (Y(p.y) - y) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  onMove(e) {
    if (!this.pts) return;
    const i = this.nearest(e);
    this.hover = i >= 0 ? i : null; this.draw();
    if (i < 0) { this.tip.hidden = true; return; }
    const p = this.pts[i], { X, Y } = this.scales();
    this.showTip(X(p.x), Y(p.y) - 10, this.o.tip(p));
  }
}
