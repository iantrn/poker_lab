/** Browser integration test for existing V1 preferences and the async V2 mirror. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createReadStream,existsSync,statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "../frontend/node_modules/playwright-core/index.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..","dist");
const mime={".html":"text/html",".js":"application/javascript",
  ".json":"application/json",".webmanifest":"application/manifest+json",
  ".css":"text/css",".png":"image/png",".wasm":"application/wasm"};
const server=createServer((req,res)=>{
  const url=new URL(req.url??"/","http://localhost");
  if(!url.pathname.startsWith("/poker_lab/")){res.writeHead(404);res.end();return;}
  let relative;
  try{relative=decodeURIComponent(url.pathname.slice("/poker_lab/".length))||"index.html";}
  catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!existsSync(file)||!statSync(file).isFile()){
    res.writeHead(404);res.end();return;
  }
  res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
  createReadStream(file).pipe(res);
});
async function run(){
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();
  if(!address||typeof address==="string")throw Error("No test address");
  const browser=await chromium.launch({
    executablePath:process.env.CHROME_PATH||"/usr/bin/google-chrome",
    args:["--no-sandbox","--disable-dev-shm-usage"]});
  try{
    const context=await browser.newContext({serviceWorkers:"allow"});
    await context.addInitScript(()=>{
      if(sessionStorage.getItem("v2-mirror-seed"))return;
      localStorage.setItem("pokerlab_settings",JSON.stringify({theme:"light",soundEnabled:false}));
      localStorage.setItem("pokerlab_oldPreference",JSON.stringify("retained"));
      localStorage.setItem("pokerlab_badValue","invalid-json");
      localStorage.setItem("other_vendor","do not copy");
      sessionStorage.setItem("v2-mirror-seed","yes");
    });
    const page=await context.newPage();
    await page.goto("http://127.0.0.1:"+address.port+"/poker_lab/",{
      waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForFunction(()=>window.PokerLab?.app?.initialized&&window.PokerLabV2?.solver,
      null,{timeout:45000});
    const get=async key=>page.evaluate(async key=>{
      const names=await indexedDB.databases();
      if(!names.some(x=>x.name==="PokerLabV2"))return {ready:false};
      return new Promise(resolve=>{
        const request=indexedDB.open("PokerLabV2");
        request.onerror=()=>resolve({ready:false});
        request.onsuccess=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains("settings")){db.close();resolve({ready:false});return;}
          const item=db.transaction("settings","readonly").objectStore("settings").get(key);
          item.onsuccess=()=>{resolve({ready:true,value:item.result?.value??null});db.close();};
          item.onerror=()=>{resolve({ready:false});db.close();};
        };
      });
    },key);
    await page.waitForFunction(async()=>{
      const names=await indexedDB.databases();
      if(!names.some(x=>x.name==="PokerLabV2"))return false;
      return new Promise(resolve=>{
        const request=indexedDB.open("PokerLabV2");
        request.onerror=()=>resolve(false);
        request.onsuccess=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains("settings")){db.close();resolve(false);return;}
          const item=db.transaction("settings","readonly").objectStore("settings").get("oldPreference");
          item.onsuccess=()=>{resolve(item.result?.value==="retained");db.close();};
          item.onerror=()=>{resolve(false);db.close();};
        };
      });
    },null,{timeout:30000});
    assert.equal((await get("settings")).value.theme,"light");
    assert.equal((await get("settings")).value.soundEnabled,false);
    assert.equal((await get("oldPreference")).value,"retained");
    assert.deepEqual(await get("badValue"),{ready:true,value:null});
    assert.deepEqual(await get("other_vendor"),{ready:true,value:null});
    assert.equal(await page.evaluate(()=>window.PokerLab.storage.save("mirrorCheck",{n:3})),true);
    await page.waitForFunction(async()=>{
      const request=indexedDB.open("PokerLabV2");
      return new Promise(resolve=>{
        request.onerror=()=>resolve(false);
        request.onsuccess=()=>{
          const db=request.result;
          const item=db.transaction("settings","readonly").objectStore("settings").get("mirrorCheck");
          item.onsuccess=()=>{resolve(item.result?.value?.n===3);db.close();};
          item.onerror=()=>{resolve(false);db.close();};
        };
      });
    },null,{timeout:30000});
    assert.equal(await page.evaluate(()=>window.PokerLab.storage.remove("mirrorCheck")),true);
    await page.waitForFunction(async()=>{
      const request=indexedDB.open("PokerLabV2");
      return new Promise(resolve=>{
        request.onerror=()=>resolve(false);
        request.onsuccess=()=>{
          const db=request.result;
          const item=db.transaction("settings","readonly").objectStore("settings").get("mirrorCheck");
          item.onsuccess=()=>{resolve(item.result===undefined);db.close();};
          item.onerror=()=>{resolve(false);db.close();};
        };
      });
    },null,{timeout:30000});
    assert.equal(await page.evaluate(()=>localStorage.getItem("pokerlab_mirrorCheck")),null);
    console.log("V2 browser storage mirror: backfill, preservation and remove passed");
  }finally{await browser.close();}
}
try{await run();}
finally{await new Promise(resolve=>server.close(resolve));}
