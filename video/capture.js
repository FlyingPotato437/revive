// Drives the real Revive app with Puppeteer and captures the full product flow
// as frames, so the demo video shows someone actually using it.
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const OUT = path.join(__dirname, "product_frames");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = [];
let n = 0;

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

  async function shot(dur) {
    const file = `p${String(++n).padStart(4, "0")}.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    manifest.push({ file, dur });
  }
  async function injectCursor() {
    await page.evaluate(() => {
      if (document.getElementById("__cur")) return;
      const c = document.createElement("div");
      c.id = "__cur";
      c.style.cssText =
        "position:fixed;z-index:99999;left:-60px;top:-60px;pointer-events:none;transition:left .4s ease,top .4s ease;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));";
      c.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 14.5 L11.5 21.5 L14.5 20.2 L11.6 13.5 L18 13.5 Z" fill="#1f47c8" stroke="#fff" stroke-width="1.3"/></svg>';
      document.body.appendChild(c);
    });
  }
  async function cursorTo(re) {
    const box = await page.evaluate((s) => {
      const el = [...document.querySelectorAll("button,a")].find((b) =>
        new RegExp(s).test(b.textContent),
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, re);
    if (box)
      await page.evaluate(
        (x, y) => {
          const c = document.getElementById("__cur");
          if (c) {
            c.style.left = x - 3 + "px";
            c.style.top = y - 3 + "px";
          }
        },
        box.x,
        box.y,
      );
    await sleep(450);
    return box;
  }
  async function clickText(re) {
    await page.evaluate((s) => {
      const el = [...document.querySelectorAll("button,a")].find((b) =>
        new RegExp(s).test(b.textContent),
      );
      if (el) el.click();
    }, re);
  }
  async function hasText(re) {
    return page.evaluate((s) => new RegExp(s).test(document.body.innerText), re);
  }

  // 1) Homepage
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(800);
  await injectCursor();
  await shot(3.2);

  // 2) Sign in (demo) so the app is accessible, then open the playground
  await page.evaluate(() => fetch("/api/auth/demo", { method: "POST" }));
  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    /Run side-by-side demo/.test(document.body.innerText), { timeout: 15000 });
  await sleep(700);
  await injectCursor();
  await shot(3.2); // playground idle
  await cursorTo("Run side-by-side demo");
  await shot(0.8);

  // 3) Run it, capture the lanes progressing until it parks
  await clickText("Run side-by-side demo");
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    await shot(0.42);
    if (await hasText("Approve re-consent")) break;
    await sleep(180);
  }
  await injectCursor();
  await shot(3.6); // parked: classifier + re-approval slip

  // 4) The out-of-band re-approval page (how it actually works)
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((a) =>
      /reauthorize/.test(a.getAttribute("href") || ""));
    return a ? a.getAttribute("href") : null;
  });
  if (href) {
    await page.goto(BASE + href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      /Accept & resume run|Resume a parked run/.test(document.body.innerText), { timeout: 10000 });
    await sleep(600);
    await injectCursor();
    await shot(3.6); // consent screen
    await cursorTo("Accept & resume run");
    await shot(0.8);
    await clickText("Accept & resume run");
    await page.waitForFunction(() =>
      /Access granted/.test(document.body.innerText), { timeout: 10000 });
    await sleep(400);
    await shot(2.6); // access granted
  }

  // 5) Back to the run, capture resume -> completed
  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  const t1 = Date.now();
  let done = false;
  while (Date.now() - t1 < 14000) {
    await shot(0.42);
    if (await hasText("recovered|8/8 steps")) { done = true; }
    if (done && (await hasText("WITH REVIVE"))) break;
    await sleep(180);
  }
  // scroll to the outcome banner
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (n) => /With Revive/.test(n.textContent) && /restarts/.test(n.textContent) && n.children.length < 6,
    );
    if (el) el.scrollIntoView({ block: "center" });
  });
  await sleep(700);
  await shot(4.2); // outcome 4/8 vs 8/8

  // 6) Why it's different
  await page.goto(BASE + "/compare", { waitUntil: "networkidle0" });
  await sleep(900);
  await shot(4.0);

  fs.writeFileSync(path.join(__dirname, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("frames:", n, "duration:", manifest.reduce((a, b) => a + b.dur, 0).toFixed(1) + "s");
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
