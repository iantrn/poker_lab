import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { installCards } from '../../frontend/src/components/cards.ts';
const oldWindow={};
runInNewContext(readFileSync('js/components/cards.js','utf8'),{window:oldWindow,document:{},Object,Number,Array});
const legacy=oldWindow.PokerLabCards;
globalThis.window={};const current=installCards();delete globalThis.window;
const normalize=x=>JSON.parse(JSON.stringify(x));
test('card display information matches legacy across all 52 cards',()=>{
  for(let value=2;value<=14;value++)for(const suit of ['clubs','diamonds','hearts','spades']){
    const card={value,suit};
    for(const name of ['isValidCard','getRank','getSuit','getCardLabel'])
      assert.deepEqual(normalize(current[name](card)),normalize(legacy[name](card)),name+' '+JSON.stringify(card));
  }
});
test('card validation errors and invalid placeholders retain legacy semantics',()=>{
  for(const card of [null,undefined,{},'Ah',{value:15,suit:'clubs'},{value:14,suit:'jokers'},{value:2.5,suit:'hearts'}]){
    assert.equal(current.isValidCard(card),legacy.isValidCard(card));
    assert.equal(current.getCardLabel(card),legacy.getCardLabel(card));
    for(const name of ['getRank','getSuit']){
      assert.throws(()=>current[name](card),/Carte invalide/);
      assert.throws(()=>legacy[name](card),/Carte invalide/);
    }
  }
});
