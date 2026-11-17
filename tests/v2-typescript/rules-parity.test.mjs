import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { installPokerRules } from "../../frontend/src/core/poker-rules.ts";

const legacyGlobal = {};
runInNewContext(readFileSync("js/core/poker-rules.js", "utf8"), { window: legacyGlobal });
const legacy = legacyGlobal.PokerLabRules;
globalThis.window = {};
const typed = installPokerRules();
delete globalThis.window;
const plain = value => JSON.parse(JSON.stringify(value));
function compare(method, vectors) {
  const parts = method.split(".");
  const old = parts.reduce((root, key) => root[key], legacy);
  const current = parts.reduce((root, key) => root[key], typed);
  const ownerOld = parts.slice(0,-1).reduce((root,key)=>root[key],legacy);
  const ownerCurrent = parts.slice(0,-1).reduce((root,key)=>root[key],typed);
  for(const args of vectors) {
    const invoke = (fn, owner) => {
      try { return {ok: true, value:plain(fn.apply(owner,args))}; }
      catch(error) {return {ok:false, message:error.message};}
    };
    assert.deepEqual(invoke(current,ownerCurrent),invoke(old,ownerOld),method + ": " + JSON.stringify(args));
  }
}
test("rules constants and general information match V1",()=>{
  assert.deepEqual(plain(typed.constants), plain(legacy.constants));
  compare("info.getSummary",[[]]);
});
test("betting validation and boundaries match V1",()=>{
  for(const method of ["validation.isFiniteNumber","validation.isNonNegativeAmount","validation.isChipAmount","betting.isValidAmount"])
    compare(method,[-1,0,0.5,0.25,1,2.5,13.49999999,Infinity,NaN,null,"1",undefined].map(x=>[x]));
  compare("validation.roundChipAmount",[-1,0,0.1,0.24,0.25,0.76,1,Infinity,NaN].map(x=>[x]));
  compare("blinds.getDefault",[[]]);
  compare("blinds.validate",[[.5,1],[.5,2],[0,1],[1,1],[.25,.5],[1,2]]);
  compare("blinds.create",[[.5,1],[.5,2],[0,1],[1,1],[.25,.5],[1,2]]);
  for(const method of ["betting.getMinimumOpeningBet"])
    compare(method,[-1,0,0.5,1,2,.25].map(x=>[x]));
  for(const method of ["betting.getMinimumRaiseTo","betting.getAmountToCall"])
    compare(method,[[0,1],[2,1],[2,2],[2,.5],[2,.25],[-1,1],[0,0]]);
  for(const method of ["betting.isFullRaise","betting.validateRaise"])
    compare(method,[[2,1,1],[2.5,1,1],[1,1,1],[2,2,1],[3,2,.5],[.5,1,1],[3,1,2]]);
});
test("streets, positions, action order and dealing match V1",()=>{
  compare("streets.getAll",[[]]);
  for(const method of ["streets.isValid","streets.getNext","streets.getCommunityCardCount",
    "streets.getTotalCommunityCards","dealing.getCommunityCards","dealing.getTotalCommunityCards"])
    compare(method,["preflop","flop","turn","river","showdown","unknown"].map(x=>[x]));
  for(const method of ["formats.get","formats.isValid"])
    compare(method,["headsUp","sixMax","invalid"].map(x=>[x]));
  compare("formats.validatePlayerCount",["headsUp","sixMax","invalid"].flatMap(format=>
    [0,1,2,3,4,5,6,7,3.5].map(count=>[count,format])));
  for(const method of ["positions.getPositionNames","dealing.getRequiredCards","dealing.canDeal"])
    compare(method,[0,1,2,3,4,5,6,7,2.5].map(x=>[x]));
  for(let count=2;count<=6;count++)for(let dealer=0;dealer<count;dealer++){
    compare("positions.getTablePositions",[[count,dealer]]);
    compare("positions.getClockwiseOrder",[[dealer,count]]);
    compare("positions.getPlayerPosition",Array.from({length:count},(_,i)=>[i,count,dealer]));
    const seats=Array.from({length:count},(_,i)=>i).filter(i=>i%2===0);
    compare("actionOrder.getPreflopOrder",[[count,dealer],[count,dealer,seats]]);
    compare("actionOrder.getPostflopOrder",[[count,dealer],[count,dealer,seats]]);
  }
});
