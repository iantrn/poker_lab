import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { installBotProfiles } from '../../frontend/src/bots/profiles.ts';
const global = {};
runInNewContext(readFileSync('js/bots/bot-profiles.js','utf8'), {window:global,JSON,Object});
const legacy=global.PokerLabBotProfiles;
globalThis.window={};
const typed=installBotProfiles();
const norm=value=>JSON.parse(JSON.stringify(value));
test('bot profiles, difficulties and public methods exactly match V1',()=>{
  for(const key of ['PROFILES','DIFFICULTIES']) assert.deepEqual(norm(typed[key]),norm(legacy[key]));
  for(const id of ['nit','tag','lag','balanced','missing']){
    assert.deepEqual(norm(typed.getProfile(id)),norm(legacy.getProfile(id)));
    assert.equal(typed.hasProfile(id),legacy.hasProfile(id));
  }
  for(const id of ['easy','medium','hard','missing']){
    assert.deepEqual(norm(typed.getDifficulty(id)),norm(legacy.getDifficulty(id)));
    assert.equal(typed.hasDifficulty(id),legacy.hasDifficulty(id));
  }
  assert.deepEqual(norm(typed.getAllProfiles()),norm(legacy.getAllProfiles()));
  assert.deepEqual(norm(typed.getAllDifficulties()),norm(legacy.getAllDifficulties()));
});
test('bot profiles are deep-cloned to avoid mutation of the strategy defaults',()=>{
  const first=typed.getProfile('nit');
  first.stats.vpip=999;
  first.characteristics.push('modified');
  assert.equal(typed.getProfile('nit').stats.vpip,14);
  assert.equal(typed.getProfile('nit').characteristics.length,3);
});
