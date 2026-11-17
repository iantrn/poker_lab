import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFileSync(path.join(root, file), "utf8");

test("V2 React entrypoint owns the poker application shell", () => {
  const main = read("frontend/src/main.tsx");
  const html = read("frontend/index.html");
  const shell = read("frontend/src/ui/AppShell.tsx");
  assert.match(main, /createRoot\(root\)\.render/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(shell, /<div id="app"/);
  for (const page of ["HomePage", "TrainingPage", "TacticsPage", "LessonsPage", "ReviewPage", "SettingsPage"])
    assert.ok(shell.includes(page), page + " must be rendered by the React application");
  assert.doesNotMatch(main, /loadClassicScript|importScripts/);
});

test("V2 bootstraps strongly typed application modules without injecting classic scripts", () => {
  const loader = read("frontend/src/legacy/loader.ts");
  const installs = [...loader.matchAll(/import \{ (install\w+) \} from "[^"]+";/g)].map(match => match[1]);
  assert.ok(installs.length >= 20, "Expected all typed poker modules to be imported");
  assert.equal(new Set(installs).size, installs.length, "Duplicate typed module installer");
  assert.match(loader, /installStorageMirror\(\)/);
  assert.match(loader, /createTypedPostflopWorker/);
  assert.doesNotMatch(loader, /loadClassicScript|importScripts|document\.createElement\(["']script["']\)/);
});

test("Typed postflop Worker is emitted from the Vite module graph", () => {
  const client = read("frontend/src/workers/postflop-client.ts");
  const precompute = read("frontend/src/solver/precompute.ts");
  assert.match(client, /new Worker\(new URL\("\.\/postflop\.worker\.ts", import\.meta\.url\)/);
  assert.match(precompute, /createTypedPostflopWorker/);
  assert.doesNotMatch(precompute, /pokerlab-solver-worker(?:-v2)?[.]js|retryWithClassicWorker/);
});

test("V2 source data is complete and available independent of the archived V1", () => {
  for (const file of [
    "data/ranges/preflop/matrix/index.json",
    "data/ranges/preflop/matrix/ranges.json",
    "data/lessons/lessons.json",
    "data/puzzles/puzzles.json"
  ]) assert.ok(statSync(path.join(root, file)).size > 100, file);
});
