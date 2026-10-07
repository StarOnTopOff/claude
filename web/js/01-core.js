"use strict";
/* ============================== core helpers ============================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DAY = 864e5;
const EPOCH = Date.UTC(2000, 0, 1);
const dayToDate = (d) => new Date(EPOCH + d * DAY);
const dateToDay = (dt) => Math.floor((Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) - EPOCH) / DAY);
const LOCALE = "en-US";
const NF = (d = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
const nf0 = NF(0), nf1 = NF(1), nf2 = NF(2);
const fmtN = (x, d = 0) => (Number.isFinite(x) ? NF(d).format(x) : "–");
const fmtPct = (x, d = 1, sign = true) => (Number.isFinite(x) ? (sign && x > 0 ? "+" : x < 0 ? "−" : "") + NF(d).format(Math.abs(x) * 100) + "%" : "–");
const CUR = () => (S.settings.currency === "EUR" ? "€" : S.settings.currency === "GBP" ? "£" : "$");
const fmtMoney = (x, d = 0, sign = false) => {
  if (!Number.isFinite(x)) return "–";
  const s = x < 0 ? "−" : sign && x > 0 ? "+" : "";
  const a = Math.abs(x);
  const body = a >= 1e7 ? NF(1).format(a / 1e6) + "M" : NF(d).format(a);
  return s + CUR() + body;
};
const fmtOdds = (x) => (Number.isFinite(x) && x > 0 ? nf2.format(x) : "–");
const cls = (x) => (x > 0 ? "pos" : x < 0 ? "neg" : "");
const fmtDate = (t, o = { month: "short", day: "numeric", year: "numeric" }) => new Intl.DateTimeFormat(LOCALE, o).format(new Date(t));
const fmtTime = (t) => new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
function dayDiff(t) {
  const d = new Date(t), now = new Date();
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY);
}
const fmtDayHead = (t) => {
  const diff = dayDiff(t);
  const base = new Intl.DateTimeFormat(LOCALE, { weekday: "long", month: "long", day: "numeric" }).format(new Date(t));
  if (diff === 0) return "Today · " + base;
  if (diff === 1) return "Tomorrow · " + base;
  if (diff === -1) return "Yesterday · " + base;
  return base;
};
const fmtWhen = (t) => {
  const diff = dayDiff(t);
  const day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : new Intl.DateTimeFormat(LOCALE, { weekday: "short" }).format(new Date(t));
  return `${day} ${fmtTime(t)}`;
};
const icon = (id, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#${id}"/></svg>`;

function countdownParts(ms) {
  ms = Math.max(0, ms);
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  return { d, h, m, s };
}
function countdownShort(ms, compact = false) {
  if (ms <= 0) return "now";
  const { d, h, m, s } = countdownParts(ms);
  const p = (x) => String(x).padStart(2, "0"), pre = compact ? "" : "in ";
  if (d > 0) return `${pre}${d}d ${p(h)}h`;
  if (h > 0) return `${pre}${h}h ${p(m)}m`;
  return `${pre}${p(m)}:${p(s)}`;
}

/* ---------- storage (per-viewer conveniences only) ---------- */
const store = {
  get(k, def) { try { const v = localStorage.getItem("abysse2:" + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem("abysse2:" + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

/* ---------- state ---------- */
const DEFAULT_SETTINGS = {
  bankroll: 1000, currency: "USD", risk: null, // risk = Kelly fraction; null -> the method's recommended one
  notif: { kickoff: true, goals: true, picks: true, results: true }, browser: false,
  leagues: null, shareUrl: "",
};
const S = {
  data: null, ready: false,
  settings: Object.assign({}, DEFAULT_SETTINGS, store.get("settings", {})),
  journal: store.get("journal", []),
  follows: new Set(store.get("follows", [])),
  notifications: store.get("notifications", []),
  notified: new Set(store.get("notified", [])),
  view: "home",
  live: { mode: "snapshot", lastOk: 0, ofOk: false, error: "" },
  ui: { matchFilter: { lg: "all", when: "7d", only: "all", mode: "upcoming" }, bt: null },
  ai: { sample: null, turns: [], busy: false, ctl: null, hasImages: false, hasTools: false },
};
S.settings.notif = Object.assign({}, DEFAULT_SETTINGS.notif, S.settings.notif || {});
const saveSettings = () => store.set("settings", S.settings);
const saveJournal = () => store.set("journal", S.journal);
const saveFollows = () => store.set("follows", [...S.follows]);

/* ---------- payload: gzip + base64 JSON embedded in the page ---------- */
async function loadPayload() {
  const el = document.getElementById("payload");
  const b64 = el.textContent.trim();
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

/* ---------- toasts & notifications ---------- */
function toast(title, body = "", ic = "i-bell", ms = 4200) {
  const box = $("#toasts");
  if (!box) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<div class="toast-ic">${icon(ic)}</div><div class="toast-tx"><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ""}</div>`;
  box.prepend(t);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, ms);
}
function notify(kind, title, body, key) {
  if (key) {
    if (S.notified.has(key)) return;
    S.notified.add(key);
    store.set("notified", [...S.notified].slice(-500));
  }
  if (kind !== "system" && S.settings.notif[kind] === false) return;
  S.notifications.unshift({ t: Date.now(), kind, title, body, read: false });
  S.notifications = S.notifications.slice(0, 60);
  store.set("notifications", S.notifications);
  toast(title, body, kind === "goals" ? "i-goal" : kind === "picks" ? "i-target" : "i-bell");
  updateBadge();
  if (S.settings.browser && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body, tag: key || undefined }); } catch { /* not allowed in this frame */ }
  }
}
function updateBadge() {
  const n = S.notifications.filter((x) => !x.read).length;
  const b = $("#notif-badge");
  if (!b) return;
  b.hidden = n === 0;
  b.textContent = n > 9 ? "9+" : n;
}

/* ---------- sheets ---------- */
let openSheetEl = null;
function openSheet(el, render) {
  closeSheet();
  render?.();
  const scrim = $("#scrim");
  scrim.hidden = false; el.hidden = false;
  requestAnimationFrame(() => { scrim.classList.add("show"); el.classList.add("show"); });
  openSheetEl = el;
}
function closeSheet() {
  if (!openSheetEl) return;
  const el = openSheetEl, scrim = $("#scrim");
  el.classList.remove("show"); scrim.classList.remove("show");
  setTimeout(() => { el.hidden = true; scrim.hidden = true; }, 280);
  openSheetEl = null;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* ---------- router ---------- */
const VIEWS = ["home", "matches", "stake", "backtest", "ai"];
const RENDER = {};
function go(view, push = true) {
  if (!VIEWS.includes(view)) view = "home";
  S.view = view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  movePill?.();
  if (S.ready && RENDER[view]) RENDER[view]();
  if (push && location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
window.addEventListener("hashchange", () => go(location.hash.slice(1) || "home", false));
