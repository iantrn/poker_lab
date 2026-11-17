import test from "node:test";
import assert from "node:assert/strict";
import {attachSettingsMirror} from "../../frontend/src/storage/mirror-core.ts";

function fixtures() {
  const values = new Map();
  const persisted = new Map();
  const operations = [];
  const source = {
    get length() {return values.size;},
    key(index) {return [...values.keys()][index] ?? null;},
    getItem(key) {return values.get(key) ?? null;},
    setItem(key,value) {values.set(key,String(value));},
    removeItem(key) {values.delete(key);}
  };
  const storage = {
    save(key,value) {
      try { source.setItem("pokerlab_"+key,JSON.stringify(value)); return true; }
      catch {return false;}
    },
    load(key,defaultValue=null) {
      try {const raw=source.getItem("pokerlab_"+key);return raw===null?defaultValue:JSON.parse(raw);}
      catch {return defaultValue;}
    },
    remove(key) {source.removeItem("pokerlab_"+key);return true;}
  };
  const target = {
    async put(record) {
      operations.push({op:"put",key:record.key,value:record.value});
      persisted.set(record.key,record.value);
    },
    async delete(key) {
      operations.push({op:"delete",key});
      persisted.delete(key);
    }
  };
  return {source,storage,target,values,persisted,operations};
}
test("backfills V1 settings saved before mirror installation, without touching foreign keys",async()=>{
  const f=fixtures();
  f.source.setItem("pokerlab_settings",JSON.stringify({theme:"dark",soundEnabled:true}));
  f.source.setItem("pokerlab_lastPage",JSON.stringify("lessons"));
  f.source.setItem("third_party_token",JSON.stringify("never mirror"));
  const mirror=attachSettingsMirror(f.storage,f.source,f.target);
  await mirror.whenIdle();
  assert.deepEqual(f.persisted.get("settings"),{theme:"dark",soundEnabled:true});
  assert.equal(f.persisted.get("lastPage"),"lessons");
  assert.equal(f.persisted.has("third_party_token"),false);
  assert.equal(f.storage.load("lastPage"),"lessons");
});
test("ordered writes prevent an older asynchronous put from restoring deleted data",async()=>{
  const f=fixtures();
  f.source.setItem("pokerlab_settings",JSON.stringify({theme:"old"}));
  let unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  let started;
  const first=new Promise(resolve=>{started=resolve;});
  let count=0;
  const originalPut=f.target.put;
  f.target.put=async record=>{
    if(++count===1){started();await gate;}
    return originalPut(record);
  };
  const mirror=attachSettingsMirror(f.storage,f.source,f.target);
  await first;
  assert.equal(f.storage.save("settings",{theme:"new"}),true);
  assert.equal(f.storage.remove("settings"),true);
  assert.equal(f.storage.load("settings","missing"),"missing");
  unblock();
  await mirror.whenIdle();
  assert.equal(f.persisted.has("settings"),false);
  assert.deepEqual(f.operations.map(x=>x.op),["put","put","delete"]);
});
test("save writes a JSON-canonical snapshot, and install is idempotent",async()=>{
  const f=fixtures();
  const mirror=attachSettingsMirror(f.storage,f.source,f.target);
  assert.equal(attachSettingsMirror(f.storage,f.source,f.target),mirror);
  const value={name:"ok",skipped:undefined,nested:{count:3}};
  assert.equal(f.storage.save("custom",value),true);
  value.nested.count=17; // V1 snapshots at save time
  await mirror.whenIdle();
  assert.deepEqual(f.persisted.get("custom"),{name:"ok",nested:{count:3}});
  assert.equal(f.operations.length,1);
});
test("blocked IndexedDB does not alter V1 synchronous semantics and does not stall later writes",async()=>{
  const f=fixtures();
  const warnings=[];
  let fail=true;
  f.target.put=async record=>{
    if(fail){fail=false;throw new Error("QuotaExceededError");}
    f.persisted.set(record.key,record.value);
  };
  const mirror=attachSettingsMirror(f.storage,f.source,f.target,e=>warnings.push(String(e)));
  assert.equal(f.storage.save("settings",{theme:"dark"}),true);
  assert.equal(f.storage.save("settings",{theme:"light"}),true);
  await mirror.whenIdle();
  assert.deepEqual(f.storage.load("settings"),{theme:"light"});
  assert.deepEqual(f.persisted.get("settings"),{theme:"light"});
  assert.equal(warnings.length,1);
});
test("malformed old values are skipped without preventing clean new data",async()=>{
  const f=fixtures();
  f.source.setItem("pokerlab_broken","not-json");
  f.source.setItem("pokerlab_valid","42");
  const mirror=attachSettingsMirror(f.storage,f.source,f.target,()=>{});
  await mirror.whenIdle();
  assert.equal(f.persisted.has("broken"),false);
  assert.equal(f.persisted.get("valid"),42);
  assert.equal(f.storage.save("broken",{recovered:true}),true);
  await mirror.whenIdle();
  assert.deepEqual(f.persisted.get("broken"),{recovered:true});
});
