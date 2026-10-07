// Screenshot an HTML page at phone and desktop sizes with REAL Google Fonts.
// The sandbox cannot reach fonts.googleapis.com, so font CSS requests are answered
// from local @fontsource npm packages (installed on demand). Every other remote
// request is blocked, exactly like a Claude artifact without network access.
//
// usage: node shoot.js <page.html> <out-prefix> [--full] [--hash=view] [--wait=1500]
//        prints console errors / overflow, writes <out-prefix>-mobile.png and -desktop.png
const path = require("path"), fs = require("fs"), { execSync } = require("child_process");
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const HERE = __dirname;
const [, , file, outPrefix, ...flags] = process.argv;
const full = flags.includes("--full");
const hash = (flags.find((f) => f.startsWith("--hash=")) || "").slice(7);
const wait = +((flags.find((f) => f.startsWith("--wait=")) || "--wait=1500").slice(7));
const html = fs.readFileSync(path.resolve(file), "utf8");
const pageDir = path.dirname(path.resolve(file));

function ensureFont(pkg) {
  const dir = path.join(HERE, "node_modules", "@fontsource", pkg);
  if (!fs.existsSync(dir)) {
    try { execSync(`npm install --silent --save @fontsource/${pkg}`, { cwd: HERE, stdio: "ignore", timeout: 90000 }); } catch { /* unknown family */ }
  }
  return fs.existsSync(dir) ? dir : null;
}
function fontCss(url) {
  const u = new URL(url);
  let css = "";
  for (const fam of u.searchParams.getAll("family")) {
    const [name, spec = ""] = fam.split(":");
    const pkg = name.trim().toLowerCase().replace(/\s+/g, "-");
    const dir = ensureFont(pkg);
    if (!dir) { console.log("FONT MISSING (no @fontsource package):", name); continue; }
    let weights = (spec.match(/@([\d;.,]+)/) || [, "400;500;600;700"])[1].split(/[;,]/).map((w) => w.split("..")).flat().map(Number).filter(Boolean);
    if (spec.includes("..")) { const [a, b] = weights; weights = [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= a && w <= b); }
    for (const w of new Set(weights)) {
      for (const sub of ["latin", "latin-ext"]) {
        const f = path.join(dir, "files", `${pkg}-${sub}-${w}-normal.woff2`);
        if (fs.existsSync(f)) css += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:swap;src:url(http://fonts.local/${pkg}/${path.basename(f)}) format('woff2');}\n`;
      }
    }
  }
  return css;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const problems = [];
  for (const [name, vp, dsf] of [["mobile", { width: 390, height: 844 }, 2], ["desktop", { width: 1440, height: 900 }, 1]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) problems.push(`[${name}] console: ${m.text()}`); });
    page.on("pageerror", (e) => problems.push(`[${name}] pageerror: ${e.message}`));
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("http://page.local/")) {
        const rel = decodeURIComponent(new URL(url).pathname.slice(1));
        if (!rel) return route.fulfill({ body: html, contentType: "text/html" });
        const f = path.join(pageDir, rel);
        return fs.existsSync(f) ? route.fulfill({ path: f }) : route.abort();
      }
      if (url.startsWith("https://fonts.googleapis.com/css")) return route.fulfill({ body: fontCss(url), contentType: "text/css" });
      if (url.startsWith("http://fonts.local/")) {
        const [, pkg, fileName] = new URL(url).pathname.split("/");
        const fp = path.join(HERE, "node_modules", "@fontsource", pkg, "files", fileName);
        return fs.existsSync(fp) ? route.fulfill({ path: fp, contentType: "font/woff2" }) : route.abort();
      }
      if (url.includes("qrcode")) {
        const q = path.join(HERE, "..", "..", "research", "design", "qrcode.js");
        return fs.existsSync(q) ? route.fulfill({ path: q, contentType: "application/javascript" }) : route.abort();
      }
      return route.abort();
    });
    await page.goto("http://page.local/" + (hash ? "#" + hash : ""));
    await page.waitForTimeout(wait);
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ow > 0) problems.push(`[${name}] horizontal overflow: ${ow}px`);
    const out = `${outPrefix}-${name}.png`;
    await page.screenshot({ path: out, fullPage: full });
    console.log("wrote", out);
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "no problems");
})();
