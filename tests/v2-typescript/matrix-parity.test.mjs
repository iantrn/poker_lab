import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { allHands,handAt,normalizeRange } from '../../frontend/src/ranges/matrix-model.ts';
const globals={};
runInNewContext(readFileSync('js/components/range-matrix.js','utf8'),{window:globals,Map,Set,Number,Object,Array});
const old=globals.PokerLabRangeMatrix;
const plain=value=>JSON.parse(JSON.stringify(value));
test('all 169 matrix grid positions match legacy',()=>{
  assert.deepEqual(allHands(),plain(old.getAllHands()));
  for(let row=0;row<13;row++)for(let col=0;col<13;col++)
    assert.equal(handAt(row,col),old.getHandName(row,col));
});
test('frequency normalization matches V1 (including invalid scalar strings)',()=>{
  const values=[0,1,14,25.6,50,100,125,-10,true,false,null,undefined,'75','',NaN,Infinity,[],{},
    {frequency:0},{frequency:25.5},{frequency:'42'},{frequency:true},{frequency:null}];
  const range=Object.fromEntries(allHands().map((hand,index)=>[hand,values[index%values.length]]));
  range['aKs']={frequency:55};range['not-a-hand']=100;
  assert.deepEqual(normalizeRange(range),plain(old.normalizeRange(range)));
  assert.equal('AA' in normalizeRange({AA:'76'}),false);
  assert.deepEqual(normalizeRange({AKs:{frequency:'40'}}),{AKs:40});
});
