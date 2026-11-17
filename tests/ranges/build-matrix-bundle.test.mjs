import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");

test("range build generates index and complete bundle without individual spot JSON files",()=>{
  const tmp=mkdtempSync(path.join(tmpdir(),"pokerlab-ranges-"));
  try{
    const input=path.join(tmp,"source");
    const output=path.join(tmp,"matrix");
    mkdirSync(path.join(input,"utg"),{recursive:true});
    writeFileSync(path.join(input,"utg","UTG_RFI.json"),JSON.stringify({
      spot:{originalFilename:"UTG_RFI.txt"},
      range:{classFrequencies:{
        AA:{frequency:0.5,possibleCombos:6},
        AKs:{frequency:0.25,possibleCombos:4},
        "72o":{frequency:0,possibleCombos:12}
      }}
    }));
    const result=spawnSync(process.execPath,[
      path.join(root,"tools/ranges/build-matrix.mjs"),
      "--input-dir",input,"--output-dir",output
    ],{encoding:"utf8"});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(readdirSync(output).sort(),["index.json","ranges.json"]);
    assert.equal(existsSync(path.join(output,"utg")),false);
    const index=JSON.parse(readFileSync(path.join(output,"index.json"),"utf8"));
    const bundle=JSON.parse(readFileSync(path.join(output,"ranges.json"),"utf8"));
    assert.deepEqual(index.spots.map(entry=>entry.id),["utg/UTG_RFI"]);
    assert.deepEqual(bundle.ranges["utg/UTG_RFI"],{AA:50,AKs:25});
  }finally{
    rmSync(tmp,{recursive:true,force:true});
  }
});
