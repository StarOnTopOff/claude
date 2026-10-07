/* ============================== fixtures, picks & live data ============================== */
const OF_RAW = "https://raw.githubusercontent.com/openfootball/football.json/master";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LIVE_WINDOW = 115 * 6e4;

function normName(s) {
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z ]/g, " ").split(/\s+/)
    .filter((t) => t && !["fc", "afc", "cf", "sc", "ac", "as", "ss", "ssc", "us", "cd", "rc", "rcd", "ca", "de", "da", "la", "club", "calcio", "the"].includes(t));
}
function nameSim(a, b) {
  const A = new Set(normName(a)), B = new Set(normName(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t) || [...B].some((u) => (u.length > 3 && t.startsWith(u)) || (t.length > 3 && u.startsWith(t)))) inter++;
  return inter / Math.min(A.size, B.size) * 0.7 + inter / new Set([...A, ...B]).size * 0.3;
}
const teamLabel = (t) => S.data.fx.display[t] || t;
const leagueName = (lg) => S.data.fx.leagues[lg]?.name || lg;
function initials(team) {
  const lab = teamLabel(team).replace(/^(FC|AC|AS|SC|RC|1\.)\s+/i, "");
  const w = lab.split(/[\s-]+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : lab.slice(0, 3)).toUpperCase();
}
function teamHue(team) {
  let h = 0;
  for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
function crest(team, size = "") {
  const h = teamHue(team), hue = 195 + (h % 60), sat = 55 + (h >> 8) % 30, lig = 34 + (h >> 4) % 16;
  return `<span class="crest ${size}" style="--c1:hsl(${hue} ${sat}% ${lig + 16}%);--c2:hsl(${hue + 24} ${sat}% ${lig - 14}%)" aria-hidden="true"><b>${esc(initials(team))}</b></span>`;
}
const selText = (f, sel) => sel === "H" ? `${teamLabel(f.h)} to win` : sel === "A" ? `${teamLabel(f.a)} to win` : sel === "D" ? "Draw" : sel === "O" ? "Over 2.5 goals" : "Under 2.5 goals";
const selShort = (sel) => ({ H: "1", D: "X", A: "2", O: "O2.5", U: "U2.5" }[sel]);

function fixtureKey(f) { return `${f.lg}|${f.h}|${f.a}|${Math.floor(f.t / DAY)}`; }
function computeFixture(f) {
  f.key = f.key || fixtureKey(f);
  f.pElo = eloProbs(f.lg, f.h, f.a);
  f.pMkt = null; f.fairSrc = f.pElo ? "Elo model" : null;
  if (validOdds(f.b365) && f.b365.length === 3) { f.pMkt = novigPower(f.b365); f.fairSrc = "Market (Bet365, margin removed)"; }
  else if (validOdds(f.ref) && f.ref.length === 3) { f.pMkt = novigPower(f.ref); f.fairSrc = `Market (${f.refSrc || "ESPN"}, margin removed)`; }
  f.pFair = f.pMkt || f.pElo;
  // without the method's own candidates, a reference price still gives a probability per 1X2 outcome
  if (!f.cands && f.pMkt) f.watch = ["H", "D", "A"].map((sel, k) => ({ sel, mkt: "1X2", p: f.pMkt[k], b365: f.b365?.[k] ?? f.ref?.[k] }));
  f.fav = null;
  if (f.pFair) { const k = f.pFair.indexOf(Math.max(...f.pFair)); f.fav = { k, sel: "HDA"[k], fair: 1 / f.pFair[k] }; }
  return f;
}
function rebuildFixtures(list) {
  S.fixtures = list.map((r) => computeFixture(Object.assign({}, r))).sort((a, b) => a.t - b.t);
  S.fixByKey = new Map(S.fixtures.map((f) => [f.key, f]));
  refreshPicks();
}
function refreshPicks() {
  const now = Date.now();
  S.picks = buildPicks(S.fixtures.filter((f) => f.t > now - 2 * 36e5 && !f.s));
  for (const f of S.fixtures) f.pick = null;
  for (const p of S.picks) p.f.pick = p;
}
function initData(payload) {
  S.data = payload;
  S.ratings = Object.assign({}, payload.fx.ratings);
  S.results = payload.fx.results.map((r) => Object.assign({ key: fixtureKey(r) }, r));
  S.resultKeys = new Set(S.results.map((r) => r.key));
  S.dataTo = payload.bt.data_to_day;
  if (!S.settings.leagues) S.settings.leagues = Object.keys(payload.fx.leagues).filter((c) => payload.fx.leagues[c].of);
  rebuildFixtures(payload.fx.fixtures);
}
function liveStatus(f, now = Date.now()) {
  if (f.live) {
    if (f.live.state === "in") return { k: "live", txt: f.live.detail || f.live.clock || "Live" };
    if (f.live.state === "post") return { k: "ft", txt: "Full time" };
  }
  if (f.s) return { k: "ft", txt: "Full time" };
  if (now >= f.t && now < f.t + LIVE_WINDOW) return { k: "maybe", txt: "In play" };
  if (now >= f.t + LIVE_WINDOW) return { k: "done?", txt: "Awaiting result" };
  return { k: "pre", txt: "" };
}
const upcoming = (now = Date.now()) => S.fixtures.filter((f) => !f.s && (f.live?.state !== "post") && f.t + LIVE_WINDOW > now);
const liveNow = () => S.fixtures.filter((f) => f.live?.state === "in");

/* ---------- bankroll: starting bankroll + every settled bet in the journal ---------- */
function journalStats() {
  let profit = 0, turnover = 0, open = 0, won = 0, lost = 0, openStake = 0;
  for (const b of S.journal) {
    if (b.status === "open") { open++; openStake += b.stake; continue; }
    if (b.status === "void") continue;
    turnover += b.stake;
    if (b.status === "won") { won++; profit += b.stake * (b.odds - 1); } else { lost++; profit -= b.stake; }
  }
  return { profit, turnover, open, openStake, won, lost, roi: turnover ? profit / turnover : NaN };
}
function currentBankroll() { return Math.max(0, S.settings.bankroll + journalStats().profit); }

/* ---------- live refresh (works when the page is hosted on the open web) ---------- */
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
function ofToLocalMs(date, time, tz) {
  // local wall-clock time in a named zone -> epoch ms (two-pass offset correction)
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = (time || "15:00").split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
    t += Date.UTC(y, m - 1, d, hh, mm) - asUtc;
  }
  return t;
}
async function refreshOpenFootball() {
  const fx = S.data.fx;
  const leagues = Object.entries(fx.leagues).filter(([, v]) => v.of);
  const results = await Promise.allSettled(leagues.map(([code, v]) => getJSON(`${OF_RAW}/${fx.season}/${v.of}.json`).then((j) => [code, v, j])));
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) return false;
  const oldByKey = S.fixByKey;
  const fresh = [], newResults = [];
  const now = Date.now();
  for (const [code, v, j] of ok) {
    for (const m of j.matches || []) {
      const h = fx.name_map[m.team1] || m.team1, a = fx.name_map[m.team2] || m.team2;
      if (!fx.display[h]) fx.display[h] = m.team1;
      if (!fx.display[a]) fx.display[a] = m.team2;
      const t = ofToLocalMs(m.date, m.time, v.tz);
      const sc = m.score, ft = sc && !Array.isArray(sc) ? sc.ft : Array.isArray(sc) && sc.length === 2 ? sc : null;
      const item = { lg: code, t, h, a, r: m.round || "" };
      item.key = fixtureKey(item);
      if (ft) {
        item.s = ft;
        if (!S.resultKeys.has(item.key)) newResults.push(item);
      } else if (t + 3 * 36e5 > now) {
        const old = oldByKey.get(item.key);
        if (old) for (const k of ["b365", "max", "ou", "mou", "cands", "ref", "refSrc", "live"]) if (old[k]) item[k] = old[k];
        fresh.push(item);
      }
    }
  }
  const refreshed = new Set(ok.map(([c]) => c));
  for (const f of S.fixtures) if (!refreshed.has(f.lg)) fresh.push(f);
  const snapMs = Date.parse(fx.elo_snapshot + "T00:00:00Z");
  newResults.sort((x, y) => x.t - y.t).forEach((r) => {
    if (r.t > snapMs) eloUpdate(r.h, r.a, r.s[0], r.s[1]);
    S.results.unshift(r); S.resultKeys.add(r.key);
  });
  S.results.sort((x, y) => y.t - x.t);
  rebuildFixtures(fresh);
  S.live.ofOk = true;
  return true;
}
const mlToDec = (ml) => { const v = Number(ml); return !Number.isFinite(v) || v === 0 ? NaN : v > 0 ? 1 + v / 100 : 1 + 100 / -v; };
async function refreshESPN() {
  const now = Date.now();
  const leagues = new Set(S.fixtures.filter((f) => f.t < now + 12 * 36e5 && f.t > now - 4 * 36e5).map((f) => f.lg));
  for (const f of liveNow()) leagues.add(f.lg);
  if (!leagues.size) return null;
  let any = false;
  await Promise.allSettled([...leagues].map(async (lg) => {
    const slug = S.data.fx.leagues[lg]?.espn;
    if (!slug) return;
    const j = await getJSON(`${ESPN}/${slug}/scoreboard`);
    any = true;
    for (const ev of j.events || []) applyEspnEvent(lg, ev);
  }));
  return any;
}
function applyEspnEvent(lg, ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return;
  const home = comp.competitors?.find((c) => c.homeAway === "home"), away = comp.competitors?.find((c) => c.homeAway === "away");
  if (!home || !away) return;
  const t = Date.parse(ev.date);
  let best = null, bs = 0;
  for (const f of S.fixtures) {
    if (f.lg !== lg || Math.abs(f.t - t) > 8 * 36e5) continue;
    const sh = Math.max(nameSim(home.team.displayName, teamLabel(f.h)), nameSim(home.team.shortDisplayName, f.h), nameSim(home.team.displayName, f.h));
    const sa = Math.max(nameSim(away.team.displayName, teamLabel(f.a)), nameSim(away.team.shortDisplayName, f.a), nameSim(away.team.displayName, f.a));
    if (sh + sa > bs) { bs = sh + sa; best = f; }
  }
  if (!best || bs < 0.9) return;
  if (home.team.logo) best.logoH = home.team.logo;
  if (away.team.logo) best.logoA = away.team.logo;
  const st = ev.status?.type || {};
  const live = { state: st.state, detail: st.shortDetail || ev.status?.displayClock, clock: ev.status?.displayClock, hs: +home.score || 0, as: +away.score || 0, completed: !!st.completed };
  const prev = best.live;
  best.live = live;
  if (live.state === "in" && prev && (live.hs > prev.hs || live.as > prev.as) && watched(best)) {
    const who = live.hs > prev.hs ? teamLabel(best.h) : teamLabel(best.a);
    notify("goals", `Goal! ${who}`, `${teamLabel(best.h)} ${live.hs}–${live.as} ${teamLabel(best.a)} (${live.clock || ""})`, `goal|${best.key}|${live.hs}-${live.as}`);
    best.flash = Date.now();
  }
  if (live.state === "post" && (!prev || prev.state !== "post")) {
    best.s = [live.hs, live.as];
    settleJournal();
    if (prev && watched(best)) notify("results", "Full time", `${teamLabel(best.h)} ${live.hs}–${live.as} ${teamLabel(best.a)}`, `ft|${best.key}`);
  }
  const o = comp.odds?.[0];
  if (o && !validOdds(best.b365)) {
    const dec = [mlToDec(o.homeTeamOdds?.moneyLine), mlToDec(o.drawOdds?.moneyLine), mlToDec(o.awayTeamOdds?.moneyLine)];
    if (validOdds(dec)) { best.ref = dec; best.refSrc = o.provider?.name || "ESPN"; computeFixture(best); }
  }
}
function watched(f) {
  return S.follows.has(f.key) || !!f.pick || S.journal.some((b) => b.key === f.key && b.status === "open");
}

let liveTimer = null;
async function liveLoop(first = false) {
  clearTimeout(liveTimer);
  let ok = false;
  try {
    if (first || !S.live.ofOk || Date.now() - (S.live.ofAt || 0) > 15 * 6e4) {
      if (await refreshOpenFootball()) { S.live.ofAt = Date.now(); ok = true; }
    }
    if (await refreshESPN() === true) ok = true;
  } catch (e) { S.live.error = String(e?.message || e); }
  if (ok) { S.live.mode = "live"; S.live.lastOk = Date.now(); refreshPicks(); }
  else if (!S.live.lastOk) S.live.mode = "snapshot";
  renderStatus();
  if (S.ready && ["home", "matches"].includes(S.view) && !document.querySelector(".view.active input:focus")) RENDER[S.view]();
  const delay = S.live.mode === "snapshot" ? 5 * 6e4 : liveNow().length ? 30e3 : 120e3;
  liveTimer = setTimeout(() => liveLoop(false), delay);
}
function renderStatus() {
  const chip = $("#chip-status");
  if (!chip) return;
  const n = liveNow().length;
  chip.classList.toggle("is-live", n > 0);
  chip.classList.toggle("is-online", S.live.mode === "live" && n === 0);
  const gen = S.data ? fmtDate(Date.parse(S.data.fx.generated), { month: "short", day: "numeric" }) : "";
  chip.querySelector("[data-long]").textContent = n > 0 ? `LIVE · ${n}` : S.live.mode === "live" ? "Live data" : `Snapshot · ${gen}`;
  chip.querySelector("[data-short]").textContent = n > 0 ? `LIVE ${n}` : S.live.mode === "live" ? "Live" : gen;
  chip.title = S.live.mode === "live" ? "Scores from ESPN and fixtures from openfootball, refreshed automatically"
    : "This copy of the app cannot reach live sources, so it shows the data embedded when it was built. Open the hosted version for live scores.";
}

/* ---------- journal auto-settlement ---------- */
function outcomeWon(sel, sc) {
  const g = sc[0] + sc[1];
  return sel === "H" ? sc[0] > sc[1] : sel === "D" ? sc[0] === sc[1] : sel === "A" ? sc[0] < sc[1] : sel === "O" ? g > 2.5 : g < 2.5;
}
function settleJournal() {
  let changed = false;
  for (const b of S.journal) {
    if (b.status !== "open" || !b.key) continue;
    const f = S.fixByKey.get(b.key);
    const r = S.results.find((x) => x.key === b.key) || (f?.s ? f : null);
    if (!r?.s) continue;
    b.status = outcomeWon(b.sel, r.s) ? "won" : "lost";
    b.score = r.s;
    changed = true;
    const pl = b.status === "won" ? b.stake * (b.odds - 1) : -b.stake;
    notify("results", b.status === "won" ? "Bet won" : "Bet lost", `${b.label} · ${selShort(b.sel)} @ ${fmtOdds(b.odds)} → ${fmtMoney(pl, 2, true)}`, `settle|${b.id}`);
  }
  if (changed) saveJournal();
}
