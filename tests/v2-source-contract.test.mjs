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
  assert.match(shell, /page: "review", label: "Analyse"/);
  assert.match(home, /pl-home-card-title/);
  assert.match(mark, /viewBox="0 0 64 64"/);
  assert.doesNotMatch(shell, /[🎯📚⚙]/u);
});

test("Phase 2 page primitives preserve dynamic runtime mounts and game-card isolation", () => {
  const primitives = read("frontend/src/ui/PagePrimitives.tsx");
  assert.match(primitives, /pl-page-panel/);
  assert.match(primitives, /className="bg-surface/);
  for (const page of ["TrainingPage", "TacticsPage", "LessonsPage", "ReviewPage", "SettingsPage"]) {
    const source = read("frontend/src/ui/" + page + ".tsx");
    assert.match(source, /<PagePanel\b/, page + " must use the shared shell");
  }
  const training = read("frontend/src/ui/TrainingPage.tsx");
  for (const hook of ['id="training-configuration"', 'id="training-game"', 'id="training-table"', 'id="training-actions"',
    'data-training-action="start"', 'data-training-action="reset"', 'data-training-action="stop"',
    'data-training-setting="gameMode"', 'data-training-setting="playerCount"',
    'data-training-setting="difficulty"', 'data-training-setting="startingStackBB"'])
    assert.ok(training.includes(hook), "Training runtime hook removed: " + hook);
  const tactics = read("frontend/src/ui/TacticsPage.tsx");
  for (const hook of ['data-puzzle-action="start"', 'data-puzzle-category', 'data-puzzle-difficulty', 'data-puzzles-container'])
    assert.ok(tactics.includes(hook), "Puzzle runtime hook removed: " + hook);
  const lessons = read("frontend/src/ui/LessonsPage.tsx");
  for (const hook of ['data-lessons-progress', 'data-lessons-catalog', 'data-lesson-content', 'data-ranges-viewer'])
    assert.ok(lessons.includes(hook), "Lesson or range runtime hook removed: " + hook);
  const review = read("frontend/src/ui/ReviewPage.tsx");
  for (const hook of ['data-review-history', 'data-review-detail'])
    assert.ok(review.includes(hook), "Review runtime hook removed: " + hook);
  assert.match(read("frontend/src/ui/SettingsPage.tsx"), /id="settings-content"/);
  const design = read("frontend/src/styles/design-system.css");
  assert.doesNotMatch(design, /\.pl-card(?:\b|--|__)/, "New UI must not modify poker card CSS");
  assert.match(design, /min-height:\s*44px/, "Touch control size must not be regressed");
});

test("Phase 3 retains GTO numeric output while improving range and solver presentation", () => {
  const viewer = read("frontend/src/ranges/viewer.ts");
  const solver = read("frontend/src/ui/postflop-solver.ts");
  const design = read("frontend/src/styles/design-system.css");
  assert.match(viewer, /Matrice des ranges — défilement horizontal/);
  assert.match(viewer, /ui\.detail\.setAttribute\("aria-live", "polite"\)/);
  assert.match(solver, /pl-solve-frequency-track/);
  assert.match(solver, /fill\.style\.width = String\(Math\.min\(100, Math\.max\(0, item\.frequency \* 100\)\)\)/);
  assert.match(solver, /item\.frequency \* 100\)\.toLocaleString\("fr-FR"/);
  assert.match(solver, /GTO intégral non certifié/);
  assert.match(design, /grid-template-areas:/);
  assert.match(design, /\.pl-range-matrix \{ min-width: 390px; \}/);
  assert.match(design, /\.pl-solve-frequency-fill/);
  assert.doesNotMatch(design, /\.pl-card(?:\b|--|__)/);
});

test("Phase 4 moves only gameplay controls out of the mobile table", () => {
  const training = read("frontend/src/training/session.ts");
  const css = read("frontend/src/styles/design-system.css");
  assert.match(training, /function synchronizeActionPanelPlacement\(\): void/);
  assert.match(training, /globals\.innerWidth <= 767/);
  assert.match(training, /tableElement\.insertAdjacentElement\("afterend", actionsElement\)/);
  assert.match(training, /globals\.addEventListener\("resize", synchronizeActionPanelPlacement\)/);
  assert.match(css, /#training-game > #training-actions\.pl-action-panel/);
  assert.match(css, /min-height:\s*48px !important/);
  assert.match(css, /font-size:\s*16px !important/);
  assert.match(css, /grid-template-areas:/);
  assert.doesNotMatch(css, /\.pl-card(?:\b|--|__)/, "The new UI layer cannot change card rendering");
});

test("Mobile bet sizing announces selected presets without changing amount constraints", () => {
  const session = read("frontend/src/training/session.ts");
  const style = read("frontend/src/styles/design-system.css");
  assert.match(session, /syncAmount\(preset\.value, button\)/);
  assert.match(session, /button\.setAttribute\("aria-pressed", "false"\)/);
  assert.match(session, /button\.setAttribute\("aria-pressed", String\(button === selectedPreset\)\)/);
  assert.match(session, /const bounded = Math\.min\(maximum, Math\.max\(minimum, parsed\)\)/);
  assert.match(style, /\.pl-bet-preset\[aria-pressed="true"\]/);
});

test("Phase 5 screenshot audit: compact mobile labels and direct range discovery", () => {
  const nav = read("frontend/src/navigation.ts");
  const shell = read("frontend/src/ui/AppShell.tsx");
  const lessons = read("frontend/src/ui/LessonsPage.tsx");
  const design = read("frontend/src/styles/design-system.css");
  assert.match(nav, /window\.scrollTo\(0, 0\)/, "Top of newly opened view must be visible");
  for (const item of [
    'page: "tactics", label: "Exos"',
    'page: "lessons", label: "Leçons"',
    'page: "review", label: "Analyse"'
  ]) assert.ok(shell.includes(item), "Missing compact navigation label: " + item);
  assert.match(shell, /aria-label=\{ariaLabel\}/);
  assert.match(lessons, /className="pl-learning-shortcut"/);
  assert.match(lessons, /getElementById\("preflop-ranges-title"\)\?\.scrollIntoView/);
  assert.match(design, /\.pl-mobile-link span/);
  assert.match(design, /\.pl-learning-shortcut:focus-visible/);
});
