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

test("UI phase 1 uses scoped palette aliases and protects card rendering", () => {
  const main = read("frontend/src/main.tsx");
  const shell = read("frontend/src/ui/AppShell.tsx");
  const home = read("frontend/src/ui/HomePage.tsx");
  const icons = read("frontend/src/ui/PokerLabIcon.tsx");
  const design = read("frontend/src/styles/design-system.css");
  const mark = read("assets/icons/pokerlab-mark.svg");
  assert.match(main, /styles\/design-system\.css/);
  assert.match(design, /--pl-color-accent:\s*var\(--accent-red\)/);
  assert.match(design, /--pl-color-selection:\s*var\(--accent-gold\)/);
  assert.doesNotMatch(design, /\.pl-card(?:\b|--|__)/, "New UI layer must never style poker cards");
  assert.match(icons, /strokeWidth="1\.75"/);
  assert.match(icons, /stroke="currentColor"/);
  for (const section of ["home", "training", "tactics", "lessons", "review", "settings"])
    assert.ok(shell.includes('data-module="' + section + '"'), "Missing module hook: " + section);
  assert.match(shell, /pl-mobile-nav/);
  assert.match(shell, /page: "review", label: "Review"/);
  assert.match(home, /pl-home-card-title/);
  assert.match(mark, /viewBox="0 0 64 64"/);
  assert.doesNotMatch(shell, /[🎯📚⚙]/u);
});
