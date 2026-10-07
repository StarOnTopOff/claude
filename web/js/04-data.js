/* ============================== fixtures & live data ============================== */
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
const teamLabel = (t) => S.fx.display[t] || t;
function crest(team) {
  let h = 0;
  for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = 200 + (h % 70) - 20, sat = 45 + (h >> 8) % 25, lig = 30 + (h >> 4) % 14;
  const lab = teamLabel(team).replace(/^(FC|AC|AS|SC|RC|1\.)\s+/i, "");
  const ini = lab.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return `<span class="crest" style="background:linear-gradient(160deg,hsl(${hue} ${sat}% ${lig + 14}%),hsl(${hue + 20} ${sat}% ${lig - 8}%))">${esc(ini)}</span>`;
}

function fixtureKey(f) { return `${f.lg}|${f.h}|${f.a}|${Math.floor(f.t / DAY)}`; }
function hydrateFixture(raw) {
  const f = Object.assign({}, raw);
  f.key = fixtureKey(f);
  computeFixture(f);
  return f;
}
function computeFixture(f) {
  f.pElo = eloProbs(f.lg, f.h, f.a);
  f.pMkt = null; f.fairSrc = f.pElo ? "Modèle Elo" : null;
  if (validOdds(f.b365) && f.b365.length === 3) { f.pMkt = novigPower(f.b365); f.fairSrc = "Marché (Bet365 sans marge)"; }
  else if (validOdds(f.ref) && f.ref.length === 3) { f.pMkt = novigPower(f.ref); f.fairSrc = `Marché (${f.refSrc || "ESPN"} sans marge)`; }
  f.pFair = f.pMkt || f.pElo;
  f.pick = null;
  const champ = strat(S.bt.champion);
  if (champ && validOdds(f.b365) && validOdds(f.max)) {
    const r = applyRule(champ, f.lg, f.b365, f.max, f.pElo);
    if (r.ok) f.pick = r;
  }
  f.fav = null;
  if (f.pFair) {
    const k = f.pFair.indexOf(Math.max(...f.pFair));
    f.fav = { k, fair: 1 / f.pFair[k] };
  }
}
function rebuildFixtures(list) {
  S.fixtures = list.map(hydrateFixture).sort((a, b) => a.t - b.t);
  S.fixByKey = new Map(S.fixtures.map((f) => [f.key, f]));
}
function initData(payload) {
  S.bt = payload.bt; S.fx = payload.fx; S.groups = payload.groups;
  S.ratings = Object.assign({}, S.fx.ratings);
  indexStrategies();
  S.results = S.fx.results.map((r) => Object.assign({ key: fixtureKey(r) }, r));
  S.resultKeys = new Set(S.results.map((r) => r.key));
  rebuildFixtures(S.fx.fixtures);
  S.dataTo = Math.max(...S.bt.matches.day);
}
function liveStatus(f, now = Date.now()) {
  if (f.live) {
    if (f.live.state === "in") return { k: "live", txt: f.live.detail || f.live.clock || "En cours" };
    if (f.live.state === "post") return { k: "ft", txt: "Terminé" };
  }
  if (f.s) return { k: "ft", txt: "Terminé" };
  if (now >= f.t && now < f.t + LIVE_WINDOW) return { k: "maybe", txt: "En cours" };
  if (now >= f.t + LIVE_WINDOW) return { k: "done?", txt: "Score à venir" };
  return { k: "pre", txt: "" };
}
const upcoming = (now = Date.now()) => S.fixtures.filter((f) => !f.s && (f.live?.state !== "post") && f.t + LIVE_WINDOW > now);
const liveNow = () => S.fixtures.filter((f) => f.live?.state === "in");

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
  const leagues = Object.entries(S.fx.leagues).filter(([, v]) => v.of);
  const results = await Promise.allSettled(leagues.map(([code, v]) => getJSON(`${OF_RAW}/${S.fx.season}/${v.of}.json`).then((j) => [code, v, j])));
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!ok.length) return false;
  const oldByKey = S.fixByKey;
  const fresh = [], newResults = [];
  const now = Date.now();
  for (const [code, v, j] of ok) {
    for (const m of j.matches || []) {
      const h = S.fx.name_map[m.team1] || m.team1, a = S.fx.name_map[m.team2] || m.team2;
      if (!S.fx.display[h]) S.fx.display[h] = m.team1;
      if (!S.fx.display[a]) S.fx.display[a] = m.team2;
      const t = ofToLocalMs(m.date, m.time, v.tz);
      const sc = m.score, ft = sc && !Array.isArray(sc) ? sc.ft : Array.isArray(sc) && sc.length === 2 ? sc : null;
      const item = { lg: code, t, h, a, r: m.round || "" };
      item.key = fixtureKey(item);
      if (ft) {
        item.s = ft;
        if (!S.resultKeys.has(item.key)) newResults.push(item);
      } else if (t + 3 * 36e5 > now) {
        const old = oldByKey.get(item.key);
        if (old) for (const k of ["b365", "max", "ou", "mou", "ref", "refSrc", "live"]) if (old[k]) item[k] = old[k];
        fresh.push(item);
      }
    }
  }
  // keep fixtures from leagues we could not refresh (and odds-only fixtures from other leagues)
  const refreshed = new Set(ok.map(([c]) => c));
  for (const f of S.fixtures) if (!refreshed.has(f.lg)) fresh.push(f);
  const snapMs = Date.parse(S.fx.elo_snapshot + "T00:00:00Z");
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
    const slug = S.fx.leagues[lg]?.espn;
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
  const st = ev.status?.type || {};
  const live = { state: st.state, detail: st.shortDetail || ev.status?.displayClock, clock: ev.status?.displayClock, hs: +home.score || 0, as: +away.score || 0, completed: !!st.completed };
  const prev = best.live;
  best.live = live;
  if (live.state === "in" && prev && (live.hs > prev.hs || live.as > prev.as) && watched(best)) {
    const who = live.hs > prev.hs ? teamLabel(best.h) : teamLabel(best.a);
    notify("goals", `But ! ${who}`, `${teamLabel(best.h)} ${live.hs} – ${live.as} ${teamLabel(best.a)} (${live.clock || ""})`, `goal|${best.key}|${live.hs}-${live.as}`);
    best.flash = Date.now();
  }
  if (live.state === "post" && prev && prev.state !== "post") {
    best.s = [live.hs, live.as];
    settleJournal();
    if (watched(best)) notify("results", "Match terminé", `${teamLabel(best.h)} ${live.hs} – ${live.as} ${teamLabel(best.a)}`, `ft|${best.key}`);
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
  S.live.lastTry = Date.now();
  let ok = false;
  try {
    if (first || !S.live.ofOk || Date.now() - (S.live.ofAt || 0) > 15 * 6e4) {
      if (await refreshOpenFootball()) { S.live.ofAt = Date.now(); ok = true; }
    }
    if (await refreshESPN() === true) ok = true;
  } catch (e) { S.live.error = String(e?.message || e); }
  if (ok) { S.live.mode = "live"; S.live.lastOk = Date.now(); }
  else if (!S.live.lastOk) S.live.mode = "snapshot";
  renderStatus();
  if (S.ready && ["home", "matchs"].includes(S.view)) RENDER[S.view]();
  const delay = S.live.mode === "snapshot" ? 5 * 6e4 : liveNow().length ? 30e3 : 120e3;
  liveTimer = setTimeout(() => liveLoop(false), delay);
}
function renderStatus() {
  const chip = $("#chip-status");
  const n = liveNow().length;
  chip.classList.toggle("live", n > 0);
  chip.classList.toggle("ok", S.live.mode === "live" && n === 0);
  const gen = S.fx ? fmtDate(Date.parse(S.fx.generated), { day: "2-digit", month: "2-digit" }) : "";
  const txt = n > 0 ? `LIVE · ${n} en cours` : S.live.mode === "live" ? "En ligne · temps réel" : `Données du ${gen}`;
  chip.querySelector(".txt").textContent = txt;
  chip.querySelector(".txs").textContent = n > 0 ? `LIVE ${n}` : S.live.mode === "live" ? "Direct" : gen;
  chip.title = S.live.mode === "live" ? "Scores ESPN et calendrier openfootball mis à jour automatiquement" :
    "Cette page ne peut pas joindre les sources en direct ici : elle affiche l'instantané embarqué. Ouvre la version hébergée pour le direct.";
}

/* ---------- journal auto-settlement ---------- */
function settleJournal() {
  let changed = false;
  for (const b of S.journal) {
    if (b.status !== "open" || !b.key) continue;
    const f = S.fixByKey.get(b.key);
    const r = S.results.find((x) => x.key === b.key) || (f?.s ? f : null);
    const sc = r?.s;
    if (!sc) continue;
    const res = sc[0] > sc[1] ? 0 : sc[0] === sc[1] ? 1 : 2;
    b.status = res === b.sel ? "won" : "lost";
    b.score = sc;
    changed = true;
    notify("results", b.status === "won" ? "Pari gagné" : "Pari perdu", `${b.label} · ${["1", "N", "2"][b.sel]} @ ${fmtOdds(b.odds)} → ${fmtEur(b.status === "won" ? b.stake * (b.odds - 1) : -b.stake, 2, true)}`, `settle|${b.id}`);
  }
  if (changed) saveJournal();
}
