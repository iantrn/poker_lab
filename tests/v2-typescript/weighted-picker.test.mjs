import test from "node:test";
import assert from "node:assert/strict";
import {createWeightedPicker} from "../../frontend/src/solver/weighted-picker.ts";

function oldChoice(items,random){
 const total=items.reduce((sum,item)=>sum+item.weight,0);
 let cursor=random()*total;
 for(const item of items){cursor-=item.weight;if(cursor<=0)return item;}
 return items.at(-1);
}
test("precomputed picker has exactly the same selections as V1 linear sampling",()=>{
 const items=Array.from({length:1326},(_,i)=>({id:i,weight:(i*17+11)%23+1}));
 let state=0x7654321;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;
   return (state>>>0)/4294967296;};
 const sample=createWeightedPicker(items,()=>nextDraw);
 let nextDraw=0;
 let selected=0;
 for(let i=0;i<100_000;i++){
   const draw=random();
   nextDraw=draw;
   const actual=sample();
   const expected=oldChoice(items,()=>draw);
   assert.equal(actual.id,expected.id,"weighted selection mismatch on "+i);
   selected+=actual.id;
 }
 assert.ok(selected>0);
});
test("zero-weight boundaries, last combo and invalid weights retain V1 semantics",()=>{
 for(const weights of [[0,0,1],[0,1,0],[1,1,1],[0,0,0],[-1,3,1],[1,NaN,2]]){
   const items=weights.map((weight,i)=>({id:i,weight}));
   for(const fraction of [0,0.0001,0.1,0.49,0.5,0.75,0.999999]){
     const pick=createWeightedPicker(items,()=>fraction);
     assert.equal(pick().id,oldChoice(items,()=>fraction)?.id,
       "Mismatch at "+JSON.stringify(weights)+" / "+fraction);
   }
 }
});
