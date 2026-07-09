#!/usr/bin/env python3
"""Render Revive logo PNGs (transparent) from the brand mark + Space Grotesk wordmark."""
import os, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "public", "brand")
os.makedirs(OUT, exist_ok=True)
FONTS_CSS = open(os.path.join(HERE, "fonts", "fonts-local.css")).read()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

MARK = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="{s}" height="{s}">
  <rect x="1" y="1" width="62" height="62" fill="#edf0ff" stroke="#151922" stroke-width="2" />
  <circle cx="32" cy="32" r="14" fill="none" stroke="#4967f2" stroke-width="5.5"
    stroke-dasharray="63.33 10.56 14.07 0" transform="rotate(-66 32 32)" />
  <circle cx="32" cy="32" r="4" fill="#151922" />
</svg>"""

def page(body, w, h):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONTS_CSS}
*{{margin:0;padding:0}} html,body{{width:{w}px;height:{h}px;background:transparent;overflow:hidden}}
.row{{display:flex;align-items:center;gap:{int(h*0.22)}px;height:100%;padding-left:8px}}
.word{{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.04em;font-size:{int(h*0.62)}px;line-height:1}}
</style></head><body>{body}</body></html>"""

jobs = {
    # icon only, 1024px
    "revive-mark.png": (1024, 1024, f'<div style="display:flex;align-items:center;justify-content:center;height:100%">{MARK.format(s=980)}</div>'),
    # wordmark for light backgrounds (ink text)
    "revive-logo-light.png": (2400, 560, f'<div class="row">{MARK.format(s=470)}<div class="word" style="color:#12151d">Revive<span style="color:#4967f2">.</span></div></div>'),
    # wordmark for dark backgrounds (white text)
    "revive-logo-dark.png": (2400, 560, f'<div class="row">{MARK.format(s=470)}<div class="word" style="color:#ffffff">Revive<span style="color:#8ea0ff">.</span></div></div>'),
    # text-only wordmark, light bg
    "revive-wordmark.png": (1900, 560, f'<div class="row"><div class="word" style="color:#12151d">Revive<span style="color:#4967f2">.</span></div></div>'),
}

for name, (w, h, body) in jobs.items():
    src = os.path.join(HERE, "slides", "_logo_tmp.html")
    with open(src, "w") as f: f.write(page(body, w, h))
    out = os.path.join(OUT, name)
    if os.path.exists(out): os.remove(out)
    proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--no-sandbox", "--disable-crashpad", "--use-mock-keychain", "--password-store=basic",
        "--no-first-run", f"--user-data-dir=/tmp/chrome-logo",
        f"--window-size={w},{h}", "--force-device-scale-factor=2",
        "--default-background-color=00000000",
        f"--screenshot={out}", f"file://{src}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + 40; size = -1
    while time.time() < deadline:
        if os.path.exists(out):
            sz = os.path.getsize(out)
            if sz > 0 and sz == size: break
            size = sz
        time.sleep(0.5)
    proc.kill(); proc.wait()
    subprocess.run(["rm","-rf","/tmp/chrome-logo"], capture_output=True)
    print(name, os.path.getsize(out))
print("done ->", OUT)
