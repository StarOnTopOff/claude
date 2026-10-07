/* ============================== the betting method ============================== */
// Everything here mirrors research/harness.py exactly, so the numbers in the app are
// the numbers of the backtest: same filters, one bet per match, top-K per day,
// fractional Kelly with compounding, never more than the whole bankroll on one day.

function novigPower(odds) {
  const inv = odds.map((o) => 1 / o);
  let lo = 1, hi = 3;
  for (let i = 0; i < 40; i++) {
    const k = (lo + hi) / 2, s = inv.reduce((a, x) => a + x ** k, 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2, p = inv.map((x) => x ** k), s = p.reduce((a, b) => a + b, 0);
  return p.map((x) => x / s);
}
const validOdds = (a) => Array.isArray(a) && a.length >= 2 && a.every((x) => Number.isFinite(x) && x > 1.0);

/* ---------- Elo model (information only, for matches without bookmaker odds) ---------- */
function eloProbs(lg, team1, team2) {
  const eh = S.ratings[team1], ea = S.ratings[team2];
  if (!Number.isFinite(eh) || !Number.isFinite(ea)) return null;
  const m = S.data.fx.model, d = (eh - ea) / 100;
  const x = m.features.map((f) => f === "d" ? d : f === "abs_d" ? Math.abs(d) : f === "d2_over_10" ? (d * d) / 10 : f === "lg_" + lg ? 1 : 0);
  const z = m.coef.map((row, k) => m.intercept[k] + row.reduce((a, c, j) => a + c * x[j], 0));
  const mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}
function eloUpdate(home, away, hg, ag) {
  const rh = S.ratings[home], ra = S.ratings[away];
  if (!Number.isFinite(rh) || !Number.isFinite(ra)) return;
  const exp = 1 / (1 + 10 ** (-(rh + 60 - ra) / 400));
  const score = hg > ag ? 1 : hg === ag ? 0.5 : 0;
  const gd = Math.abs(hg - ag), mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
  const delta = 20 * mult * (score - exp);
  S.ratings[home] = rh + delta; S.ratings[away] = ra - delta;
}

/* ---------- method config ---------- */
const M = () => S.data.method;
const SEL_LABEL = { H: "Home", D: "Draw", A: "Away", O: "Over 2.5", U: "Under 2.5" };
function riskF() { return S.settings.risk ?? M().kelly_f; }
const fkey = (f) => (Number.isInteger(f) ? f.toFixed(1) : String(f)); // stats keys come from Python: "0.25" … "1.0"
const RISK_PROFILES = [
  { f: 0.25, name: "Steady", note: "Quarter Kelly · smallest swings" },
  { f: 0.5, name: "Balanced", note: "Half Kelly · the usual sweet spot" },
  { f: 0.75, name: "Aggressive", note: "¾ Kelly · much faster, deeper dips" },
  { f: 1.0, name: "Full Kelly", note: "Maximum growth · brutal drawdowns" },
];
function inGroup(lg) { return M().groups[M().cfg.group].includes(lg); }

// One candidate = one selection of one match with the method's probability p and prices.
// Returns null when the method would not bet it, else {edge, kelly, odds}.
function judge(cand, odds) {
  const cfg = M().cfg;
  if (!Number.isFinite(cand.p) || !(odds > 1)) return null;
  if (cfg.mkts !== "all" && cand.mkt !== cfg.mkts) return null;
  if (!inGroup(cand.lg)) return null;
  if (!(odds >= cfg.lo && odds < cfg.hi)) return null;
  if (Number.isFinite(cand.b365) && odds > M().max_ratio * cand.b365) return null; // likely a stale / erroneous price
  const edge = cand.p * odds - 1;
  if (!(edge > cfg.thr)) return null;
  return { edge, kelly: edge / (odds - 1), odds };
}

// Daily picks from candidates with market prices: one bet per match, top-K per local day.
function buildPicks(fixtures) {
  const cfg = M().cfg, byDay = new Map();
  for (const f of fixtures) {
    if (!f.cands) continue;
    let best = null;
    for (const c of f.cands) {
      const j = judge(Object.assign({ lg: f.lg }, c), c.mx);
      if (!j) continue;
      const key = cfg.rank === "kelly" ? j.kelly : j.edge;
      if (!best || key > best.key) best = Object.assign({ key, sel: c.sel, mkt: c.mkt, p: c.p, b365: c.b365 }, j);
    }
    if (!best) continue;
    const d = new Date(f.t), dk = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(dk)) byDay.set(dk, []);
    byDay.get(dk).push({ f, ...best });
  }
  const picks = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => b.key - a.key);
    picks.push(...list.slice(0, cfg.K));
  }
  return picks.sort((a, b) => a.f.t - b.f.t);
}

// Kelly stakes for one day's picks from the current bankroll (never more than the bankroll in total).
function stakesFor(picks, bank = currentBankroll(), f = riskF()) {
  const fr = picks.map((p) => f * p.kelly);
  const tot = fr.reduce((a, b) => a + b, 0);
  const scale = tot > 1 ? 1 / tot : 1;
  return fr.map((x) => bank * x * scale);
}
function minOdds(p) { return (1 + M().cfg.thr) / p; } // lowest price at which the method still bets

/* ---------- backtest replay ---------- */
// bets: columnar {d: day, m: match idx, s: sel code, o: odds*100, p: prob*1e4, w: win}
function simulate({ from, to, f, bank0 }) {
  const B = S.data.bt.bets, Mt = S.data.bt.matches, N = B.d.length;
  const res = { n: 0, wins: 0, turnover: 0, profit: 0, eq: [], byYear: new Map(), byMonth: new Map(), rows: [], mdd: 0, worstRun: 0, peak: bank0 };
  let bank = bank0, peak = bank0, run = 0, i = 0;
  res.eq.push({ d: from, v: bank });
  while (i < N) {
    const d = B.d[i];
    let j = i;
    while (j < N && B.d[j] === d) j++;
    if (d < from || d > to) { i = j; continue; }
    let tot = 0;
    for (let q = i; q < j; q++) { const o = B.o[q] / 100, e = (B.p[q] / 1e4) * o - 1; tot += f * e / (o - 1); }
    const scale = tot > 1 ? 1 / tot : 1;
    const start = bank;
    for (let q = i; q < j; q++) {
      const o = B.o[q] / 100, p = B.p[q] / 1e4, w = B.w[q];
      const st = start * scale * f * (p * o - 1) / (o - 1);
      const pl = w ? st * (o - 1) : -st;
      bank += pl;
      res.n++; res.wins += w; res.turnover += st; res.profit += pl;
      run = w ? 0 : run + 1; res.worstRun = Math.max(res.worstRun, run);
      res.rows.push({ q, st, pl });
      const dt = dayToDate(d), y = dt.getUTCFullYear(), mk = y * 12 + dt.getUTCMonth();
      res.byYear.set(y, (res.byYear.get(y) || 0) + pl);
      res.byMonth.set(mk, (res.byMonth.get(mk) || 0) + pl);
    }
    bank = Math.max(bank, 1e-9);
    peak = Math.max(peak, bank);
    res.mdd = Math.max(res.mdd, 1 - bank / peak);
    res.eq.push({ d, v: bank });
    i = j;
  }
  res.final = bank;
  res.peak = peak;
  res.roi = res.turnover ? res.profit / res.turnover : NaN;
  res.ret = bank / bank0 - 1;
  res.winrate = res.n ? res.wins / res.n : NaN;
  const years = (Math.min(to, S.dataTo) - from) / 365.25;
  res.cagr = years >= 0.5 && bank > 0 ? (bank / bank0) ** (1 / years) - 1 : NaN;
  res.days = new Set(res.rows.map((r) => B.d[r.q])).size;
  return res;
}
