import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {installGameEngine,PokerLabGameEngine} from "../../frontend/src/core/game-engine.ts";
const ctx={window:{},console,Date,Map,Set,Math,Number,Error,Array};
ctx.window.window=ctx.window;
for(const name of ["poker-rules","evaluator","game-engine"])
  runInNewContext(readFileSync("js/core/"+name+".js","utf8"),ctx);
const Legacy=ctx.window.PokerLabGameEngine;
const suits=["clubs","diamonds","hearts","spades"];
const cards=suits.flatMap(suit=>Array.from({length:13},(_,i)=>({value:2+i,suit})));
class FixedDeck {
 constructor(){this.cards=cards.slice();this.index=0;}
 drawOne(){return this.cards[this.index++];}
 draw(n=1){return Array.from({length:n},()=>this.drawOne());}
}
ctx.window.PokerLabDeck=FixedDeck;
globalThis.window=ctx.window;
installGameEngine();
const migrated=PokerLabGameEngine;
// Keep the shared browser global until every deterministic hand has completed.
const plain=value=>JSON.parse(JSON.stringify(value));
test("strict TS game engine has exact V1 public state and actions over 120 full deterministic hands",()=>{
 let state=0x7f9a52d;
 const random=max=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)%max;};
 for(let i=0;i<120;i++){
  const n=2+i%5;
  const players=Array.from({length:n},(_,j)=>({id:"p"+j,name:"P"+j,isHuman:j===0,stack:10+random(80)*.5}));
  const options={players,dealerIndex:i%n};
  const old=new Legacy(options),now=new migrated(options);
  old.startHand();now.startHand();
  assert.deepEqual(plain(now.getState()),plain(old.getState()),"initial "+i);
  for(let step=0;step<130&&!old.handComplete;step++){
   const current=old.currentPlayerId;
   assert.equal(current,now.currentPlayerId);
   const opts=old.getPlayerActionOptions(current),choice=random(9);
   let action="check",amount=null;
   if(opts.canCheck){action=choice%3===0&&opts.canBet?"bet":"check";amount=action==="bet"?opts.minimumBet:null;}
   else if(choice===0)action="fold";
   else if(choice===1&&opts.canRaise&&opts.maximumRaiseTo>=opts.minimumRaiseTo){action="raise";amount=opts.minimumRaiseTo;}
   else action="call";
   const attempt=engine=>{try{return {result:plain(engine.act(action,amount,current))};}catch(error){return {error:error.message};}};
   assert.deepEqual(attempt(now),attempt(old),"action "+i+"/"+step);
   assert.deepEqual(plain(now.getState()),plain(old.getState()),"state "+i+"/"+step);
   assert.ok(step<129,"nonterminating hand");
  }
 }
});


test("three-way unequal-stack all-in produces identical V1/V2 side pots and conserves chips",()=>{
  const options={
    players:[
      {id:"p0",name:"Hero",isHuman:true,stack:4},
      {id:"p1",name:"Short",isHuman:false,stack:2},
      {id:"p2",name:"Deep",isHuman:false,stack:12}
    ],
    dealerIndex:0
  };
  function play(Engine){
    const engine=new Engine(options);
    const initial=engine.players.reduce((sum,player)=>sum+player.stack,0);
    const steps=[];
    engine.startHand();
    for(const [playerId,action] of [
      ["p0","all-in"],["p1","all-in"],["p2","call"]
    ]){
      assert.equal(engine.currentPlayerId,playerId,
        "unexpected first-to-act or short all-in betting sequence");
      steps.push({before:plain(engine.getState()),action,result:plain(engine.act(action,null,playerId))});
    }
    const state=plain(engine.getState());
    assert.equal(state.handComplete,true,"three-way all-in must resolve showdown");
    assert.equal(state.result?.type,"showdown");
    assert.ok(state.result.pots.length>=2,"unequal contributions create a side pot");
    assert.equal(state.result.totalPot,10);
    assert.deepEqual(state.result.pots.map(pot=>pot.amount),[6,4]);
    const final=engine.players.reduce((sum,player)=>sum+player.stack,0);
    assert.equal(final,initial,"no chips can be created or lost during payout");
    // Physical wall-clock timestamps cannot match across sequential runs.
    // Preserve exact event order, types, streets and payloads.
    const history=plain(engine.getHandHistory()).map(({timestamp,...event})=>event);
    return {steps,state,history,initial,final};
  }
  assert.deepEqual(play(migrated),play(Legacy));
});


test("five consecutive heads-up and six-max hands preserve V1 blind rotation, chip conservation and card secrecy",()=>{
 for(const seats of [2,6]){
  const players=Array.from({length:seats},(_,index)=>({
   id:"seat_"+index,name:"Seat "+index,isHuman:index===0,stack:200
  }));
  const options={players,dealerIndex:seats-1};
  function scenario(Engine) {
   const engine=new Engine(options);
   const initialTotal=engine.players.reduce((sum,player)=>sum+player.stack,0);
   const observed=[];
   for(let hand=0;hand<5;hand++){
    if(hand===0)engine.startHand();
    else engine.nextHand();
    const dealer=engine.dealerIndex;
    const state=engine.getState();
    assert.equal(state.handNumber,hand+1);
    assert.equal(state.players.length,seats);
    // Internal engine cards belong to the server-side game state; the public
    // state must not expose opponent cards before legal showdown.
    for(const player of state.players){
      if(!player.isHuman)assert.equal(player.holeCards,null);
      else assert.equal(player.holeCards?.length,2);
    }
    if(hand>0)assert.equal(dealer,(observed[hand-1].dealer+1)%seats,
      "Dealer/blind button did not move to the next eligible seat");
    const actions=[];
    for(let turn=0;turn<70&&!engine.handComplete;turn++){
      const actor=engine.currentPlayerId;
      assert.ok(actor,"active hand without actor");
      const options=engine.getPlayerActionOptions(actor);
      const action=options.canCheck?"check":options.canCall?"call":"fold";
      actions.push({street:engine.street,actor,action});
      engine.act(action,null,actor);
      assert.ok(turn<69,"betting round failed to progress");
      if(!engine.handComplete)for(const player of engine.getState().players){
        if(!player.isHuman)assert.equal(player.holeCards,null,
          "opponent private cards leaked before showdown");
      }
    }
    const complete=engine.getState();
    assert.equal(complete.handComplete,true);
    assert.equal(complete.result?.type,"showdown");
    for(const player of complete.players){
      if(!player.folded)assert.equal(player.holeCards?.length,2,
        "showdown did not reveal eligible opponent cards");
    }
    const total=engine.players.reduce((sum,player)=>sum+player.stack,0);
    assert.equal(total,initialTotal,"chips were lost or created in sequential hands");
    const history=plain(engine.getHandHistory()).map(({timestamp,...event})=>event);
    observed.push({dealer,actions,state:plain(complete),history});
   }
   return observed;
  }
  assert.deepEqual(plain(scenario(migrated)),plain(scenario(Legacy)),
    "V1/V2 multi-hand divergence with "+seats+" players");
 }
});
