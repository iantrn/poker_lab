import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const wasm = require(path.join(root, "engine", "pkg-node"));
const legacy = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js", "core", "evaluator.js"), "utf8"), legacy);
const old = legacy.window.PokerLabHandEvaluator;
const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const deck = Array.from({ length: 52 }, (_, index) => ({ value: 2 + index % 13, suit: SUITS[Math.floor(index / 13)] }));
function packed(card) { return card.value | (SUITS.indexOf(card.suit) << 4); }
let state = 0xdeadbeef;
function random(max) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) % max;
}

test("Rust WASM evaluator has identical 5/6/7-card scores over 12,000 shuffled hands", () => {
  for (let count = 5; count <= 7; count++) {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const cards = deck.slice();
      for (let index = 0; index < count; index++) {
        const next = index + random(cards.length - index);
        [cards[index], cards[next]] = [cards[next], cards[index]];
      }
      const hand = cards.slice(0, count);
      const expected = Array.from(old.evaluate(hand).score);
      const actual = Array.from(wasm.evaluate_score(Uint8Array.from(hand.map(packed))));
      assert.deepEqual(actual, expected, `Mismatch for ${JSON.stringify(hand)}`);
    }
  }
});

test("Rust WASM evaluator rejects duplicates", () => {
  const cards = Uint8Array.from([0x02,0x02,0x03,0x04,0x05]);
  assert.throws(() => wasm.evaluate_score(cards));
});

test("Rust WASM CFR+ converges to mixed equilibrium of Matching Pennies", () => {
  const strategy = Array.from(wasm.cfr_plus_matrix(new Float64Array([1,-1,-1,1]), 2,2,20000));
  for (const probability of strategy) assert.ok(Math.abs(probability - 0.5) < 0.025);
});

test("WASM weighted range equity is exact on river and deterministic on flop",()=>{
  const exact=Array.from(wasm.equity_range_monte_carlo(
    new Uint8Array([0x0e,0x23]),
    new Uint8Array([0x0d,0x0c,0x0b,0x0a,0x02]),
    new Uint8Array([0x12,0x14,0x0e,0x32]),
    new Float64Array([1,10]),10,11n));
  assert.deepEqual(exact,[1,0,0]);
  const args=[
    new Uint8Array([0x0e,0x1e]),
    new Uint8Array([0x02,0x13,0x24]),
    new Uint8Array([0x0d,0x1d,0x03,0x14]),
    new Float64Array([1,2]),500,123n
  ];
  const first=Array.from(wasm.equity_range_monte_carlo(...args));
  const second=Array.from(wasm.equity_range_monte_carlo(...args));
  assert.deepEqual(first,second);
  assert.ok(Math.abs(first.reduce((a,b)=>a+b,0)-1)<1e-12);
});
