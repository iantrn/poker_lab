import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installPostflopSolverUI} from "../../frontend/src/ui/postflop-solver.ts";
function fakeDom() {
 const hooks=[];
 const doc={readyState:"loading",addEventListener:(type,callback,options)=>hooks.push({source:"document",type,once:options?.once??false})};
 const win={addEventListener:(type)=>hooks.push({source:"window",type})};
 return {doc,win,hooks};
}
test("typed solver overlay registers identical deferred initialization to legacy",()=>{
 const old=fakeDom();
 runInNewContext(readFileSync("js/modules/postflop-solver-ui.js","utf8"),{
  window:old.win,document:old.doc,MutationObserver:class {},console
 });
 const current=fakeDom();
 Object.assign(globalThis,{document:current.doc,window:current.win});
 try {
  installPostflopSolverUI();
  assert.deepEqual(current.hooks,old.hooks);
 } finally {
  delete globalThis.document; delete globalThis.window;
 }
});
