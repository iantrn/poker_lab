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

test("V2 executes typed installers in the exact V1 dependency order without injecting scripts", () => {
  const index = read("index.html");
  const loader = read("frontend/src/legacy/loader.ts");
  const scripts = [...index.matchAll(/<script src="\.\/([^"]+)" defer><\/script>/g)]
    .map(match => match[1]);
  const installers = [...loader.matchAll(/\["(js\/[^"]+\.js)", (install\w+)\]/g)];
  assert.deepEqual(installers.map(match => match[1]), scripts);
  assert.equal(new Set(installers.map(match => match[2])).size, installers.length);
  for (const match of installers)
    assert.match(loader, new RegExp("import \\{[^}]*\\b" + match[2] + "\\b[^}]*\\} from"));
  assert.doesNotMatch(loader, /\b(?:loadClassicScript|importScripts|document\.createElement\(["']script["']\))\b/);
  assert.match(loader, /for \(const \[, install\] of MIGRATED_BOOTSTRAP\) install\(\)/);
});

test("V2 keeps existing engines and source data unchanged", () => {
  for (const file of [
    "js/core/game-engine.js", "js/modules/postflop-solver.js", "js/modules/cfr-core.js",
    "data/ranges/preflop/matrix/index.json", "data/ranges/preflop/matrix/ranges.json"
  ]) assert.ok(fs.statSync(path.join(root, file)).size > 100);
});

test("V2 main thread uses the strict TypeScript postflop strategy without loading its classic script", () => {
  const loader = read("frontend/src/legacy/loader.ts");
  assert.match(loader, /\["js\/modules\/postflop-strategy\.js", installStrategy\]/);
  assert.doesNotMatch(loader, /loadClassicScript\("js\/modules\/postflop-strategy\.js"\)/);
  assert.match(loader, /import \{ installStrategy \} from "\.\.\/solver\/strategy"/);
});
