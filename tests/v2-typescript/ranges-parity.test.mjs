import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { normalizeCombo, toHandClass, installRangesData } from '../../frontend/src/ranges/data.ts';

const legacyWindow = {};
runInNewContext(readFileSync('js/modules/ranges-data.js', 'utf8'), {
  window: legacyWindow, URL, Map, Promise, TypeError, Error,
  fetch: async () => { throw Error('not fetched'); },
  document: { baseURI: 'https://example.invalid/poker_lab/' }
});
const legacy = legacyWindow.PokerLabRangesData;
globalThis.window = {};
const typed = installRangesData();
const ranks = '23456789TJQKA';
const suits = 'cdhs';
const deck = [...suits].flatMap(s => [...ranks].map(r => r+s));
test('preflop range normalization exactly matches V1 (2,652 permutations)', () => {
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      for (const combo of [deck[i] + deck[j], deck[j] + deck[i]]) {
        assert.equal(normalizeCombo(combo), legacy.normalizeCombo(combo), combo);
        assert.equal(toHandClass(combo), legacy.toHandClass(combo), combo);
      }
    }
  }
});
test('frequency lookups and ambiguous dataset selection match V1', () => {
  const node = { range: { comboFrequencies: { AsKs: .37 }, defaultFrequency: .1,
    classFrequencies: { AKs: { frequency: .25 } } } };
  for (const combo of ['AsKs', 'KsAs', 'Ad2c']) {
    assert.equal(typed.getComboFrequency(node, combo), legacy.getComboFrequency(node, combo));
    assert.deepEqual(typed.getHandClassSummary(node, combo), legacy.getHandClassSummary(node, combo));
  }
  const catalog = { datasets: [
    { status: 'ready', game: { format: '6max', tableSize: 6 }, spot: { actorPosition: 'BU' } },
    { status: 'ready', game: { format: '6max', tableSize: 6 }, spot: { actorPosition: 'CO' } },
    { status: 'pending', game: { format: 'hu' }, spot: {} }
  ] };
  for (const ctx of [{ format: '6max' }, { format: '6max', actorPosition: 'BU' }, { format: 'hu' }]) {
    assert.deepEqual(typed.findDataset(catalog, ctx), legacy.findDataset(catalog, ctx));
  }
});
