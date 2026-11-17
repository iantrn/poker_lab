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

    // A complete V2 game session must render six seats and preserve the V1 action mount.
    const gameStarted = await page.evaluate(() => window.PokerLabTraining.createSession());
    assert.equal(gameStarted.success, true, JSON.stringify(gameStarted.errors ?? []));
    await page.waitForFunction(() =>
      document.querySelectorAll("#training-table .pl-seat").length === 6 &&
      Boolean(document.querySelector("#training-table .pl-hero-actions-mount #training-actions")),
      null, { timeout: 30000 });
    const gameState = await page.evaluate(() => window.PokerLabTraining.getGameState());
    assert.equal(gameState.players.length, 6);
    assert.equal(gameState.street, "preflop");
    assert.equal(await page.evaluate(() => window.PokerLabTraining.stopSession()), true);

    // Heads-up special position/action order also requires an actual rendered game.
    const headsUp = await page.evaluate(() => {
      const config = window.PokerLabTraining.updateConfig({ gameMode: "heads-up", playerCount: 2 });
      if (!config.success) return { success: false, errors: config.errors };
      return window.PokerLabTraining.createSession();
    });
    assert.equal(headsUp.success, true, JSON.stringify(headsUp.errors ?? []));
    await page.waitForFunction(() =>
      document.querySelectorAll("#training-table .pl-seat").length === 2,
      null, { timeout: 30000 });
    const headsUpState = await page.evaluate(() => window.PokerLabTraining.getGameState());
    assert.equal(headsUpState.players.length, 2);
    assert.equal(headsUpState.street, "preflop");
    assert.equal(await page.evaluate(() => window.PokerLabTraining.stopSession()), true);

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

    // Every exported Rust/WASM engine function must execute in a real Worker.
    const wasmPaths = await page.evaluate(async () => {
      const solver = window.PokerLabV2.solver;
      const equity = await solver.calculate({
        kind: "equity", holes: [0x12,0x13,0x22,0x23],
        board: [0x0e,0x0d,0x0c,0x0b,0x0a], iterations: 100, seed: 11
      });
      const equityRange = await solver.calculate({
        kind: "equityRange",hero:[0x0e,0x23],board:[0x0d,0x0c,0x0b,0x0a,0x02],
        villainPairs:[0x12,0x14,0x0e,0x32], weights:[1,10],iterations:100,seed:11
      });
      const range = await solver.calculate({
        kind: "range", cards: [0x02,0x13,0x24,0x35,0x06], weights: [1], width: 5
      });
      const cfr = await solver.calculate({
        kind: "cfr", payoffs: [1,-1,-1,1], rows: 2, cols: 2, iterations: 10000
      });
      const cfrTree = await solver.calculate({
        kind: "cfrTree",
        actors:[0,1,1,-1,-1,-1,-1],
        informationSets:[0,1,1,0,0,0,0],
        childOffsets:[0,2,4,6,6,6,6],
        childCounts:[2,2,2,0,0,0,0],
        children:[1,2,3,4,5,6],
        terminalUtilities:[0,0,0,1,-1,-1,1],
        iterations:10000
      });
      const weightedLoss = await solver.calculate({
        kind: "equityRange",
        hero: [0x2e, 0x3e], board: [0x02, 0x13, 0x24, 0x37, 0x09],
        villainPairs: [0x0d, 0x1d, 0x05, 0x16, 0x2e, 0x1e],
        weights: [1, 3, 100], iterations: 100, seed: 11
      });
      // Raw V1 range shape -> strict TS adapter -> packed cards -> Rust/WASM.
      const typedRange = await solver.calculateRangeEquity(
        [{ value:14, suit:"hearts" }, { value:14, suit:"spades" }],
        [{ value:2, suit:"clubs" }, { value:3, suit:"diamonds" },
         { value:4, suit:"hearts" }, { value:7, suit:"spades" },
         { value:9, suit:"clubs" }],
        [
          { cards:[{value:13,suit:"clubs"},{value:13,suit:"diamonds"}],weight:1 },
          { cards:[{value:5,suit:"clubs"},{value:6,suit:"diamonds"}],weight:3 },
          { cards:[{value:14,suit:"hearts"},{value:14,suit:"diamonds"}],weight:100 }
        ], 100, 11
      );
      return { equity, equityRange, weightedLoss, typedRange, range, cfr, cfrTree };
    });
    assert.deepEqual(wasmPaths.equity, [0,1,0], "Known royal-flush board must split");
    assert.deepEqual(wasmPaths.equityRange, [1,0,0], "Weighted range equity must filter blockers and evaluate exactly on river");
    assert.deepEqual(wasmPaths.weightedLoss, [0.25, 0, 0.75], "Weighted river enumeration honors blockers and weights");
    assert.deepEqual(wasmPaths.typedRange, wasmPaths.weightedLoss, "The typed range adapter preserves weighted equity results");
    assert.equal(wasmPaths.range[4], 1, "Weighted histogram must classify straight");
    assert.equal(wasmPaths.range.reduce((a,b) => a+b,0), 1);
    assert.equal(wasmPaths.cfrTree.length, 4);
    for (const probability of wasmPaths.cfrTree)
      assert.ok(Math.abs(probability - 0.5) < 0.04, "Rust CFR+ tree must approach an equilibrium");
    assert.equal(wasmPaths.cfr.length, 4);
    for (const probability of wasmPaths.cfr)
      assert.ok(Math.abs(probability - 0.5) < 0.04, "CFR+ equilibrium must be mixed");

    // The actual postflop solver worker must use WASM, not merely a separate test worker.
    const postflopBackend = await page.evaluate(async () => {
      const worker = new Worker("./pokerlab-solver-worker-v2.js");
      try {
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Postflop worker did not initialize")), 30000);
          worker.addEventListener("message", event => {
            if (event.data.id !== 123) return;
            clearTimeout(timeout);
            if (event.data.ok) resolve(event.data.result.backend);
            else reject(new Error(event.data.error || "Postflop worker failed"));
          });
          worker.addEventListener("error", event => reject(new Error(event.message)));
          worker.postMessage({id:123,task:"backend"});
        });
      } finally { worker.terminate(); }
    });
    assert.equal(postflopBackend, "wasm", "The real postflop solver worker must activate Rust/WASM evaluation");

    // Preview: the complete TypeScript main-thread postflop API in a dedicated
    // ESM Worker, without importScripts. The old worker is still production fallback.
    const typedBackend = await page.evaluate(async () => {
      const worker = window.PokerLabV2.createTypedPostflopWorker();
      try {
        return await new Promise((resolve,reject)=>{
          const timeout = setTimeout(()=>reject(new Error("Typed postflop Worker initialization timed out")),30000);
          worker.addEventListener("message",event=>{
            if(event.data.id!==979)return;
            clearTimeout(timeout);
            if(event.data.ok)resolve(event.data.result);
            else reject(new Error(event.data.error));
          });
          worker.addEventListener("error",event=>reject(new Error(event.message)));
          worker.postMessage({id:979,task:"backend"});
        });
      } finally {worker.terminate();}
    });
    assert.deepEqual(typedBackend,{backend:"wasm",implementation:"typescript"});


    // Statistical parity and full-pipeline timing: the V1 and V2 solvers use
    // independent random streams, so this is intentionally not bit-for-bit parity.
    const postflopEquity = await page.evaluate(async () => {
      const state = {
        street: "flop",
        board: [{value:2,suit:"clubs"},{value:7,suit:"diamonds"},{value:9,suit:"hearts"}],
        pot:10,currentPlayerId:"hero",handComplete:false,
        players: [
          {id:"hero",isHuman:true,folded:false,holeCards:[{value:14,suit:"spades"},{value:14,suit:"hearts"}],
            stack:90,amountToCall:0,actionOptions:{canBet:true}},
          {id:"villain",isHuman:false,isBot:true,folded:false,holeCards:null,stack:90,position:"BB"}
        ]
      };
      async function measure(url) {
        const worker = new Worker(url);
        const begin = performance.now();
        try {
          const result = await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(new Error("Postflop equity worker timed out")),30000);
            worker.addEventListener("message",event=>{
              if(event.data.id !== 77 || event.data.progress !== undefined) return;
              clearTimeout(timeout);
              if(event.data.ok) resolve(event.data.result);
              else reject(new Error(event.data.error));
            });
            worker.addEventListener("error",event=>reject(new Error(event.message)));
            worker.postMessage({id:77,task:"equity",input:state});
          });
          return {result,elapsed:performance.now()-begin};
        } finally {worker.terminate();}
      }
      return {legacy:await measure("./pokerlab-solver-worker.js"),
        accelerated:await measure("./pokerlab-solver-worker-v2.js")};
    });
    const legacyEquity = postflopEquity.legacy.result;
    const rustEquity = postflopEquity.accelerated.result;
    for (const result of [legacyEquity,rustEquity]) {
      assert.equal(result.iterations,1800);
      assert.equal(result.wins+result.ties+result.losses,result.iterations);
      assert.ok(result.equity>=0 && result.equity<=1);
    }
    assert.ok(Math.abs(legacyEquity.equity-rustEquity.equity)<0.12,
      "Legacy and WASM-accelerated solver equities must agree within Monte Carlo tolerance");
    console.log("Postflop worker end-to-end equity: V1 "+
      postflopEquity.legacy.elapsed.toFixed(1)+"ms, WASM V2 "+
      postflopEquity.accelerated.elapsed.toFixed(1)+"ms (including cold initialization and range loading)");

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
