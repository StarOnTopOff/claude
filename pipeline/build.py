"""Assemble the single-file web app.

dist/index.html     full document (GitHub Pages, local file, any static host)
dist/artifact.html  same page without the document wrapper (Claude artifact)

The backtest + fixtures JSON is gzipped and base64-embedded; the page inflates
it with DecompressionStream, so the app works offline from a single file.
"""
import base64
import gzip
import json
import re

from config import DIST, OUT, ROOT, WEB

LINKS_FILE = ROOT / "links.json"  # {"artifact": "...", "pages": "..."} used by the QR code button
QR_CDN = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"
QR_FALLBACK = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"


def build():
    bt = json.loads((OUT / "method.json").read_text())
    fx = json.loads((OUT / "fixtures.json").read_text())
    method = bt.pop("method")
    payload = json.dumps({"bt": bt, "fx": fx, "method": method}, separators=(",", ":"), ensure_ascii=False)
    b64 = base64.b64encode(gzip.compress(payload.encode(), 9)).decode()

    css = (WEB / "styles.css").read_text()
    js = "\n".join(p.read_text() for p in sorted((WEB / "js").glob("*.js")))
    links = json.loads(LINKS_FILE.read_text()) if LINKS_FILE.exists() else {}
    head = (WEB / "head.html").read_text().replace("/*__CSS__*/", css)
    body = (WEB / "body.html").read_text()
    scripts = (
        f'<script id="payload" type="application/octet-stream">{b64}</script>\n'
        f'<script>window.ABYSSE_LINKS = {json.dumps(links)};</script>\n'
        f'<script src="{QR_CDN}" onerror="var s=document.createElement(\'script\');s.src=\'{QR_FALLBACK}\';document.head.appendChild(s)"></script>\n'
        f"<script>\n{js}\n</script>\n"
    )
    DIST.mkdir(parents=True, exist_ok=True)
    full = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        f"{head}</head>\n<body>\n{body}{scripts}</body>\n</html>\n"
    )
    (DIST / "index.html").write_text(full)
    (DIST / "artifact.html").write_text(head + body + scripts)
    # tiny sanity check: no leftover placeholders
    assert not re.search(r"/\*__\w+__\*/", full)
    print(f"dist/index.html {len(full) / 1e6:.2f} MB (payload {len(b64) / 1e6:.2f} MB, raw json {len(payload) / 1e6:.2f} MB)")


if __name__ == "__main__":
    build()
