import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("React template retains all legacy IDs, data-attributes, and nav anchors", () => {
  const legacy = read("index.html");
  const shell = read("frontend/src/ui/legacy-shell.html");
  const originalBody = legacy.slice(legacy.indexOf('<div id="app"'), legacy.indexOf('<!-- JAVASCRIPT'));
  for (const pattern of [/\sid="([^"]+)"/g, /\sdata-[\w-]+="([^"]+)"/g, /href="#([^"]+)"/g]) {
    const source = [...originalBody.matchAll(pattern)].map(match => match[0]).sort();
    const migrated = [...shell.matchAll(pattern)].map(match => match[0]).sort();
    assert.deepEqual(migrated, source);
  }
});

test("V2 script loader retains validated legacy script order", () => {
  const index = read("index.html");
  const loader = read("frontend/src/legacy/loader.ts");
  const scripts = [...index.matchAll(/<script src="\.\/([^"]+)" defer><\/script>/g)].map(match => match[1]);
  const scriptList = loader.split("const SCRIPTS = [")[1].split("] as const;")[0];
  const newScripts = [...scriptList.matchAll(/"(js\/[^"]+\.js)"/g)].map(match => match[1]);
  assert.deepEqual(newScripts, scripts);
});

test("V2 keeps existing engines and source data unchanged", () => {
  for (const file of [
    "js/core/game-engine.js", "js/modules/postflop-solver.js", "js/modules/cfr-core.js",
    "data/ranges/preflop/matrix/index.json", "data/ranges/preflop/matrix/ranges.json"
  ]) assert.ok(fs.statSync(path.join(root, file)).size > 100);
});
