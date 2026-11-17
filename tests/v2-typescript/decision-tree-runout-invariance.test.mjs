import test from "node:test";
import assert from "node:assert/strict";
import {buildDecisionTree} from "../../frontend/src/solver/decision-tree.ts";

const card=(value,suit)=>({value,suit});
const known=[card(2,"clubs"),card(7,"diamonds"),card(9,"hearts"),
  card(11,"spades"),card(13,"diamonds")];
const candidateA=[card(4,"clubs"),card(5,"hearts")];
const candidateB=[card(10,"spades"),card(12,"clubs")];
const options={canBet:true,canRaise:false,minimumBet:1,
  minimumRaiseTo:1,maximumRaiseTo:4};
function makeState(board){
 return {
  board,pot:10,lastFullRaise:1,blinds:{bigBlind:1},
  postflopFirstActorId:"villain",
  players:[
   {id:"hero",position:"BTN",stack:4,streetBet:0,hasActed:false,lastActedBet:0},
   {id:"villain",position:"BB",stack:4,streetBet:0,hasActed:false,lastActedBet:0}
  ]
 };
}
const topology=tree=>JSON.stringify(tree,(key,value)=>
  key==="board"&&Array.isArray(value)?value.length:value);
function changedFutureBoards(a,b){
 if(a.terminal||b.terminal)return 0;
 let changes=a.board.length>3&&JSON.stringify(a.board)!==JSON.stringify(b.board)?1:0;
 for(let index=0;index<a.actions.length;index++)
  changes+=changedFutureBoards(a.actions[index].child,b.actions[index].child);
 return changes;
}
test("postflop betting topology does not depend on the runout card identities",()=>{
 for(const [street,boardLength] of [["flop",3],["turn",4],["river",5]]){
  const board=known.slice(0,boardLength);
  const n=5-boardLength;
  const first=buildDecisionTree(makeState(board),options,[],candidateA.slice(0,n));
  const next=buildDecisionTree(makeState(board),options,[],candidateB.slice(0,n));
  assert.equal(first.nodeCount,next.nodeCount,"node count changes on "+street);
  assert.equal(topology(first.tree),topology(next.tree),
   "public action topology changes with runout cards on "+street);
  if(n>0)assert.ok(changedFutureBoards(first.tree,next.tree)>0,
   "fixture needs deeper-street public boards on "+street);
 }
});
