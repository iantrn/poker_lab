import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../frontend/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const mime = { ".html":"text/html", ".js":"application/javascript", ".json":"application/json", ".webmanifest":"application/manifest+json", ".css":"text/css", ".png":"image/png", ".wasm":"application/wasm" };
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/poker_lab/")) { res.writeHead(404); res.end(); return; }
  const relative = decodeURIComponent(url.pathname.slice("/poker_lab/".length)) || "index.html";
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
});

async function run() {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Server address unavailable");
  const url = `http://127.0.0.1:${address.port}/poker_lab/`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) console.log("Browser navigation:", frame.url());
    });
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    assert.equal(response?.status(), 200);
    // The PWA may reload once when its first service worker takes control.
    // Do not consider V1 initialized until React has actually committed its shell.
    try {
      await page.waitForFunction(() =>
        window.PokerLab?.app?.initialized === true &&
        Boolean(window.PokerLabV2?.solver) &&
        document.querySelectorAll("[data-module]").length === 6 &&
        Boolean(navigator.serviceWorker.controller),
        null, { timeout: 45000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        url: location.href, readyState: document.readyState,
        rootPresent: Boolean(document.getElementById("root")),
        rootLength: document.getElementById("root")?.innerHTML.length ?? -1,
        moduleCount: document.querySelectorAll("[data-module]").length,
        appInitialized: window.PokerLab?.app?.initialized ?? null,
        solverAvailable: Boolean(window.PokerLabV2?.solver),
        alert: document.querySelector('[role="alert"]')?.textContent,
      })).catch((reason) => ({ evaluationFailed: String(reason) }));
      throw new Error(`V2 shell did not initialize: ${JSON.stringify(diagnostic)}; page errors: ${pageErrors.join("; ")}`, { cause: error });
    }
    // Wait for the PWA worker to claim its first tab and finish the V1-triggered reload.
    await page.waitForTimeout(1000);
    await page.waitForFunction(() =>
      document.querySelectorAll("[data-module]").length === 6 &&
      window.PokerLab?.app?.initialized === true &&
      Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
    const uiSnapshot = await page.evaluate(() => ({
      sections: document.querySelectorAll("[data-module]").length,
      rootPresent: Boolean(document.getElementById("root")),
      ready: document.readyState,
      sw: navigator.serviceWorker.controller?.state
    }));
    console.log("Browser UI ready:", JSON.stringify(uiSnapshot));
    assert.equal(uiSnapshot.sections, 6, "The React shell must render six page sections");
    assert.equal(await page.locator("[data-page]").count() > 5, true);
    assert.equal(await page.locator("#home").isVisible(), true);

    await page.locator('a[data-page="training"]').first().click();
    assert.equal(await page.locator("#training").isVisible(), true);
    assert.equal(await page.locator("#training-mode").inputValue(), "6max");

    await page.locator('a[data-page="lessons"]').first().click();
    assert.equal(await page.locator("#lessons").isVisible(), true);
    await page.waitForFunction(() => document.querySelectorAll(".pl-range-cell").length === 169, null, { timeout: 30000 });
    const matrix = page.locator(".pl-range-matrix");
    assert.equal(await matrix.count(), 1);
    const first = page.locator(".pl-range-cell").first();
    await first.click();
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    assert.equal((await page.locator(".pl-rv-detail").innerText()).includes("AA"), true);

    // Exercise the migrated Lessons, Puzzles, and Game Review modules in Chromium.
    await page.locator(".pl-lesson-open").first().waitFor({ timeout: 30000 });
    await page.locator(".pl-lesson-open").first().click();
    await page.locator("[data-lesson-content] .pl-lesson-title").waitFor({ timeout: 30000 });
    const completedBefore = await page.evaluate(() => window.PokerLabLessons.getProgress().completed);
    await page.locator("[data-lesson-content] .pl-lesson-complete").click();
    const completedAfter = await page.evaluate(() => window.PokerLabLessons.getProgress().completed);
    assert.equal(completedAfter, completedBefore + 1, "Completing a lesson must persist progress");

    await page.locator('a[data-page="tactics"]').first().click();
    assert.equal(await page.locator("#tactics").isVisible(), true);
    await page.locator('[data-puzzle-action="start"]').click();
    await page.locator("[data-puzzles-container] .pl-puzzle-title").waitFor({ timeout: 30000 });
    assert.equal(await page.locator("[data-puzzle-stats]").isVisible(), true);

    await page.locator('a[data-page="review"]').first().click();
    assert.equal(await page.locator("#review").isVisible(), true);
    await page.locator("[data-review-history] .pl-review-empty").waitFor({ timeout: 30000 });

    // Responsive behavior: mobile navigation is usable at phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav').last().locator('a[data-page="home"]').click();
    assert.equal(await page.locator("#home").isVisible(), true);
    await page.setViewportSize({ width: 1365, height: 768 });

    const score = await page.evaluate(async () => {
      const result = await window.PokerLabV2.solver.calculate({kind: "evaluate", cards:[14,13,12,11,10]});
      return result;
    });
    assert.deepEqual(score, [9,14]);

    // Two quick successive calculations must never both continue after a cache miss.
    const concurrency = await page.evaluate(async () => {
      const first = window.PokerLabV2.solver.calculate({ kind: "evaluate", cards: [46,45,44,43,42] });
      const second = window.PokerLabV2.solver.calculate({ kind: "evaluate", cards: [30,29,28,27,26] });
      const [one, two] = await Promise.allSettled([first, second]);
      return {
        first: one.status === "rejected" ? one.reason?.name : "fulfilled",
        second: two.status === "fulfilled" ? two.value : [two.reason?.message]
      };
    });
    assert.deepEqual(concurrency, { first: "AbortError", second: [9,14] });

    const registration = await page.evaluate(async () => {
      const worker = await navigator.serviceWorker.ready;
      return Boolean(worker.active);
    });
    assert.equal(registration, true);
    await context.setOffline(true);
    await page.reload({waitUntil:"domcontentloaded", timeout: 30000});
    await page.waitForFunction(() => window.PokerLab?.app?.initialized === true, null, {timeout:30000});
    const cachedRanges = await page.evaluate(async () => {
      const response = await fetch("./data/ranges/preflop/matrix/ranges.json");
      return Boolean(response.ok);
    });
    assert.equal(cachedRanges, true, "Range bundle must be available offline");
    assert.equal(await page.locator("#home").count(),1);
    assert.equal(pageErrors.length,0,`Runtime errors: ${pageErrors.join("; ")}`);
    console.log("Browser smoke: UI, matrix, WASM Worker, PWA & offline passed");
  } finally {
    await browser.close();
  }
}
try { await run(); } finally { await new Promise(resolve => server.close(resolve)); }
