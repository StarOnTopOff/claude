/* ============================== model & strategies ============================== */
function novigProp(odds) {
  const inv = odds.map((o) => 1 / o), s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}
// Power method, identical to the Python backtest: find k with sum((1/o)^k) = 1.
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

function eloRating(team) { return S.ratings[team]; }
function eloProbs(lg, team1, team2) {
  const eh = eloRating(team1), ea = eloRating(team2);
  if (!Number.isFinite(eh) || !Number.isFinite(ea)) return null;
  const m = S.fx.model, d = (eh - ea) / 100;
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

/* ---------- strategy table (columnar in the payload) ---------- */
const FAIR_SHORT = { mkt: "proba. du marché (Bet365 sans marge)", mktp: "proba. du marché (marge proportionnelle)", elo: "modèle Elo", b75: "75 % marché + 25 % Elo", b50: "50 % marché + 50 % Elo", mkc: "marché, si Elo confirme", none: "" };
function indexStrategies() {
  S.stratIndex = new Map();
  S.bt.strategies.id.forEach((id, i) => S.stratIndex.set(id, i));
}
function strat(id) {
  const i = S.stratIndex.get(id);
  if (i == null) return null;
  const c = S.bt.strategies, v = S.bt.vocab;
  return {
    id, fair: v.fair[c.fair[i]], exec: v.exec[c.exec[i]], sel: v.sel[c.sel[i]], thr: c.thr[i] < 0 ? null : c.thr[i],
    lo: c.lo[i], hi: c.hi[i], group: v.group[c.group[i]], n: c.n[i], profit: c.profit[i], roi: c.roi[i],
    n_tr: c.n_tr[i], roi_tr: c.roi_tr[i], n_va: c.n_va[i], roi_va: c.roi_va[i], n_te: c.n_te[i], roi_te: c.roi_te[i],
    mdd: c.mdd[i], r2: c.r2[i], t: c.t[i], score: c.score[i], avg_odds: c.avg_odds[i], winrate: c.winrate[i],
    hasBets: !!S.bt.bets[String(id)],
  };
}
function bandText(s) { return `cote ${nf2.format(s.lo)} – ${s.hi >= 60 ? "∞" : nf2.format(s.hi)}`; }
function bandPhrase(s) { return s.hi >= 60 ? `les cotes à partir de ${nf2.format(s.lo)}` : `les cotes de ${nf2.format(s.lo)} à ${nf2.format(s.hi)}`; }
function stratTitle(s) {
  const L = S.bt.labels;
  return `${L.sel[s.sel]} · ${bandText(s)}`;
}
function stratRule(s) {
  const L = S.bt.labels;
  const cond = s.thr == null ? "tous les matchs du filtre" : `value > ${nf0.format(s.thr * 100)} % selon ${FAIR_SHORT[s.fair]}`;
  const ex = s.exec === "max" ? "au meilleur prix du marché" : "chez un seul bookmaker";
  return `${L.sel[s.sel]}, ${bandText(s)}, ${L.group[s.group]} — ${cond}, misé ${ex}.`;
}
function stratName(id) {
  const b = S.bt;
  if (id === b.champion) return "Championne";
  if (id === b.champion_single) return "Meilleure 1 bookmaker";
  if (id === b.trap) return "Piège (choix naïf)";
  if (b.refs.includes(id)) return ["Tous les favoris à domicile", "Favoris à domicile ≤ 1,60", "Value Elo seule (1 bookmaker)"][b.refs.indexOf(id)] || "Référence";
  const k = b.top.indexOf(id);
  return k >= 0 ? `Top ${k + 1}` : `#${id}`;
}

/* ---------- applying a strategy to one match ---------- */
// ref: reference odds used to estimate the fair probability (Bet365 in the backtest)
// exec: odds you can actually take (max market odds in the backtest, Stake for you)
function applyRule(s, lg, ref, exec, pElo) {
  if (!S.groups[s.group]?.includes(lg)) return { ok: false, why: "ligue hors stratégie" };
  if (!validOdds(exec) || exec.length !== 3) return { ok: false, why: "cotes manquantes" };
  let p = null;
  const mkt = validOdds(ref) ? novigPower(ref) : null;
  if (s.fair === "mkt" || s.fair === "none") p = mkt;
  else if (s.fair === "mktp") p = validOdds(ref) ? novigProp(ref) : null;
  else if (s.fair === "elo") p = pElo;
  else if (s.fair === "b75" && mkt && pElo) p = mkt.map((x, k) => 0.75 * x + 0.25 * pElo[k]);
  else if (s.fair === "b50" && mkt && pElo) p = mkt.map((x, k) => 0.5 * x + 0.5 * pElo[k]);
  else if (s.fair === "mkc" && mkt && pElo) p = mkt.map((x, k) => (pElo[k] >= x ? x : NaN));
  if (!p) return { ok: false, why: s.fair === "elo" || s.fair.startsWith("b") ? "Elo indisponible" : "cotes de référence manquantes" };
  const allowed = { H: [0], D: [1], A: [2], HA: [0, 2], ALL: [0, 1, 2] }[s.sel];
  if (!allowed) return { ok: false, why: "marché Over/Under" };
  let best = null;
  for (const k of allowed) {
    const e = p[k] * exec[k] - 1;
    if (!Number.isFinite(e)) continue;
    if (!best || e > best.edge) best = { k, edge: e, odds: exec[k], p: p[k] };
  }
  if (!best) return { ok: false, why: "pas de proba" };
  const inBand = best.odds >= s.lo && best.odds < s.hi;
  const passes = s.thr == null ? true : best.edge > s.thr;
  return Object.assign(best, { ok: inBand && passes, inBand, passes, probs: p });
}
function stakeFor(p, odds, bank = S.settings.bankroll) {
  const st = S.settings;
  if (st.staking === "flat" || st.staking === "pct") return bank * st.flat;
  const e = p * odds - 1;
  if (!(e > 0)) return 0;
  return bank * Math.min(st.cap, st.kelly * e / (odds - 1));
}

/* ---------- backtest simulation on exported bets ---------- */
function simulate(sid, o) {
  const B = S.bt.bets[String(sid)], M = S.bt.matches, s = strat(sid);
  const res = { n: 0, wins: 0, turnover: 0, profit: 0, eq: [], byYear: new Map(), byMonth: new Map(), rows: [], mdd: 0, worstRun: 0 };
  if (!B) return res;
  const bank0 = o.bankroll;
  let bank = bank0, peak = bank0, run = 0;
  let staking = o.staking;
  if (staking === "kelly" && s.thr == null) staking = "pct"; // no edge estimate -> Kelly undefined
  const maxDay = 0.6; // never more than 60 % of the bankroll in play on one day
  let i = 0;
  const N = B.m.length;
  res.eq.push({ d: o.from, v: bank });
  while (i < N) {
    const d = M.day[B.m[i]];
    let j = i;
    while (j < N && M.day[B.m[j]] === d) j++;
    if (d < o.from || d > o.to) { i = j; continue; }
    const stakes = [];
    let total = 0;
    for (let q = i; q < j; q++) {
      const odds = B.o[q] / 100, p = B.p[q] / 1e4;
      let st;
      if (staking === "flat") st = bank0 * o.flat;
      else if (staking === "pct") st = bank * o.flat;
      else { const e = p * odds - 1; st = e > 0 ? bank * Math.min(o.cap, o.kelly * e / (odds - 1)) : 0; }
      stakes.push(st); total += st;
    }
    const scale = staking === "flat" ? 1 : total > bank * maxDay ? (bank * maxDay) / total : 1;
    for (let q = i; q < j; q++) {
      const st = stakes[q - i] * scale;
      if (!(st > 0) || bank <= 0) continue;
      const odds = B.o[q] / 100, w = B.w[q], pl = w ? st * (odds - 1) : -st;
      res.n++; res.wins += w; res.turnover += st; res.profit += pl;
      run = w ? 0 : run + 1; res.worstRun = Math.max(res.worstRun, run);
      res.rows.push({ q, d, st, pl });
      const dt = dayToDate(d), y = dt.getUTCFullYear(), mk = y * 12 + dt.getUTCMonth();
      res.byYear.set(y, (res.byYear.get(y) || 0) + pl);
      res.byMonth.set(mk, (res.byMonth.get(mk) || 0) + pl);
    }
    bank = bank0 + res.profit;
    peak = Math.max(peak, bank);
    res.mdd = Math.max(res.mdd, (peak - bank) / peak);
    res.eq.push({ d, v: bank });
    i = j;
  }
  res.final = bank;
  res.roi = res.turnover ? res.profit / res.turnover : NaN;
  res.ret = res.profit / bank0;
  res.winrate = res.n ? res.wins / res.n : NaN;
  const years = (o.to - o.from) / 365.25;
  res.cagr = years >= 1 && bank > 0 ? (bank / bank0) ** (1 / years) - 1 : NaN;
  // smoothness: R^2 of equity against time
  const n = res.eq.length;
  if (n > 3) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (const p of res.eq) { sx += p.d; sy += p.v; sxx += p.d * p.d; syy += p.v * p.v; sxy += p.d * p.v; }
    const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
    const r = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
    res.r2 = Math.sign(r) * r * r;
  } else res.r2 = NaN;
  return res;
}
