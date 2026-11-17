import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installApp } from "../../frontend/src/app.ts";
function environment() {
  const store = new Map();
  return {
    store,
    localStorage: {
      setItem(key, value) {store.set(key,String(value));},
      getItem(key) {return store.has(key)?store.get(key):null;},
      removeItem(key) {store.delete(key);}
    },
    document: {readyState:"loading",addEventListener(){}},
    window: {addEventListener(){},isSecureContext:false,location:{reload(){}}}
  };
}
function run(typed) {
  const env=environment();
  let app;
  if(typed) {
    Object.assign(globalThis,{localStorage:env.localStorage,document:env.document,window:env.window});
    app=installApp();
    delete globalThis.localStorage;delete globalThis.document;delete globalThis.window;
  } else {
    runInNewContext(readFileSync("js/app.js","utf8"),{
      localStorage:env.localStorage,document:env.document,window:env.window,
      navigator:{},console:{info(){},warn(){},error(){}}
    });
    app=env.window.PokerLab;
  }
  app.settings.init();
  app.settings.set("theme","blue");
  app.settings.set("newOption",{enabled:true});
  const settings=JSON.parse(JSON.stringify(app.settings.current));
  const theme=app.settings.get("theme");
  app.settings.reset();
  const afterReset=JSON.parse(JSON.stringify(app.settings.current));
  const first=app.storage.save("test",{a:1});
  const saved=app.storage.load("test",{});
  const removed=app.storage.remove("test");
  const missing=app.storage.load("test",{fallback:true});
  return {
    config:JSON.parse(JSON.stringify(app.config)),settings,theme,afterReset,
    first,saved,removed,missing,
    pages:app.navigation.getCurrentPage(),
    storage:JSON.parse(JSON.stringify([...env.store.entries()]))
  };
}
test("TypeScript app config, storage, settings and default navigation match V1",()=>{
  assert.deepEqual(run(true),run(false));
});
