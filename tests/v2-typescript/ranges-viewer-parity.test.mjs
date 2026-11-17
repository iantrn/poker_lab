import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installRangesViewer } from "../../frontend/src/ranges/viewer.ts";
function createEnvironment() {
  const listeners = [];
  const window = {addEventListener(type,listener){listeners.push({type,listener});}};
  const document = {addEventListener(type,listener){listeners.push({type,listener});}};
  return {window,document,listeners};
}
test("range viewer public API and default filter state match legacy",()=>{
  const first=createEnvironment();
  runInNewContext(readFileSync("js/modules/ranges-viewer.js","utf8"),{
    window:first.window, document:first.document,
    Map,Set,JSON,Promise
  });
  const second=createEnvironment();
  globalThis.window=second.window;
  globalThis.document=second.document;
  try {
    const typed=installRangesViewer();
    const original=first.window.PokerLabRangesViewer;
    assert.deepEqual(JSON.parse(JSON.stringify(typed.getState())),
      JSON.parse(JSON.stringify(original.getState())));
    assert.deepEqual(Object.keys(typed).sort(),Object.keys(original).sort());
    assert.deepEqual(second.listeners.map(x=>x.type),first.listeners.map(x=>x.type));
    assert.equal(installRangesViewer(),typed,"installation must be idempotent");
  } finally {
    delete globalThis.window; delete globalThis.document;
  }
});
