import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "../frontend/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const mime = { ".html":"text/html", ".js":"application/javascript", ".json":"application/json", ".webmanifest":"application/manifest+json", ".css":"text/css", ".png":"image/png", ".svg":"image/svg+xml", ".wasm":"application/wasm" };
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
  const isWebKit=process.env.PLAYWRIGHT_BROWSER==="webkit";
  const browser = await (isWebKit ? webkit : chromium).launch(
    isWebKit ? {headless:true} : {
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"]
    }
  );
  try {
    const context = await browser.newContext({ serviceWorkers: "allow", viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    const captureUi = async (name) => {
      if (process.env.POKERLAB_CAPTURE_UI !== "1") return;
      const directory = path.join(root, "ui-preview");
      mkdirSync(directory, { recursive: true });
      const engine = isWebKit ? "webkit" : "chromium";
      await page.screenshot({
        path: path.join(directory, engine + "-" + name + ".png"),
        animations: "disabled"
      });
    };
    const captureGameElement = async (name, selector) => {
      if (process.env.POKERLAB_CAPTURE_UI !== "1") return;
      const directory = path.join(root, "ui-preview");
      mkdirSync(directory, { recursive: true });
      const engine = isWebKit ? "webkit" : "chromium";
      await page.locator(selector).screenshot({
        path: path.join(directory, engine + "-" + name + ".png"),
        animations: "disabled",
        timeout: 20000
      });
    };
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
    // The static SVG mark must be rendered, not a broken <img>. In production
    // GitHub Pages serves SVG with its image MIME type; mirror that in smoke.
    await page.waitForFunction(() => {
      const mark = document.querySelector("img.pl-brand-mark");
      return mark?.complete === true && mark.naturalWidth > 0;
    }, null, { timeout: 10000 });
    const logoMime = await page.evaluate(async () => {
      const mark = document.querySelector("img.pl-brand-mark");
      const response = await fetch(mark.src);
      return { status: response.status, mime: response.headers.get("content-type") };
    });
    assert.equal(logoMime.status, 200);
    assert.match(logoMime.mime ?? "", /image\/svg\+xml/i);
    await captureUi("home-desktop");
    // The desktop navigation rail is a real topology change above 1380px.
    await page.setViewportSize({width:1600,height:900});
    await captureUi("home-sidebar-wide-desktop");
    await page.setViewportSize({width:1365,height:768});

    // V2-owned React contract: assert stable ids, page anchors, and hooks
    // without relying on the archived V1 HTML as a runtime test fixture.
    const mounted = await page.evaluate(() => {
      const mount = document.getElementById("app");
      const all = mount ? [mount, ...mount.querySelectorAll("*")] : [];
      return {
        ids: all.filter(el => el.id).map(el => el.id),
        hooks: all.flatMap(el => [...el.attributes]
          .filter(attr => attr.name.startsWith("data-"))
          .map(attr => attr.name + "=" + attr.value)),
        navigation: all.filter(el => el.getAttribute("href")?.startsWith("#"))
          .map(el => el.getAttribute("href").slice(1))
      };
    });
    assert.equal(new Set(mounted.ids).size, mounted.ids.length,
      "V2 React must never render duplicate IDs");
    for (const id of ["app", "home", "training", "tactics", "lessons", "review", "settings"])
      assert.ok(mounted.ids.includes(id), "Missing V2 React mount ID: " + id);
    for (const pageName of ["home", "training", "tactics", "lessons", "review", "settings"])
      assert.ok(mounted.navigation.includes(pageName), "Missing V2 navigation: " + pageName);
    assert.ok(mounted.hooks.length >= 31, "V2 must retain imperative data hooks");

    assert.equal(await page.locator("[data-page]").count() > 5, true);
    assert.equal(await page.locator("#home").isVisible(), true);
    // Home is now React-owned. Duplicate legacy markup or missing card
    // navigation would invalidate the incremental component migration.
    assert.equal(await page.locator("#home > .mb-8").count(), 1);
    assert.equal(await page.locator("#home .pl-home-card").count(), 5);
    assert.equal(await page.locator("#home .pl-home-primary-link").count(), 1);
    assert.match(await page.locator("#home h2").textContent(), /Progresse avec méthode/);

    await page.locator('#home .pl-home-primary-link').click();
    assert.equal(await page.locator("#training").isVisible(), true);
    assert.equal(await page.locator("#training-mode").inputValue(), "6max");
    // React owns training configuration but the typed session module must
    // still receive the exact native form change events and sync every input.
    assert.equal(await page.locator('#training #training-configuration').count(),1);
    assert.equal(await page.locator('#training #training-table').count(),1);
    assert.equal(await page.locator('#training #training-actions').count(),1);
    await page.locator("#training-mode").selectOption("heads-up");
    assert.equal(await page.locator("#training-player-count").inputValue(),"2");
    await page.locator("#training-mode").selectOption("6max");
    assert.equal(await page.locator("#training-player-count").inputValue(),"6");
    assert.equal(await page.locator('#training .pl-page-panel').count(), 1);
    assert.equal(await page.locator('#training .pl-training-notes .pl-training-note').count(), 2);
    const setupSizes = await page.locator('#training-configuration .pl-field-control').evaluateAll(
      elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(setupSizes.length === 4 && setupSizes.every(height => height >= 44),
      "Training configuration controls must be touch accessible");
    await captureUi("training-configuration-desktop");


    // A complete V2 game session must render six seats and preserve the V1 action mount.
    const gameStarted = await page.evaluate(() => window.PokerLabTraining.createSession());
    assert.equal(gameStarted.success, true, JSON.stringify(gameStarted.errors ?? []));
    await page.waitForFunction(() =>
      document.querySelectorAll("#training-table .pl-seat").length === 6 &&
      Boolean(document.querySelector("#training-game > #training-actions.pl-action-panel")),
      null, { timeout: 30000 });
    const gameState = await page.evaluate(() => window.PokerLabTraining.getGameState());
    assert.equal(gameState.players.length, 6);
    assert.equal(gameState.street, "preflop");
    assert.equal(await page.locator("#training-table .pl-player-avatar").count(), 6);
    assert.equal(await page.locator("#training-table .pl-player-avatar svg").count(), 6);
    assert.equal(await page.locator("#training-table .pl-seat-hero").count(), 1);
    assert.equal(await page.locator("#training-table .pl-table-silhouette").count(), 0,
      "The rejected SVG table must not be rendered");
    assert.equal(await page.locator('#training-table .pl-table-settings[href="#settings"]').count(), 1,
      "The modern settings shortcut must be preserved");
    assert.equal(await page.locator('#training-table .pl-felt').count(), 1,
      "The previous real CSS poker felt must remain present");
    assert.equal(await page.locator("#training-solver-dock > .pl-solve-button").count(), 1);
    assert.equal(await page.locator("#training-solver-dock > .pl-solve-dialog").count(), 1);
    assert.equal(await page.locator("#training-solver-dock > .pl-solve-button").isDisabled(), true);
    assert.equal(await page.locator("#training-actions [data-postflop-solve]").count(), 0);
    // Fold fixture: change only a copied presentation state, never the live
    // poker engine. The bot must be obviously folded with a solid FOLD badge.
    const foldedVisual = await page.evaluate(() => {
      const live = window.PokerLabTraining.getGameState();
      const mock = { ...live, players: live.players.map(player => ({ ...player })) };
      const bot = mock.players.find(player => !player.isHuman);
      if (!bot) throw new Error("Six-max fold visual fixture requires a bot");
      bot.folded = true;
      const mount = document.getElementById("training-table");
      window.PokerLabTable.render(mount, mock);
      const seat = [...mount.querySelectorAll(".pl-seat")].find(el => el.dataset.playerId === bot.id);
      const badge = seat?.querySelector(".pl-badge-folded");
      if (!seat || !badge) throw new Error("Folded bot lacks its FOLD indicator");
      const badgeStyle = getComputedStyle(badge);
      const identityStyle = getComputedStyle(seat.querySelector(".pl-player-info"));
      const groupStyle = getComputedStyle(seat.querySelector(".pl-player-badges"));
      const cardStyle = getComputedStyle(seat.querySelector(".pl-player-cards"));
      return {
        folded: seat.classList.contains("is-folded"),
        text: badge.textContent,
        background: badgeStyle.backgroundColor,
        textColor: badgeStyle.color,
        badgeHeight: badge.getBoundingClientRect().height,
        identityOpacity: Number(identityStyle.opacity),
        badgeOpacity: Number(groupStyle.opacity),
        cardOpacity: Number(cardStyle.opacity),
        otherFolded: [...mount.querySelectorAll(".pl-seat:not(.is-folded) .pl-badge-folded")].length
      };
    });
    assert.equal(foldedVisual.folded, true);
    assert.equal(foldedVisual.text, "FOLD");
    assert.equal(foldedVisual.background, "rgb(73, 49, 58)");
    assert.equal(foldedVisual.textColor, "rgb(255, 233, 227)");
    assert.ok(foldedVisual.badgeHeight >= 23, "Fold label must be readable");
    assert.ok(foldedVisual.identityOpacity <= .4,
      "Folded bot identity should be visibly muted");
    assert.equal(foldedVisual.badgeOpacity, 1,
      "FOLD label must not fade with the folded player identity");
    assert.equal(foldedVisual.cardOpacity, 1,
      "Do not tint or fade the original blue playing-card backs");
    assert.equal(foldedVisual.otherFolded, 0,
      "Active opponents must not receive a FOLD label");
    await page.evaluate(() => window.PokerLabTable.render(
      document.getElementById("training-table"), window.PokerLabTraining.getGameState()
    ));

    const feltDimensions = await page.locator("#training-table .pl-felt").evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.ok(feltDimensions.width / feltDimensions.height > 2,
      "New desktop poker felt must be more rectangular than oval");

    // Minuit Cuivre visual geometry: preserve semantics, seats, native cards,
    // hand summary and solver; compare actual DOM rectangles, not old red-rail pixels.
    const verifyTableGeometry = async (mobile) => {
      const geometry = await page.evaluate(() => {
        const rect = el => {
          const r = el.getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
            midX:r.left+r.width/2,midY:r.top+r.height/2,width:r.width,height:r.height};
        };
        const table = document.querySelector("#training-table .pl-table-container");
        const felt = rect(table.querySelector(".pl-felt"));
        const upper = [...table.querySelectorAll(".pl-seat-upper .pl-player-info")].map(rect)
          .sort((a,b)=>a.midX-b.midX);
        const lower = [...table.querySelectorAll(".pl-seat-lower .pl-player-info")].map(rect)
          .sort((a,b)=>a.midX-b.midX);
        const hand = rect(table.querySelector(".pl-hand-strength"));
        const solverButton = document.querySelector("#training-solver-dock > .pl-solve-button");
        const solver = rect(solverButton);
        const backs = [...table.querySelectorAll(".pl-seat .pl-card--back")];
        return {
          frame:rect(table), felt, upper, lower, hand, solver,
          stage:rect(document.querySelector(".pl-live-table-stage")),
          solverOpacity:Number(getComputedStyle(solverButton).opacity),
          solverDisabled:solverButton.disabled,
          cardWidths:backs.map(el=>rect(el).width),
          cardBacks:backs.map(el=>getComputedStyle(el).backgroundImage),
          emptyCount:table.querySelectorAll(".pl-board .pl-card--empty").length,
          handText:table.querySelector(".pl-hand-strength-value")?.textContent?.trim() ?? "",
          detailCount:table.querySelectorAll(".pl-hand-strength-detail").length,
          overflow:document.documentElement.scrollWidth-innerWidth
        };
      });
      assert.equal(geometry.upper.length,3,"Six-max must display three far-side opponents");
      assert.equal(geometry.lower.length,3,"Six-max must display two near-side opponents and hero");
      for (const rail of [geometry.upper,geometry.lower]) {
        assert.ok(rail[0].midX<rail[1].midX && rail[1].midX<rail[2].midX,
          "Seats must remain in clockwise spatial order");
        for(let i=0;i<2;i++) assert.ok(rail[i].right<=rail[i+1].left+3,
          "Seat capsules must never overlap");
      }
      assert.ok(Math.max(...geometry.upper.map(x=>x.midY))-Math.min(...geometry.upper.map(x=>x.midY))<3,
        "Far-side player baseline must stay aligned");
      assert.ok(geometry.lower[1].midY>geometry.lower[0].midY+25 &&
        geometry.lower[1].midY>geometry.lower[2].midY+25,
        "The hero must sit below the two side opponents, creating a real poker table ring");
      assert.ok(Math.abs(geometry.lower[0].midY-geometry.lower[2].midY)<3,
        "Near-side opponents should align across the table");
      assert.ok(geometry.upper.every(seat=>seat.bottom<=geometry.felt.top+5),
        "Far-side opponents remain outside the felt");
      assert.ok(geometry.lower[1].top>=geometry.felt.bottom-5,
        "Hero capsule stays beyond the near table edge");
      assert.ok(geometry.frame.height >= (mobile?500:475) &&
        geometry.frame.height <= (mobile?650:650), "Minuit Cuivre table height must stay bounded");
      assert.ok(geometry.hand.height>=48 && geometry.hand.height<=62);
      assert.ok(geometry.hand.bottom<=geometry.upper[1].top-3,
        "Hand strength must not cover the middle upper player");
      assert.ok(geometry.solver.right<=geometry.stage.right+2,
        "Solver must not escape the game stage");
      assert.ok(Math.abs(geometry.hand.midY-geometry.solver.midY)<=15,
        "Solver should be aligned with hand strength");
      assert.ok(geometry.hand.top>=geometry.frame.top+3);
      assert.equal(geometry.solverDisabled,true);
      assert.ok(geometry.solverOpacity<.6);
      assert.equal(geometry.detailCount,0);
      assert.ok(geometry.cardWidths.length>=8 &&
        geometry.cardWidths.every(w=>w>=(mobile?28:37)),
        "Native hole cards must remain legible");
      assert.equal(new Set(geometry.cardBacks).size,1,
        "All unrevealed cards should keep their original navy back");
      assert.ok(/rgb\(23, 45, 80\)|#172d50/i.test(geometry.cardBacks[0]));
      assert.equal(geometry.emptyCount,5);
      assert.ok(geometry.overflow<=1,"No horizontal overflow");
      return geometry;
    };

    const desktopGeometry = await verifyTableGeometry(false);
    assert.ok(desktopGeometry.handText.length>0,"Hand strength label must be present");

    // The user should never have to scroll down from the table to reach
    // the decision buttons on a landscape iPad. Verify geometry with the
    // actual game, not just the configured CSS or detached mock elements.
    // On landscape tablets, actions sit beside the felt so both can remain visible.
    // Assert real geometry, card clearance and touch targets.
    const verifyTabletLandscapeControls = async (width, height) => {
      await page.setViewportSize({width,height});
      await page.evaluate(() => window.scrollTo(0,0));
      const layout = await page.evaluate(() => {
        const r=el=>{
          const b=el.getBoundingClientRect();
          return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,
            midX:b.left+b.width/2,midY:b.top+b.height/2,width:b.width,height:b.height};
        };
        const table=document.querySelector("#training-table .pl-table-container");
        const actions=document.querySelector("#training-game > #training-actions.pl-action-panel");
        const buttons=[...actions.querySelectorAll(".pl-action-buttons button")];
        const presets=[...actions.querySelectorAll(".pl-bet-presets button")];
        const felt=r(table.querySelector(".pl-felt"));
        const board=r(table.querySelector(".pl-board"));
        const pairs=[...table.querySelectorAll(".pl-seat")].map(seat=>({
          rail:seat.classList.contains("pl-seat-upper")?"upper":"lower",
          side:seat.classList.contains("pl-seat-side"),
          cards:[...seat.querySelectorAll(".pl-player-cards > *")].map(r),
          pill:r(seat.querySelector(".pl-player-info"))
        }));
        return {
          viewport:{width:innerWidth,height:innerHeight},
          table:r(table),actions:r(actions),felt,board,pairs,
          headerVisible:getComputedStyle(document.querySelector("#training .pl-page-header")).display,
          buttonCount:buttons.length,
          buttonMinimum:buttons.length?Math.min(...buttons.map(el=>r(el).height)):0,
          presetMinimum:presets.length?Math.min(...presets.map(el=>r(el).height)):0,
          horizontalOverflow:document.documentElement.scrollWidth-innerWidth
        };
      });
      console.log("Minuit Cuivre tablet",JSON.stringify({
        width,height,tableHeight:layout.table.height,feltHeight:layout.felt.height,
        tableBottom:layout.table.bottom,actionsBottom:layout.actions.bottom
      }));
      assert.equal(layout.headerVisible,"none");
      assert.ok(layout.table.height>=495 && layout.table.height<=710);
      assert.ok(layout.felt.height>=220,"Felt must retain depth for board and bets");
      assert.ok(layout.table.width>=650,"All six player positions need usable width");
      assert.ok(layout.actions.left>=layout.table.right+6,
        "Touch decisions must sit beside the felt without overlap");
      assert.ok(Math.abs(layout.actions.top-layout.table.top)<5,
        "Table and touch decisions should share a horizontal row");
      assert.ok(layout.actions.bottom<=layout.viewport.height-6,
        "All decision controls should fit on a tablet landscape screen");
      assert.ok(layout.table.bottom<=layout.viewport.height-6);
      assert.ok(layout.buttonCount>=2 && layout.buttonMinimum>=44);
      assert.ok(layout.presetMinimum===0 || layout.presetMinimum>=44);
      assert.ok(layout.horizontalOverflow<=1);
      assert.equal(layout.pairs.filter(p=>p.rail==="upper").length,3);
      assert.equal(layout.pairs.filter(p=>p.rail==="lower").length,3);
      assert.equal(layout.pairs.filter(p=>p.side).length,2,
        "Six-max table should have two side opponents");
      const overlaps=(a,b,pad=2)=>a.left<b.right-pad && a.right>b.left+pad &&
        a.top<b.bottom-pad && a.bottom>b.top+pad;
      const allPrivate=layout.pairs.flatMap(p=>p.cards);
      for(const pair of layout.pairs) {
        assert.equal(pair.cards.length,2);
        for(const card of pair.cards) {
          const outside=pair.rail==="upper"?
            layout.felt.top-card.top:card.bottom-layout.felt.bottom;
          const share=outside/card.height;
          assert.ok(share>.08 && share<.95,
            "Private cards should straddle the felt edge, not lie fully inside/outside");
          assert.equal(overlaps(card,pair.pill),false,
            "Private cards must remain separate from player labels");
        }
      }
      for(let i=0;i<allPrivate.length;i++)
        for(let j=i+1;j<allPrivate.length;j++)
          assert.equal(overlaps(allPrivate[i],allPrivate[j]),false,
            "Private cards belonging to different players must not overlap");
      assert.ok(layout.board.width<=layout.felt.width+2);
      await captureGameElement("table-6max-tablet-landscape-"+width+"x"+height,"#training-game");
    };
    await verifyTabletLandscapeControls(1024,768);
    await verifyTabletLandscapeControls(1080,810);
    await verifyTabletLandscapeControls(1180,820);
    await page.setViewportSize({width:1365,height:768});

    const sampleLabels = await page.evaluate(() => {
      const evaluator = window.PokerLabTable;
      return {
        pair9:evaluator.evaluatePreflop([{value:9,suit:"clubs"},{value:9,suit:"diamonds"}]),
        tenHigh:evaluator.evaluatePreflop([{value:10,suit:"clubs"},{value:2,suit:"diamonds"}]),
        aceHigh:evaluator.evaluatePreflop([{value:14,suit:"clubs"},{value:9,suit:"clubs"}])
      };
    });
    assert.equal(sampleLabels.pair9.label,"Paire de 9");
    assert.equal(sampleLabels.tenHigh.label,"Hauteur 10");
    assert.equal(sampleLabels.aceHigh.label,"Hauteur As");
    assert.equal(sampleLabels.aceHigh.detail,"");

    // Exercise all three community-card transitions in a real browser.
    // The fixture changes *presentation state only*; it never manipulates
    // the live game engine or advances any actual players.
    const verifyBoardStreets = async (width) => {
      await page.setViewportSize({width,height:844});
      const observations = await page.evaluate(() => {
        const api = window.PokerLabTable;
        const original = window.PokerLabTraining.getGameState();
        const mount = document.getElementById("training-table");
        const fresh = { ...original, handNumber:(original.handNumber ?? 1)+100,
          board:[],handComplete:false,result:null };
        const cards=[
          {value:14,suit:"spades"},{value:13,suit:"hearts"},
          {value:12,suit:"diamonds"},{value:11,suit:"clubs"},
          {value:10,suit:"spades"}
        ];
        const inspect=()=>{
          const els=[...mount.querySelectorAll(".pl-board > *")];
          return els.map(el=>({
            street:el.dataset.dealStreet ?? null,
            cls:el.classList.contains("pl-card-deal"),
            delay:getComputedStyle(el).animationDelay,
            name:getComputedStyle(el).animationName,
            duration:getComputedStyle(el).animationDuration,
            value:el.getAttribute("aria-label")
          }));
        };
        api.render(mount,fresh);
        const preflop=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,3)});
        const flop=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,3)});
        const flopRerender=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,4)});
        const turn=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,4)});
        const turnRerender=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,5)});
        const river=inspect();
        api.render(mount,{...fresh,board:cards.slice(0,5)});
        const riverRerender=inspect();
        api.render(mount,{...fresh,handNumber:fresh.handNumber+1,board:[]});
        const newHand=inspect();
        api.render(mount,{...fresh,handNumber:fresh.handNumber+1,board:cards.slice(0,3)});
        const nextFlop=inspect();
        api.render(mount,original);
        return {preflop,flop,flopRerender,turn,turnRerender,river,riverRerender,newHand,nextFlop};
      });
      const dealt=a=>a.filter(c=>c.cls);
      assert.equal(dealt(observations.preflop).length,0);
      assert.deepEqual(dealt(observations.flop).map(c=>c.street),["flop","flop","flop"]);
      assert.deepEqual(dealt(observations.flop).map(c=>c.delay),["0s","0.14s","0.28s"]);
      assert.ok(dealt(observations.flop).every(c=>
        c.name==="pl-board-deal-flop" && c.duration==="0.52s"));
      assert.equal(dealt(observations.flopRerender).length,0,
        "A betting action should not replay the flop card animation");
      assert.deepEqual(dealt(observations.turn).map(c=>c.street),["turn"]);
      assert.equal(dealt(observations.turn)[0].name,"pl-board-deal-flop");
      assert.equal(dealt(observations.turn)[0].duration,"0.52s",
        "Turn must use exactly the flop's 520ms duration");
      assert.equal(dealt(observations.turn)[0].delay,"0s");
      assert.equal(dealt(observations.turnRerender).length,0,
        "A betting action should not replay the turn card animation");
      assert.deepEqual(dealt(observations.river).map(c=>c.street),["river"]);
      assert.equal(dealt(observations.river)[0].name,"pl-board-deal-flop");
      assert.equal(dealt(observations.river)[0].duration,"0.52s",
        "River must use exactly the flop's 520ms duration");
      assert.equal(dealt(observations.river)[0].delay,"0s");
      assert.equal(dealt(observations.riverRerender).length,0,
        "A betting action should not replay the river card animation");
      assert.equal(dealt(observations.newHand).length,0);
      assert.deepEqual(dealt(observations.nextFlop).map(c=>c.street),["flop","flop","flop"]);
      assert.deepEqual(observations.river.map(c=>c.value).slice(0,5),
        observations.riverRerender.map(c=>c.value).slice(0,5),
        "Animation must never change the identity of the dealt cards");
      assert.equal(await page.locator("#training-table .pl-board > *").count(),5);
    };
    await verifyBoardStreets(1365);
    await verifyBoardStreets(390);
    await page.emulateMedia({reducedMotion:"reduce"});
    const reducedMotionBoard=await page.evaluate(() => {
      const api=window.PokerLabTable;
      const mount=document.getElementById("training-table");
      const original=window.PokerLabTraining.getGameState();
      const fresh={...original,handNumber:(original.handNumber??1)+505,board:[],result:null,handComplete:false};
      api.render(mount,fresh);
      api.render(mount,{...fresh,board:[
        {value:2,suit:"clubs"},{value:3,suit:"hearts"},{value:4,suit:"spades"}
      ]});
      const result=[...mount.querySelectorAll(".pl-board .pl-card-deal")].map(el=>({
        animation:getComputedStyle(el).animationName,
        opacity:getComputedStyle(el).opacity,
        label:el.getAttribute("aria-label")
      }));
      api.render(mount,original);
      return result;
    });
    assert.equal(reducedMotionBoard.length,3);
    assert.ok(reducedMotionBoard.every(card=>card.animation==="none" && card.opacity==="1"),
      "Reduced-motion users should see their cards immediately");
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.setViewportSize({width:1365,height:768});

    // Render a representative engine result in a detached *test scenario*
    // attached to the real table. Assert that all payout lines match the
    // supplied split-pot shares including the 0.5 BB odd chip, and that the
    // best five cards come from the engine's evaluated hand data.
    const multiPotFixture = await page.evaluate(() => {
      const api = window.PokerLabTable;
      const training = window.PokerLabTraining;
      const original = training.getGameState();
      const [hero, bot] = original.players;
      const board = [
        {value:2,suit:"spades"},{value:3,suit:"spades"},
        {value:4,suit:"spades"},{value:5,suit:"diamonds"},
        {value:6,suit:"hearts"}
      ];
      const fixture = {
        ...original, board, handComplete:true,street:"complete",
        currentPlayerId:null,
        result:{
          type:"showdown",handNumber:original.handNumber,totalPot:31.5,
          winnerIds:[hero.id,bot.id],
          pots:[
            {amount:21.5,winnerIds:[hero.id,bot.id],share:10.5,
              oddChipRecipients:[hero.id],category:"Quinte",isTie:true},
            {amount:10,winnerIds:[bot.id],share:10,
              oddChipRecipients:[],category:"Quinte",isTie:false}
          ],
          evaluations:[
            {playerId:hero.id,category:"Quinte",bestFiveCards:board},
            {playerId:bot.id,category:"Quinte",bestFiveCards:board}
          ]
        }
      };
      api.render(document.getElementById("training-table"),fixture);
      const modal=document.querySelector("dialog.pl-result-dialog");
      const output={
        open:modal?.open,
        role:modal?.getAttribute("aria-labelledby"),
        result:modal?.dataset.trainingResult,
        title:modal?.querySelector("#pl-result-title")?.textContent,
        total:modal?.querySelector(".pl-result-total-value")?.textContent,
        gains:[...modal.querySelectorAll(".pl-result-winner-gain")].map(el=>el.textContent),
        categories:[...modal.querySelectorAll(".pl-result-winner-hand")].map(el=>el.textContent),
        fiveCards:[...modal.querySelectorAll(".pl-result-best-five")].map(el=>el.children.length),
        winnerGrid:getComputedStyle(modal.querySelector(".pl-result-winnings")).gridTemplateColumns,
        winnerCards:[...modal.querySelectorAll(".pl-result-winner")].map(el => {
          const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};
        }),
        pots:[...modal.querySelectorAll(".pl-result-pot-name")].map(el=>el.textContent),
        next:modal?.querySelectorAll('[data-training-action="next-hand"]').length,
        quit:modal?.querySelectorAll('[data-training-action="end-session"]').length,
        scroll:modal?.scrollTop ?? -1,
        focused:document.activeElement===modal
      };
      return output;
    });
    assert.equal(multiPotFixture.open,true);
    assert.equal(multiPotFixture.result,"showdown");
    assert.equal(multiPotFixture.role,"pl-result-title");
    assert.match(multiPotFixture.title,/partagé/i);
    assert.equal(multiPotFixture.total,"31,5 BB");
    assert.deepEqual(multiPotFixture.gains,["+11 BB","+20,5 BB"]);
    assert.deepEqual(multiPotFixture.categories,["Quinte","Quinte"]);
    assert.deepEqual(multiPotFixture.fiveCards,[5,5]);
    assert.equal(multiPotFixture.winnerGrid.trim().split(/\s+/).length,2,
      "On desktop both winners should be side-by-side for a compact summary");
    assert.ok(Math.abs(multiPotFixture.winnerCards[0].top-
      multiPotFixture.winnerCards[1].top)<=2,
      "Winning hand detail panels must share a baseline on desktop");
    assert.deepEqual(multiPotFixture.pots,["Pot principal","Pot secondaire 1"]);
    assert.equal(multiPotFixture.next,1,"Next hand action must be inside the modal");
    assert.equal(multiPotFixture.quit,1);
    assert.ok(multiPotFixture.focused);
    assert.equal(multiPotFixture.scroll,0);
    await captureGameElement("showdown-split-pot-dialog-desktop",
      "#training-table dialog.pl-result-dialog");
    await page.evaluate(() => {
      document.querySelector("dialog.pl-result-dialog")?.close();
      window.PokerLabTable.render(
        document.getElementById("training-table"),
        window.PokerLabTraining.getGameState()
      );
    });
    await captureGameElement("table-6max-complete-desktop", "#training-game .pl-table-container");
    await captureGameElement("table-6max-with-controls-desktop", "#training-game");

    // A real desktop cockpit must fit the original controls without narrow,
    // unreadable sizing pills. The older nested two-column action grid did not.
    const desktopCockpit = await page.evaluate(() => {
      const r = el => el.getBoundingClientRect();
      const table = document.querySelector("#training-table .pl-table-container");
      const actions = document.querySelector("#training-game > #training-actions");
      const buttons = [...actions.querySelectorAll(".pl-action-buttons button")];
      const presets = [...actions.querySelectorAll(".pl-bet-presets button")];
      return {
        table:r(table),actions:r(actions),
        buttonMinWidth:Math.min(...buttons.map(el=>r(el).width)),
        buttonMinHeight:Math.min(...buttons.map(el=>r(el).height)),
        presetMinWidth:presets.length?Math.min(...presets.map(el=>r(el).width)):null
      };
    });
    assert.ok(desktopCockpit.actions.left>=desktopCockpit.table.right+8,
      "Desktop action cockpit must be beside the table");
    assert.ok(desktopCockpit.buttonMinWidth>=95 && desktopCockpit.buttonMinHeight>=44,
      "Desktop decision actions must remain wide enough to read and click");
    assert.ok(desktopCockpit.presetMinWidth===null || desktopCockpit.presetMinWidth>=60,
      "Desktop bet presets must never collapse into narrow columns");

    const desktopSeatAndSolver = await page.evaluate(() => {
      const stage = document.querySelector(".pl-live-table-stage").getBoundingClientRect();
      const solver = document.querySelector("#training-solver-dock > .pl-solve-button").getBoundingClientRect();
      const seat = document.querySelector(".pl-seat:not(.is-folded)");
      const avatar = seat.querySelector(".pl-player-avatar").getBoundingClientRect();
      const name = seat.querySelector(".pl-player-name").getBoundingClientRect();
      return { stageRight: stage.right, solverRight: solver.right, avatarRight: avatar.right, nameLeft: name.left };
    });
    assert.ok(desktopSeatAndSolver.solverRight <= desktopSeatAndSolver.stageRight + 1,
      "Solver must stay fully inside the right edge of the table");
    assert.ok(desktopSeatAndSolver.nameLeft >= desktopSeatAndSolver.avatarRight - 1,
      "Player text must not be covered by the avatar");
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyTableGeometry(true);
    await captureGameElement("table-6max-complete-mobile", "#training-game");
    const mobileNames = await page.locator("#training-table .pl-player-name").evaluateAll(items =>
      items.map(item => ({
        text: item.textContent,
        visibleWidth: item.clientWidth,
        actualWidth: item.scrollWidth
      })));
    assert.equal(mobileNames.length, 6);
    assert.ok(mobileNames.every(item => item.actualWidth <= item.visibleWidth + 1),
      "Bot names must not be clipped by the position badge on 390px 6-max");
    assert.equal(await page.locator("#training-table .pl-seat .pl-player-avatar svg").count(), 6);
    // Folded seat styling should never tint the original blue card backs.
    const foldedAppearance = await page.evaluate(() =>
      [...document.querySelectorAll("#training-table .pl-seat.is-folded")].map(seat => ({
        seatOpacity: Number(getComputedStyle(seat).opacity),
        infoOpacity: Number(getComputedStyle(seat.querySelector(".pl-player-info")).opacity),
        cardsOpacity: Number(getComputedStyle(seat.querySelector(".pl-player-cards")).opacity)
      })));
    assert.ok(foldedAppearance.every(s => s.seatOpacity===1 && s.infoOpacity<1 &&
      s.cardsOpacity===1), "Only folded identities, not their card backs, should be muted");
    await page.setViewportSize({ width: 320, height: 844 });
    await verifyTableGeometry(true);
    const narrowSeats = await page.evaluate(() => {
      const bounds = el => {
        const r=el.getBoundingClientRect();
        return { left:r.left, right:r.right };
      };
      const rows = ["upper","lower"].map(rail =>
        [...document.querySelectorAll("#training-table .pl-seat-" + rail)]
          .map(seat => ({
            capsule:bounds(seat.querySelector(".pl-player-info")),
            avatar:bounds(seat.querySelector(".pl-player-avatar"))
          }))
          .sort((a,b)=>a.capsule.left-b.capsule.left));
      return {rows,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    for (const row of narrowSeats.rows) {
      assert.equal(row.length,3);
      for (let index=0;index<row.length-1;index++) {
        assert.ok(row[index].capsule.right <= row[index+1].capsule.left + 2,
          "Player capsules must not overlap at 320px");
        assert.ok(row[index+1].avatar.left===0 || row[index].capsule.right <= row[index+1].avatar.left + 3,
          "Player icons must not cover another player's text at 320px");
      }
    }
    assert.ok(narrowSeats.overflow<=1);
    const narrowHeader = await page.evaluate(() => {
      const hand = document.querySelector("#training-table .pl-hand-strength");
      const value = hand?.querySelector(".pl-hand-strength-value");
      const label = hand?.querySelector(".pl-hand-strength-label");
      const middleSeat = document.querySelector("#training-table .pl-seat-4");
      const badge = middleSeat?.querySelector(".pl-player-badges");
      const r = el => el?.getBoundingClientRect();
      return {
        valueTop:r(value)?.top ?? 0,labelTop:r(label)?.top ?? 0,
        handBottom:r(hand)?.bottom ?? 0,badgeTop:r(badge)?.top ?? 9999
      };
    });
    assert.ok(Math.abs(narrowHeader.valueTop-narrowHeader.labelTop)<=3,
      "Hand strength must remain on one line at 320px");
    assert.ok(narrowHeader.badgeTop>=narrowHeader.handBottom-2,
      "Centre top-seat badges must not cover the hand pill at 320px");
    const heroBadges = await page.evaluate(() => {
      const hero = document.querySelector("#training-table .pl-seat-hero");
      const pill = hero.querySelector(".pl-player-info").getBoundingClientRect();
      const badges = hero.querySelector(".pl-player-badges").getBoundingClientRect();
      return {pillTop:pill.top,badgesBottom:badges.bottom};
    });
    assert.ok(heroBadges.badgesBottom<=heroBadges.pillTop+3,
      "Dealer and turn badges must float above, not obscure, the hero name");
    await captureGameElement("table-6max-complete-mobile-320", "#training-game");
    await page.setViewportSize({ width: 1365, height: 768 });
    await page.locator('button[data-training-action="stop"]').click();
    assert.equal(await page.evaluate(() => window.PokerLabTraining.isSessionActive()),false);
    assert.equal(await page.locator("#training-configuration").isVisible(),true);

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
    await page.locator('#training-actions .pl-action-btn-fold').click();
    await page.locator('#training-table dialog.pl-result-dialog[open]')
      .waitFor({timeout:15000});
    const uncontested = await page.evaluate(() => {
      const modal = document.querySelector("#training-table dialog.pl-result-dialog");
      return {
        type:modal?.dataset.trainingResult,
        title:modal?.querySelector("#pl-result-title")?.textContent,
        description:modal?.querySelector("#pl-result-explanation")?.textContent,
        pot:modal?.querySelector(".pl-result-total-value")?.textContent,
        categories:[...modal.querySelectorAll(".pl-result-winner-hand")]
          .map(el=>el.textContent),
        nextCount:modal.querySelectorAll('[data-training-action="next-hand"]').length,
        duplicateSummary:document.querySelectorAll("#training-actions .pl-hand-result").length,
        actionPanelHidden:getComputedStyle(document.querySelector("#training-actions")).display==="none",
        focus:document.activeElement===modal,
        handNumber:window.PokerLabTraining.getGameState().handNumber
      };
    });
    assert.equal(uncontested.type,"uncontested");
    assert.match(uncontested.description,/abandonné la main/);
    assert.ok(uncontested.pot?.endsWith(" BB"));
    assert.ok(uncontested.categories.every(s=>s==="Victoire sans showdown"));
    assert.equal(uncontested.nextCount,1);
    assert.equal(uncontested.duplicateSummary,0);
    assert.equal(uncontested.actionPanelHidden,true);
    assert.equal(uncontested.focus,true);
    await captureGameElement("showdown-uncontested-dialog-desktop",
      "#training-table dialog.pl-result-dialog");
    await page.locator('#training-table dialog.pl-result-dialog [data-training-action="next-hand"]').click();
    await page.waitForFunction(previous =>
      window.PokerLabTraining.getGameState()?.handNumber === previous+1,
      uncontested.handNumber,{timeout:15000});
    const following = await page.evaluate(() => window.PokerLabTraining.getGameState());
    assert.equal(following.handNumber,uncontested.handNumber+1,
      "The modal's primary CTA must call the actual engine nextHand()");
    assert.equal(await page.evaluate(() => window.PokerLabTraining.stopSession()), true);

    await page.locator('a[data-page="lessons"]').first().click();
    assert.equal(await page.locator('#lessons > .bg-surface').count(),1,
      "React lessons shell must mount exactly once");
    assert.equal(await page.locator('#lessons [data-lessons-catalog]').count(),1);
    assert.equal(await page.locator('#lessons [data-lesson-content]').count(),1);
    assert.equal(await page.locator('#lessons [data-ranges-viewer]').count(),1);
    assert.equal(await page.locator("#lessons").isVisible(), true);
    await page.waitForFunction(() => document.querySelectorAll(".pl-range-cell").length === 169, null, { timeout: 30000 });
    const matrix = page.locator(".pl-range-matrix");
    assert.equal(await matrix.count(), 1);
    const first = page.locator(".pl-range-cell").first();
    await first.click();
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    assert.equal((await page.locator(".pl-rv-detail").innerText()).includes("AA"), true);
    assert.equal(await page.locator(".pl-rv-detail").getAttribute("aria-live"), "polite");
    const rangesLayout = await page.locator(".pl-rv").evaluate(element => getComputedStyle(element).display);
    assert.equal(rangesLayout, "grid", "Large screens should show range selection beside the matrix");
    await captureUi("ranges-desktop");

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
    assert.equal(await page.locator('#review [data-review-history]').count(),1);
    assert.equal(await page.locator('#review [data-review-detail]').count(),1);
    assert.equal(await page.locator('#review .pl-review-column').count(), 2);
    assert.equal(await page.locator('#review .pl-page-panel').count(), 1);
    await captureUi("review-desktop");
    // We intentionally completed a real heads-up hand above. Its successful
    // persistence must be visible in the review timeline rather than leaving
    // the old assertion that the user's hand history is empty.
    await page.locator("[data-review-history] .pl-review-history-item")
      .first().waitFor({ timeout: 30000 });

    // Responsive behavior: mobile navigation is usable at phone width.
    await page.locator('a[data-page="settings"]').first().click();
    assert.equal(await page.locator("#settings").isVisible(),true);
    assert.equal(await page.locator('#settings #settings-content').count(),1);
    assert.equal(await page.locator('#settings h2').textContent(),"Paramètres");

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.locator('a[data-page="home"]').first().click();
    const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(tabletOverflow <= 1, "The tablet header must not cause horizontal overflow");
    for (const destination of ["training", "tactics", "lessons", "review", "settings"]) {
      await page.locator('a[data-page="' + destination + '"]').first().click();
      const horizontalOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(horizontalOverflow <= 1,
        destination + " page must not overflow viewport at 768px");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav.pl-mobile-nav a[data-page="lessons"]').click();
    // The ranges section is several screens below the lessons catalog.
    // A dedicated shortcut must make it available immediately on mobile.
    await page.locator(".pl-learning-shortcut").click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "preflop-ranges-section",
      "The range shortcut should transfer keyboard focus into the range region");
    const rangesHeadingPosition = await page.locator("#preflop-ranges-title").evaluate(element =>
      element.getBoundingClientRect().top);
    assert.ok(rangesHeadingPosition >= -1 && rangesHeadingPosition <= 100,
      "Ranges shortcut should scroll the section heading near the top");
    await captureUi("ranges-mobile-intro");
    const rangeScroll = await page.locator(".pl-rv-matrix").evaluate(element => ({
      width: element.clientWidth,
      scroll: element.scrollWidth
    }));
    assert.ok(rangeScroll.scroll >= rangeScroll.width, "Range data must remain in its own scroll region");
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1,
      "Range matrix must not overflow the mobile document");
    await page.locator(".pl-rv-matrix").scrollIntoViewIfNeeded();
    await captureUi("ranges-mobile");
    await page.locator('nav').last().locator('a[data-page="home"]').click();
    assert.equal(await page.locator("#home").isVisible(), true);
    assert.ok((await page.evaluate(() => scrollY)) <= 1,
      "Navigation must reset scrolling when returning to Home");
    await captureUi("home-mobile");
    // Verify actual phone gameplay: the single action node follows the table
    // and has usable 48px buttons instead of being compressed over hero cards.
    await page.locator('nav.pl-mobile-nav a[data-page="training"]').click();
    const mobileGame = await page.evaluate(() => {
      const config = window.PokerLabTraining.updateConfig({ gameMode: "heads-up", playerCount: 2 });
      if (!config.success) return { success: false, errors: config.errors };
      return window.PokerLabTraining.createSession();
    });
    assert.equal(mobileGame.success, true, JSON.stringify(mobileGame.errors ?? []));
    await page.waitForFunction(() => Boolean(document.querySelector(
      '#training-game > #training-actions.pl-action-panel')), null, { timeout: 30000 });
    await page.waitForFunction(() => Boolean(document.querySelector(
      '#training-actions .pl-action-buttons button')), null, { timeout: 30000 });
    const firstLegalPreset = page.locator('#training-actions .pl-bet-preset:not(:disabled)').first();
    if (await firstLegalPreset.count()) {
      await firstLegalPreset.click();
      assert.equal(await firstLegalPreset.getAttribute("aria-pressed"), "true",
        "Selected legal sizing should be indicated without submitting the bet");
      assert.ok(Number(await page.locator("#training-actions .pl-bet-number").inputValue()) > 0,
        "Preset must synchronize the original numeric amount");
    }
    const verifyPhoneActions = async (width) => {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(() =>
        document.getElementById("training-actions")?.parentElement?.id === "training-game");
      const measured = await page.evaluate(() => {
        const table = document.querySelector(".pl-table-container");
        const actions = document.getElementById("training-actions");
        const controls = [...actions.querySelectorAll(".pl-action-buttons button")];
        const presets = [...actions.querySelectorAll(".pl-bet-preset")];
        const input = actions.querySelector(".pl-bet-number");
        const slider = actions.querySelector(".pl-bet-slider");
        return {
          nodes: document.querySelectorAll("#training-actions").length,
          panelTop: actions.getBoundingClientRect().top,
          tableBottom: table.getBoundingClientRect().bottom,
          minActionHeight: controls.length ? Math.min(...controls.map(el => el.getBoundingClientRect().height)) : null,
          minPresetHeight: presets.length ? Math.min(...presets.map(el => el.getBoundingClientRect().height)) : null,
          inputHeight: input?.getBoundingClientRect().height ?? null,
          sliderHeight: slider?.getBoundingClientRect().height ?? null,
          overflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      assert.equal(measured.nodes, 1, "Must retain exactly one action node");
      assert.ok(measured.panelTop >= measured.tableBottom - 1,
        "Mobile controls must not overlap the actual poker table");
      assert.ok(measured.minActionHeight === null || measured.minActionHeight >= 48,
        "Mobile decision actions must have >=48px touch targets");
      assert.ok(measured.minPresetHeight === null || measured.minPresetHeight >= 44,
        "Mobile sizing presets must have >=44px touch targets");
      assert.ok(measured.inputHeight === null || measured.inputHeight >= 44);
      assert.ok(measured.sliderHeight === null || measured.sliderHeight >= 44);
      assert.ok(measured.overflow <= 1, "No horizontal overflow in active mobile gameplay");
    };
    await verifyPhoneActions(390);
    await captureUi("gameplay-mobile-390");
    assert.equal(await page.locator("#training-table .pl-player-avatar").count(), 2);
    assert.equal(await page.locator("#training-solver-dock > .pl-solve-button").count(), 1);
    await captureGameElement("table-headsup-complete-mobile", "#training-game");
    await verifyPhoneActions(320);
    // Measure visible label boxes, not just document overflow: narrow labels
    // may overlap one another without increasing the document width.
    const navLabels = await page.locator(".pl-mobile-link span").evaluateAll(nodes =>
      nodes.map(element => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        textWidth: element.scrollWidth,
        width: element.clientWidth
      })));
    assert.equal(navLabels.length, 5);
    for (let i = 0; i < navLabels.length - 1; i++) {
      assert.ok(navLabels[i].right <= navLabels[i + 1].left,
        "Adjacent mobile nav labels must not collide at 320px");
    }
    assert.ok(navLabels.every(item => item.textWidth <= item.width + 1),
      "Compact labels must not be clipped at 320px");
    await captureUi("gameplay-mobile-320");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => Boolean(document.querySelector(
      "#training-game > #training-actions.pl-action-panel")));
    assert.equal(await page.locator("#training-actions").count(), 1);
    assert.equal(await page.locator("#training-solver-dock > .pl-solve-button").count(), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await verifyPhoneActions(390);
    assert.equal(await page.evaluate(() => window.PokerLabTraining.stopSession()), true);
    await page.locator('nav.pl-mobile-nav a[data-page="review"]').click();
    assert.equal(await page.locator("#review").isVisible(), true);
    assert.equal(await page.locator('nav.pl-mobile-nav a[data-page="review"]').getAttribute("aria-current"), "page");
    await captureUi("review-mobile");
    await page.locator('nav.pl-mobile-nav a[data-page="home"]').click();
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

    // Production: the TypeScript postflop API runs in the dedicated Vite ESM Worker.
    // Rust/WASM is the default backend, with TypeScript fallback inside this Worker.
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
    assert.deepEqual(typedBackend,{backend:"wasm",implementation:"typescript",cfrDefault:"rust",multiway:"rust-sampled"});

    // Integration gate: the typed module Worker must run a real river equity
    // calculation and a seeded range-vs-range CFR+ solve, not just initialize.
    const typedPostflop = await page.evaluate(async () => {
      const worker = window.PokerLabV2.createTypedPostflopWorker();
      const input = { schemaVersion:1, history:[], state: {
        street:"river",
        board:[
          {value:2,suit:"clubs"},{value:7,suit:"diamonds"},
          {value:9,suit:"hearts"},{value:11,suit:"spades"},
          {value:13,suit:"diamonds"}
        ],
        handComplete:false,pot:10,currentBet:0,lastFullRaise:1,
        minimumRaiseTo:1,blinds:{smallBlind:0.5,bigBlind:1},
        currentPlayerId:"hero",dealerIndex:0,
        players:[
          {id:"hero",name:"Hero",isHuman:true,isBot:false,folded:false,
            holeCards:[{value:14,suit:"spades"},{value:14,suit:"hearts"}],
            stack:20,streetBet:0,totalContribution:5,amountToCall:0,
            lastActedBet:0,hasActed:false,position:"BTN",
            actionOptions:{canCheck:true,canBet:true,canCall:false,
              canRaise:false,callAmount:0,minimumBet:1,minimumRaiseTo:1,maximumRaiseTo:20}},
          {id:"villain",name:"Villain",isHuman:false,isBot:true,folded:false,
            holeCards:null,stack:20,streetBet:0,totalContribution:5,
            amountToCall:0,lastActedBet:0,hasActed:false,position:"BB"}
        ]
      }};
      let id=1000;
      const rustProgress=[];
      const run=(task,options={},experimentalRustCfr)=>new Promise((resolve,reject)=>{
        const currentId=++id;
        const timeout=setTimeout(()=>reject(new Error(
          "Typed postflop "+task+" calculation exceeded 60s")),60000);
        const onMessage=event=>{
          if(event.data?.id!==currentId)return;
          if(event.data.progress!==undefined){
            if(task==="strategy"&&experimentalRustCfr===true)
              rustProgress.push({
                progress:event.data.progress,
                phase:event.data.phase,
                provisional:event.data.provisional===true,
                actionCount:event.data.previewActions?.length??0
              });
            return;
          }
          clearTimeout(timeout);worker.removeEventListener("message",onMessage);
          if(event.data.ok)resolve(event.data.result);
          else reject(new Error(event.data.error||("Typed "+task+" failed")));
        };
        worker.addEventListener("message",onMessage);
        worker.addEventListener("error",event=>{
          clearTimeout(timeout);reject(new Error(event.message||"Module Worker error"));
        },{once:true});
        worker.postMessage({id:currentId,task,input,options,experimentalRustCfr});
      });
      try {
        const equity=await run("equity");
        const typedBegin=performance.now();
        const solveOptions={
          iterations:10,samples:8,seed:20261117,
          evaluationSamples:16,exploitabilitySamples:8
        };
        // Keep an explicitly forced TypeScript oracle even though automatic
        // V2 production requests now prefer Rust CFR+ when WASM is available.
        const strategy=await run("strategy",solveOptions,false);
        const typedDurationMs=performance.now()-typedBegin;
        const rustBegin=performance.now();
        const rustStrategy=await run("strategy",solveOptions,true);
        const rustDurationMs=performance.now()-rustBegin;
        const autoStrategy=await run("strategy",solveOptions);
        return {
          timing:{typedDurationMs,rustDurationMs},
          rustProgress,
          rustQuality:rustStrategy.quality,
          rustHeroActualSamples:rustStrategy.sampledActualHeroHand,
          equity:{iterations:equity.iterations,wins:equity.wins,ties:equity.ties,
            losses:equity.losses,value:equity.equity},
          strategy:{iterations:strategy.iterations,actions:strategy.actions,
            nashConv:strategy.nashConv,heroEV:strategy.heroEV,
            evaluationSamples:strategy.evaluationSamples},
          rustStrategy:{iterations:rustStrategy.iterations,actions:rustStrategy.actions,
            nashConv:rustStrategy.nashConv,heroEV:rustStrategy.heroEV,
            evaluationSamples:rustStrategy.evaluationSamples},
          autoStrategy:{iterations:autoStrategy.iterations,actions:autoStrategy.actions,
            nashConv:autoStrategy.nashConv,heroEV:autoStrategy.heroEV}
        };
      } finally {worker.terminate();}
    });
    assert.equal(typedPostflop.equity.iterations,1800);
    assert.equal(typedPostflop.equity.wins+typedPostflop.equity.ties+
      typedPostflop.equity.losses,1800);
    assert.ok(typedPostflop.equity.value>=0&&typedPostflop.equity.value<=1);
    assert.equal(typedPostflop.strategy.iterations,80);
    assert.equal(typedPostflop.rustQuality,"sampled_estimate");
    assert.ok(typedPostflop.rustProgress.length>=4,
      "real Worker must stream bounded CFR progress checkpoints");
    assert.ok(typedPostflop.rustProgress.some(update=>
      update.provisional&&update.phase==="strategy_training"),
      "real Worker must distinguish un-converged strategy estimates");
    if(typedPostflop.rustHeroActualSamples>0)
      assert.ok(typedPostflop.rustProgress.some(update=>update.actionCount>0),
        "real Worker must send a provisional root policy when sampled hero is known");
    else
      assert.ok(typedPostflop.rustProgress.every(update=>update.actionCount===0),
        "never invent hero-hand frequencies before that hand was sampled");
    for(let step=1;step<typedPostflop.rustProgress.length;step++)
      assert.ok(typedPostflop.rustProgress[step].progress>=
        typedPostflop.rustProgress[step-1].progress,
        "progress must stay monotonic");

    assert.ok(typedPostflop.strategy.actions.length>=2);
    assert.ok(Math.abs(typedPostflop.strategy.actions.reduce((sum,action)=>
      sum+action.frequency,0)-1)<0.001);
    assert.ok(Number.isFinite(typedPostflop.strategy.heroEV));
    assert.ok(Number.isFinite(typedPostflop.strategy.nashConv));
    assert.equal(typedPostflop.strategy.evaluationSamples,16);
    console.log("CFR+ full river solve (80 seeded samples): TypeScript "+
      typedPostflop.timing.typedDurationMs.toFixed(1)+"ms, Rust session "+
      typedPostflop.timing.rustDurationMs.toFixed(1)+"ms, relative "+
      (typedPostflop.timing.typedDurationMs / typedPostflop.timing.rustDurationMs).toFixed(2)+
      "x (runner-dependent, non-gating)");
    assert.deepEqual(typedPostflop.autoStrategy,{
      iterations:typedPostflop.rustStrategy.iterations,
      actions:typedPostflop.rustStrategy.actions,
      nashConv:typedPostflop.rustStrategy.nashConv,
      heroEV:typedPostflop.rustStrategy.heroEV
    },"Default postflop Worker must use the same Rust CFR+ path as explicit opt-in");
    assert.equal(typedPostflop.rustStrategy.iterations,typedPostflop.strategy.iterations);
    assert.equal(typedPostflop.rustStrategy.actions.length,typedPostflop.strategy.actions.length);
    for(let i=0;i<typedPostflop.strategy.actions.length;i++){
      const expected=typedPostflop.strategy.actions[i];
      const actual=typedPostflop.rustStrategy.actions[i];
      assert.equal(actual.action,expected.action);
      assert.ok(Math.abs(actual.frequency-expected.frequency)<1e-6,
        "Rust sampled CFR+ action frequency diverged: "+actual.action);
    }
    assert.ok(Math.abs(typedPostflop.rustStrategy.heroEV-typedPostflop.strategy.heroEV)<1e-6,
      "Rust sampled CFR+ must preserve strategy EV");
    assert.ok(Math.abs(typedPostflop.rustStrategy.nashConv-typedPostflop.strategy.nashConv)<1e-6,
      "Rust sampled CFR+ must preserve sampled NashConv");




    // Integration gate: actual 3- and 6-seat postflop decisions run in the
    // production typed Rust Worker (not merely in Node test mocks).
    // Opponent cards remain hidden; the worker must sample valid blockers.
    const multiwaySmoke=await page.evaluate(async()=>{
      const scenarios=[];
      for(const {seats,street} of [
        {seats:3,street:"river"},{seats:6,street:"river"},
        {seats:3,street:"flop"},{seats:6,street:"flop"}
      ]){
        const worker=window.PokerLabV2.createTypedPostflopWorker();
        const ranks=[
          {value:2,suit:"clubs"},{value:7,suit:"diamonds"},
          {value:9,suit:"hearts"},{value:11,suit:"spades"},
          {value:13,suit:"diamonds"}
        ];
        const players=Array.from({length:seats},(_,i)=>({
          id:"seat-"+i,name:"Player "+i,isHuman:i===0,isBot:i!==0,
          folded:false,allIn:false,holeCards:i===0?[
            {value:14,suit:"spades"},{value:14,suit:"hearts"}
          ]:null,
          stack:20,streetBet:0,totalContribution:5,
          hasActed:false,lastActedBet:0,amountToCall:0,
          position:["BTN","SB","BB","CO","HJ","UTG"][i],
          actionOptions:i===0?{
            canFold:false,canCheck:true,canCall:false,
            canBet:true,canRaise:false,
            minimumBet:1,maximumBet:20
          }:null
        }));
        const input={schemaVersion:1,history:[],state:{
          street,board:ranks.slice(0,street==="flop"?3:5),handComplete:false,
          pot:seats*5,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
          blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
          currentPlayerId:"seat-0",pendingPlayers:players.map((_,i)=>i),
          players
        }};
        let requestId=9000;
        const progress=[];
        const invoke=(task,options)=>new Promise((resolve,reject)=>{
          const id=++requestId;
          const timer=setTimeout(()=>{
            worker.terminate();reject(new Error(
              "Timed out on "+seats+"-seat multiway "+task));
          },60000);
          const handler=event=>{
            const data=event.data;
            if(data?.id!==id)return;
            if(data.progress!==undefined){
              progress.push({
                phase:data.phase,progress:data.progress,
                provisional:data.provisional===true
              });
              return;
            }
            clearTimeout(timer);
            worker.removeEventListener("message",handler);
            if(data.ok)resolve(data.result);
            else reject(new Error(String(data.error)));
          };
          worker.addEventListener("message",handler);
          worker.postMessage({id,task,input,options});
        });
        try{
          const equity=seats===3&&street==="river"
            ?await invoke("equity",{iterations:300,seed:123}):null;
          const start=performance.now();
          const strategy=await invoke("strategy",{
            iterations:16,samples:1,evaluationSamples:16,seed:123
          });
          scenarios.push({
            seats,street,elapsedMs:performance.now()-start,
            modeledStreets:strategy.modeledStreets,
            preparedTopology:strategy.preparedTopology,
            decisionNodes:strategy.decisionNodes,
            requestedIterations:strategy.requestedIterations,
            actions:strategy.actions,algorithm:strategy.algorithm,
            quality:strategy.quality,nashConv:strategy.nashConv,
            ev:strategy.heroEV,iterations:strategy.iterations,
            abstraction:strategy.abstraction,
            equity:equity?{
              equity:equity.equity,
              n:equity.iterations,
              counts:equity.wins+equity.ties+equity.losses
            }:null,
            progress
          });
        }finally{worker.terminate();}
      }
      return scenarios;
    });
    for(const report of multiwaySmoke){
      assert.equal(report.quality,"sampled_estimate");
      assert.equal(report.nashConv,null);
      assert.equal(report.preparedTopology,true,
        "actual browser Worker should use persistent Rust multiway prepared topology");
      assert.equal(report.iterations,16);
      assert.ok(report.actions.length>=2);
      assert.ok(Math.abs(report.actions.reduce((total,action)=>
        total+action.frequency,0)-1)<1e-8);
      assert.ok(Number.isFinite(report.ev));
      if(report.street==="flop"){
        assert.ok(report.modeledStreets>=2,
          "3–6-seat flop scenarios must model a future betting street");
        assert.match(report.abstraction,/cartes futures révélées progressivement/);
      }else{
        assert.equal(report.modeledStreets,1);
        assert.match(report.abstraction,/1 street\(s\) de mises/);
      }
      assert.ok(report.decisionNodes>=1);
      assert.ok(report.progress.some(item=>item.provisional&&
        item.phase==="strategy_training"));
      assert.ok(report.progress.some(item=>item.provisional&&
        item.phase==="strategy_evaluation"));
      assert.ok(report.progress.every(item=>
        Number.isFinite(item.progress)&&item.progress>=0&&item.progress<=1));
      if(report.equity){
        assert.equal(report.equity.n,300);
        assert.equal(report.equity.counts,300);
        assert.ok(report.equity.equity>=0&&report.equity.equity<=1);
      }
      console.log("Typed Rust "+report.seats+"-seat multiway "+report.street+
        " solve ("+report.modeledStreets+" modeled betting streets): "+
        report.elapsedMs.toFixed(1)+"ms (non-gating, CI browser)");
    }

    // The production typed Worker completes real equity calculations on its own.
    const postflopEquity = await page.evaluate(async () => {
      const state = {
        street: "flop",
        board: [{value:2,suit:"clubs"},{value:7,suit:"diamonds"},{value:9,suit:"hearts"}],
        pot:10,currentPlayerId:"hero",handComplete:false,
        players: [
          {id:"hero",isHuman:true,folded:false,
            holeCards:[{value:14,suit:"spades"},{value:14,suit:"hearts"}],
            stack:90,amountToCall:0,actionOptions:{canBet:true}},
          {id:"villain",isHuman:false,isBot:true,folded:false,
            holeCards:null,stack:90,position:"BB"}
        ]
      };
      const worker = window.PokerLabV2.createTypedPostflopWorker();
      const begin = performance.now();
      try {
        const result = await new Promise((resolve,reject) => {
          const timeout=setTimeout(()=>reject(new Error("Typed postflop equity timed out")),30000);
          worker.addEventListener("message",event=>{
            if(event.data.id !== 77 || event.data.progress !== undefined)return;
            clearTimeout(timeout);
            if(event.data.ok)resolve(event.data.result);
            else reject(new Error(event.data.error));
          });
          worker.addEventListener("error",event=>reject(new Error(event.message)));
          worker.postMessage({id:77,task:"equity",input:state});
        });
        return {result,elapsed:performance.now()-begin};
      } finally {worker.terminate();}
    });
    assert.equal(postflopEquity.result.iterations,1800);
    assert.equal(postflopEquity.result.wins + postflopEquity.result.ties +
      postflopEquity.result.losses,postflopEquity.result.iterations);
    assert.ok(postflopEquity.result.equity>=0 && postflopEquity.result.equity<=1);
    console.log("Production typed postflop equity total: " +
      postflopEquity.elapsed.toFixed(1) + "ms");

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

    // No network is available here: every React page and the typed engine must
    // continue to work from the installed PWA, including after a fresh reload.
    await page.locator('a[data-page="lessons"]').first().click();
    await page.waitForFunction(() =>
      document.querySelector('#lessons')?.hidden === false &&
      document.querySelectorAll("#lessons .pl-range-cell").length === 169,
      null, { timeout: 30000 });
    await page.locator('a[data-page="tactics"]').first().click();
    assert.equal(await page.locator("#tactics").isVisible(),true);
    await page.locator('a[data-page="training"]').first().click();
    assert.equal(await page.locator("#training").isVisible(),true);
    const offlineSession=await page.evaluate(() => {
      const api=window.PokerLabTraining;
      const config=api.updateConfig({gameMode:"heads-up",playerCount:2});
      if(!config.success)return config;
      return api.createSession();
    });
    assert.equal(offlineSession.success,true,"Offline heads-up session must start");
    await page.waitForFunction(()=>
      document.querySelectorAll("#training-table .pl-seat").length===2,
      null,{timeout:30000});
    assert.equal(await page.evaluate(() => window.PokerLabTraining.stopSession()),true);
    await page.locator('a[data-page="home"]').first().click();
    assert.equal(await page.locator("#home").isVisible(),true);

    assert.equal(await page.locator("#home").count(),1);
    // The typed postflop Worker, its WASM binary and dynamic imports must survive airplane mode.
    const offlineBackend = await page.evaluate(async () => {
      const worker=window.PokerLabV2.createTypedPostflopWorker();
      try {
        return await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error("Offline postflop Worker timeout")),30000);
          worker.addEventListener("message",event=>{
            if(event.data?.id!==3009)return;
            clearTimeout(timeout);
            if(event.data.ok)resolve(event.data.result);
            else reject(new Error(event.data.error||"Worker unavailable offline"));
          });
          worker.addEventListener("error",event=>reject(new Error(event.message)));
          worker.postMessage({id:3009,task:"backend"});
        });
      }finally{worker.terminate();}
    });
    assert.deepEqual(offlineBackend,{backend:"wasm",implementation:"typescript",cfrDefault:"rust",multiway:"rust-sampled"},
      "Offline typed postflop Worker must bootstrap Rust/WASM and multiway CFR+");
    const offlineMultiway=await page.evaluate(async()=>{
      const worker=window.PokerLabV2.createTypedPostflopWorker();
      const hand={schemaVersion:1,history:[],state:{
        handNumber:333,street:"river",
        board:[
          {value:2,suit:"clubs"},{value:7,suit:"diamonds"},
          {value:9,suit:"hearts"},{value:11,suit:"spades"},
          {value:13,suit:"diamonds"}
        ],
        pot:15,currentBet:0,lastFullRaise:1,minimumRaiseTo:1,
        blinds:{smallBlind:0.5,bigBlind:1},dealerIndex:0,
        currentPlayerId:"hero",pendingPlayers:[0,1,2],handComplete:false,
        players:[
          {id:"hero",name:"Hero",isHuman:true,isBot:false,folded:false,
            holeCards:[{value:14,suit:"spades"},{value:14,suit:"hearts"}],
            stack:20,streetBet:0,totalContribution:5,amountToCall:0,
            position:"BTN",actionOptions:{
              canCheck:true,canBet:true,minimumBet:1,maximumBet:20
            }},
          {id:"bot1",name:"Bot 1",isHuman:false,isBot:true,folded:false,
            holeCards:null,stack:20,streetBet:0,totalContribution:5,
            amountToCall:0,position:"SB"},
          {id:"bot2",name:"Bot 2",isHuman:false,isBot:true,folded:false,
            holeCards:null,stack:20,streetBet:0,totalContribution:5,
            amountToCall:0,position:"BB"}
        ]
      }};
      try{
        return await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(new Error("Offline multiway CFR+ timeout")),30000);
          worker.addEventListener("message",event=>{
            if(event.data?.id!==3010||event.data.progress!==undefined)return;
            clearTimeout(timeout);
            if(event.data.ok)resolve({
              quality:event.data.result.quality,
              actions:event.data.result.actions,
              iterations:event.data.result.iterations,
              nashConv:event.data.result.nashConv
            });
            else reject(new Error(event.data.error||"Offline multiway CFR+ unavailable"));
          });
          worker.addEventListener("error",event=>reject(new Error(event.message)));
          worker.postMessage({id:3010,task:"strategy",input:hand,
            options:{iterations:16,samples:1,evaluationSamples:16,seed:333}});
        });
      }finally{worker.terminate();}
    });
    assert.equal(offlineMultiway.quality,"sampled_estimate");
    assert.equal(offlineMultiway.nashConv,null);
    assert.equal(offlineMultiway.iterations,16);
    assert.ok(offlineMultiway.actions.length>=2);
    assert.ok(Math.abs(offlineMultiway.actions.reduce((sum,item)=>
      sum+item.frequency,0)-1)<1e-9,
      "Actual multiway CFR+ must remain functional with all networking disabled");

    assert.equal(pageErrors.length,0,`Runtime errors: ${pageErrors.join("; ")}`);
    console.log("Browser smoke: UI, matrix, WASM Worker, PWA & offline passed");
  } finally {
    await browser.close();
  }
}
try { await run(); } finally { await new Promise(resolve => server.close(resolve)); }
