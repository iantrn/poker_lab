import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "../frontend/node_modules/playwright-core/index.mjs";

const versions = ["main", "nocturne", "reconstruction"];
const builds = process.argv.slice(2).map(value => path.resolve(value));
assert.equal(builds.length, versions.length);
const out = path.join(builds[2], "ui-preview", "comparaison");
await mkdir(out, {recursive:true});
const mime = {".js":"application/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".html":"text/html",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json"};
let active = 0;
const server = createServer(async (req,res) => {
  const prefix = "/poker_lab/";
  const url = new URL(req.url,"http://localhost");
  const file = path.resolve(builds[active],decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html");
  if (!url.pathname.startsWith(prefix) || !file.startsWith(builds[active]+path.sep)) {res.writeHead(404).end();return;}
  try { const bytes = await readFile(file);res.writeHead(200,{"Content-Type":mime[path.extname(file)] || "application/octet-stream","Cache-Control":"no-store"}).end(bytes); }
  catch {res.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const url = "http://127.0.0.1:"+server.address().port+"/poker_lab/";
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || "/usr/bin/google-chrome",args:["--no-sandbox"]});
const screens = [];
const sizes = [[1366,768],[1080,810],[390,844]];
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.PokerLab?.app?.initialized);
  await page.locator("#home").waitFor();
}
async function capture(page, name) {
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.scrollTo(0,0));
    const key = name+"-"+width+"x"+height;
    await page.screenshot({path:path.join(out,versions[active]+"-"+key+".png"),animations:"disabled"});
    if (!screens.includes(key)) screens.push(key);
  }
  await page.setViewportSize({width:1366,height:768});
}
try {
  for (active=0;active<3;active++) {
    const context = await browser.newContext({viewport:{width:1366,height:768}});
    const page = await context.newPage();
    await ready(page);
    await capture(page,"accueil");
    await page.evaluate(() => window.PokerLabNavigation.navigateTo("tactics"));
    await page.waitForFunction(() => window.PokerLabPuzzles.selectPuzzle("pf-btn-aqs-open").success);
    await page.evaluate(() => window.PokerLabPuzzles.renderPuzzle(document.querySelector("[data-puzzles-container]")));
    await page.getByRole("button",{name:/Relancer.*ouverture/i}).click();
    await page.locator(".pl-puzzle-result").waitFor();
    await capture(page,"exercice-AQs");
    await page.evaluate(() => window.PokerLabNavigation.navigateTo("training"));
    await capture(page,"configuration");
    await page.evaluate(() => {
      let seed=1945;
      Math.random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    });
    await page.locator('[data-training-action="start"]').click();
    await page.locator(".pl-action-btn-fold").waitFor();
    await capture(page,"table-6max");
    // Play through normal buttons until the solver is available on a human turn.
    for (let decision=0;decision<40;decision++) {
      const action = await page.waitForFunction(() => {
        if (document.querySelector(".pl-solve-button:enabled")) return ".pl-solve-button";
        if (document.querySelector("dialog[open] [data-training-action=next-hand]")) return "dialog[open] [data-training-action=next-hand]";
        return [".pl-action-btn-check",".pl-action-btn-call"].find(selector=>document.querySelector(selector+":enabled"));
      });
      const selector=await action.jsonValue();
      await page.locator(selector).click();
      if (selector===".pl-solve-button") break;
    }
    await page.locator(".pl-solve-dialog[open] .pl-solve-heading").waitFor({timeout:120000});
    await capture(page,"solveur-postflop");
    await page.locator(".pl-solve-details-toggle").click();
    await capture(page,"solveur-details");
    console.log("Captures terminées",versions[active]);
    await context.close();
  }
  // Exercise an installed previous frontend and its replacement on the same origin.
  for (const baseline of [0,1]) {
    active=baseline;
    const context=await browser.newContext();
    const page=await context.newPage();
    await ready(page);
    active=2;
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();}).catch(error=>{
      if (!String(error).includes("context was destroyed")) throw error;
    });
    await page.waitForFunction(()=>!!document.querySelector(".masthead"),null,{timeout:45000});
    await context.setOffline(true);
    await page.reload();
    await page.locator(".masthead").waitFor();
    await context.close();
    console.log("Mise à jour puis rechargement hors ligne réussis depuis",versions[baseline]);
  }
  const rows=screens.map(key=>'<section><h2>'+key+'</h2><div>'+versions.map(v=>'<figure><figcaption>'+v+'</figcaption><a href="'+v+'-'+key+'.png"><img loading="lazy" src="'+v+'-'+key+'.png" alt="'+v+' '+key+'"></a></figure>').join("")+'</div></section>').join("");
  await writeFile(path.join(out,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><title>PokerLab · comparaison</title><style>body{background:#111b24;color:white;font:16px system-ui;padding:2vw}section div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0}img{width:100%}body:has(:checked) img{filter:grayscale(1)}</style><h1>Comparaison des interfaces</h1><label><input type="checkbox"> Niveaux de gris</label>'+rows+'</html>');
} finally {
  await browser.close();
  server.close();
}
