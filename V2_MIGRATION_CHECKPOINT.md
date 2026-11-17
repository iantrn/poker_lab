# PokerLab V2 — migration checkpoint (17 November 2026)

> This document is a development checkpoint, not a release declaration.
> Work only on `feat/v2-ts-rust-migration`. Never merge or deploy to `main` without explicit user approval.

## Architecture in the feature branch

- React + Vite + strict TypeScript application bootstrap and PWA service worker.
- Rust/WASM primitives: 5/6/7-card evaluator, two-known-hand Monte Carlo equity,
  weighted range histogram and CFR+ zero-sum matrix solver.
- Worker-backed WASM, cancelable scheduler, IndexedDB/Dexie caching and an
  optional mirror of V1 localStorage.
- V1-compatible TypeScript replacements for deck, rules, evaluator, game engine,
  bot profiles/engine, card renderer, poker table, navigation, 169-cell React
  range matrix, range data/viewer, CFR+ primitives, reactive precompute, solver
  modal UI, lessons, puzzles, game review, and application initialization.

## Validation gates

The feature-branch workflow is `.github/workflows/v2-migration.yml`.
Required stages: Rust tests, browser+Node wasm-pack builds, V1 baseline tests,
TypeScript/V1 parity tests, JS/WASM score parity on 12,000 shuffled hands,
production TS strict + Vite build, offline/PWA asset inspection, Chromium
browser smoke including training session, lessons, puzzles, review, mobile
navigation, WASM exports and offline reload.

The evaluator throughput benchmark is deliberately non-gating and runner-specific.
The measured 21.10x speedup (1200 seven-card samples, 179.31 ms JS versus
8.50 ms Rust/WASM) describes the evaluator, **not** the end-to-end postflop solver.

## Incomplete migration — must finish before PR/merge

1. `js/modules/training.js` is still loaded at runtime: port session
   orchestration, action rendering, bot turn scheduling and history saving to TS
   with event and timing parity.
2. `js/modules/postflop-solver.js` still implements the legacy postflop
   analytical inputs/equity layer. Port to Rust/WASM with equivalent ranges,
   blockers, outputs and seeded statistical comparison.
3. `js/modules/postflop-strategy.js` still implements the complete postflop
   game-tree/CFR+ range-vs-range solver in JavaScript. The existing Rust CFR+
   function is only a matrix-game primitive, **not** an equivalent replacement.
4. `pokerlab-solver-worker.js` still imports legacy JS evaluator, bot profiles,
   postflop solver, CFR core and postflop strategy. Replace only after exhaustive
   parity with new Rust/WASM code, maintaining cancelability and real-time UI.
5. React currently mounts the preserved V1 HTML shell. Finish React/TSX
   page/component migration while preserving tested DOM identifiers, behavior,
   accessibility, responsive layout and offline functionality.
6. IndexedDB mirrors V1 storage, which remains authoritative. Any change to
   persistence authority requires migration/rollback tests and zero data loss.
7. Complete end-to-end regression coverage (including iOS Safari installation,
   update lifecycle, full heads-up and 6-max action flows, side pots, bot turns,
   full postflop strategy outputs) and benchmark *whole-solver* workloads.
8. Finish production review and request explicit approval before merging.

## Development discipline

- `main` must remain unchanged.
- Preserve original source files as parity oracles while transitioning.
- Every converted module needs deterministic fixture comparison and browser smoke.
- Do not claim Rust/WASM compiles or the migration is finished without a green
  workflow **at the current HEAD**.
- If a CI check fails, fix or revert the failing feature commit; never leave
  a partial migration advertised as production-ready.

## Resume point

Check the latest feature-branch HEAD and GitHub Actions run before editing.
Investigate the earliest failure, not just the final status; rerun the complete
workflow after every correction.
