import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installTraining} from "../../frontend/src/training/session.ts";

function environment() {
  const events = [], handlers = [];
  const document = {
    readyState: "loading",
    addEventListener(type, handler, opts) { handlers.push({type, once: opts?.once ?? false}); },
    querySelectorAll() { return []; },
  };
  const window = {dispatchEvent(event) {events.push({type:event.type,detail:event.detail});}};
  class CustomEvent { constructor(type, options) {this.type=type;this.detail=options?.detail;} }
  return {window,document,events,handlers,CustomEvent};
}
function scenario(typed) {
  const env=environment();
  let api;
  if(typed) {
    Object.assign(globalThis,{window:env.window,document:env.document,CustomEvent:env.CustomEvent});
    api=installTraining();
  } else {
    runInNewContext(readFileSync("js/modules/training.js","utf8"),{
      window:env.window,document:env.document,CustomEvent:env.CustomEvent,console
    });
    api=env.window.PokerLabTraining;
  }
  try {
    const original=api.getConfig();
    const invalid=api.validateConfig({gameMode:"invalid",playerCount:1,difficulty:"invalid",startingStackBB:1});
    const two=api.setGameMode("heads-up");
    const strictHeadsUp=api.updateConfig({playerCount:6});
    const corrected=api.updateConfig({playerCount:2,startingStackBB:40});
    const six=api.setGameMode("6max");
    const extra=api.updateConfig({difficulty:"hard",startingStackBB:200});
    const rejected=api.updateConfig({playerCount:7});
    const current=api.getConfig();
    const reset=api.resetConfig();
    const restored=api.getConfig();
    return JSON.parse(JSON.stringify({
      original,invalid,two,strictHeadsUp,corrected,six,extra,rejected,current,
      reset,restored,session:api.getSession(),active:api.isSessionActive(),
      state:api.getGameState(),history:api.getHandHistory(),
      events:env.events,handlers:env.handlers
    }));
  } finally {
    if(typed)for(const key of ["window","document","CustomEvent"])delete globalThis[key];
  }
}
test("TypeScript training configuration and event stream match classic JS",()=>{
  assert.deepEqual(scenario(true),scenario(false));
});
