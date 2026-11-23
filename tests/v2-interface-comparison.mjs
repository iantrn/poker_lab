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
const referenceSpots = new Map();
const sizes = [[1366,768],[1080,810],[390,844]];
async function ready(page) {
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller && window.PokerLab?.app?.initialized);
  await page.locator("#home").waitFor();
}
async function capture(page, name) {
  if (name==="table-6max" || name==="solveur-postflop") {
    const spot = await page.evaluate(()=>{
      const game=window.PokerLabTraining.getGameState();
      return {street:game.street, pot:game.pot, board:game.board, seats:game.players.map(p=>({
        position:p.position,stack:p.stack,bet:p.streetBet,folded:p.folded,hand:p.isHuman?p.holeCards:undefined
      }))};
    });
    if (active===0) referenceSpots.set(name,spot);
    else assert.deepEqual(spot,referenceSpots.get(name),"Les trois versions doivent afficher le même spot : "+name);
  }
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.scrollTo(0,0));
    if (name==="exercice-AQs") await page.locator(".pl-puzzle-result").scrollIntoViewIfNeeded();
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
    if (active===2) {
      for (const [width,height] of [[1920,1080],[1366,768],[1080,810],[1024,768],[768,1024],[390,844],[375,667],[320,640]]) {
        await page.setViewportSize({width,height});
        for (const route of ["home","training","tactics","lessons","review","settings"]) {
          await page.evaluate(destination=>window.PokerLabNavigation.navigateTo(destination),route);
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert.ok(overflow<=1,route+" déborde de "+overflow+" px à "+width+" × "+height);
        }
      }
      await page.setViewportSize({width:1366,height:768});
    }
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
      // Only this browser fixture fixes the deck shuffle. Production uses Web Crypto.
      let shuffle=1001;
      const nativeRandom=crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues=array=>{
        if (!(array instanceof Uint32Array)) return nativeRandom(array);
        for(let i=0;i<array.length;i++) array[i]=shuffle=(Math.imul(1664525,shuffle)+1013904223)>>>0;
        return array;
      };
    });
    await page.locator('[data-training-action="start"]').click();
    await page.locator(".pl-action-btn-fold").waitFor();
    await capture(page,"table-6max");
    const options=page.locator(".table-menu-trigger");
    if (await options.count()) {
      await options.click();
      await capture(page,"options-table");
      await options.press("Escape");
      assert.equal(await options.evaluate(node=>node.parentElement.open),false);
    } else {
      await page.locator('.pl-table-settings').click();
      await page.locator('#settings').waitFor();
      await capture(page,"options-table");
      await page.evaluate(()=>window.PokerLabNavigation.navigateTo("training"));
    }
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
    await page.evaluate(()=>window.PokerLabNavigation.navigateTo("settings"));
    await page.getByRole("checkbox",{name:/Réduire les animations/}).check();
    await context.setOffline(true);
    await page.reload();
    await page.locator(".masthead").waitFor();
    assert.ok(await page.getByRole("checkbox",{name:/Réduire les animations/}).isChecked());
    await context.close();
    console.log("Mise à jour puis rechargement hors ligne réussis depuis",versions[baseline]);
  }
  // A compact contact sheet in the QA log allows visual inspection even
  // when the artifact ZIP is opened from another machine.
  const sheet = await browser.newPage({ viewport:{width:1152,height:260},deviceScaleFactor:1 });
  for (const key of ["accueil-1366x768","table-6max-1080x810","exercice-AQs-390x844","solveur-postflop-1366x768"]) {
    const columns = await Promise.all(versions.map(async version => {
      const bytes = await readFile(path.join(out,version+"-"+key+".png"));
      return '<figure><figcaption>'+version+'</figcaption><img src="data:image/png;base64,'+bytes.toString("base64")+'"></figure>';
    }));
    await sheet.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#101820;color:white;display:flex;font:14px system-ui}figure{margin:0;width:33.333%;padding:4px}img{display:block;width:100%;height:230px;object-fit:contain;object-position:top}figcaption{padding:2px}</style>'+columns.join(""));
    await sheet.locator("img").evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    const bytes = await sheet.screenshot({type:"jpeg",quality:60});
    await writeFile(path.join(out,key+"-contact.jpg"),bytes);
    const encoded=bytes.toString("base64");
    for(let start=0;start<encoded.length;start+=2048) console.log("CONTACT",key,start,encoded.slice(start,start+2048));
  }
  await sheet.close();
  const rows=screens.map(key=>'<section><h2>'+key+'</h2><div>'+versions.map(v=>'<figure><figcaption>'+v+'</figcaption><a href="'+v+'-'+key+'.png"><img loading="lazy" src="'+v+'-'+key+'.png" alt="'+v+' '+key+'"></a></figure>').join("")+'</div></section>').join("");
  await writeFile(path.join(out,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><title>PokerLab · comparaison</title><style>body{background:#111b24;color:white;font:16px system-ui;padding:2vw}section div{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0}img{width:100%}body:has(:checked) img{filter:grayscale(1)}</style><h1>Comparaison des interfaces</h1><label><input type="checkbox"> Niveaux de gris</label>'+rows+'</html>');
} finally {
  await browser.close();
  server.close();
}
