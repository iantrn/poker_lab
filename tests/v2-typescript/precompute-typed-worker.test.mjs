import test from "node:test";
import assert from "node:assert/strict";
import { installSolverPrecompute } from "../../frontend/src/solver/precompute.ts";

const state = () => ({
  handNumber: 10, street: "river", handComplete: false, currentPlayerId: "hero",
  players: [
    { id: "hero", isHuman: true, folded: false,
      holeCards: [{ value: 14, suit: "hearts" }, { value: 14, suit: "spades" }] },
    { id: "villain", isHuman: false, folded: false, holeCards: null }
  ]
});

function harness(mode) {
  const created = [], events = [];
  class FakeTypedWorker {
    constructor() {
      this.terminated = false;
      this.handlers = new Map();
      this.messages = [];
      created.push(this);
    }
    addEventListener(type, callback) {
      const list = this.handlers.get(type) ?? [];
      list.push(callback);
      this.handlers.set(type, list);
    }
    terminate() { this.terminated = true; }
    emit(type, event) {
      if (this.terminated) return;
      for (const fn of this.handlers.get(type) ?? []) fn(event);
    }
    postMessage(request) {
      this.messages.push(request);
      queueMicrotask(() => {
        if (this.terminated) return;
        if (mode === "event") {
          this.emit("error", { message: "Typed Worker script failed" });
          return;
        }
        if (mode === "response" || (mode === "strategy" && request.task === "strategy")) {
          this.emit("message", { data: {
            id: request.id, ok: false, error: "Typed Worker task failed"
          } });
          return;
        }
        this.emit("message", { data: {
          id: request.id, ok: true,
          result: request.task === "equity"
            ? { equity: 0.5, iterations: 300 }
            : { actions: [{ action: "check", frequency: 1 }] }
        } });
      });
    }
  }
  const global = {
    AbortController,
    Worker: FakeTypedWorker,
    PokerLabV2: {
      createTypedPostflopWorker() {
        if (mode === "factory") throw new Error("Typed Worker creation failed");
        return new FakeTypedWorker();
      }
    },
    PokerLabTraining: { getGameState: state, getHandHistory: () => [] },
    PokerLabPostflopSolver: {
      createInput(next) { return { schemaVersion: 1, state: next, history: [] }; }
    }
  };
  globalThis.window = global;
  const api = installSolverPrecompute();
  delete globalThis.window;
  api.subscribe(snapshot => events.push(snapshot.phase));
  return { api, created, events };
}

test("successful V2 typed Worker preserves equity, strategy, cache and task protocol", async () => {
  const { api, created, events } = harness("success");
  api.onStateChange();
  const result = await api.getOrStart();
  assert.equal(result.equity.equity, 0.5);
  assert.deepEqual(result.strategy.actions, [{ action: "check", frequency: 1 }]);
  assert.equal(result.strategyError, null);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].messages.map(m => m.task), ["equity", "strategy"]);
  assert.equal(api.getActiveKey(), null);
  assert.equal(api.getCacheSize(), 1);
  assert.deepEqual(await api.getOrStart(), result);
  assert.deepEqual(events.filter(phase => phase === "complete"), ["complete"]);
});

for (const mode of ["factory", "event", "response"]) {
  test("typed Worker " + mode + " failure stops safely without classic JS fallback", async () => {
    const { api, created, events } = harness(mode);
    await assert.rejects(() => api.getOrStart(), /Typed Worker|Worker task/);
    assert.ok(created.length <= 1, "Never spawn a classic or second Worker");
    assert.equal(api.getActiveKey(), null);
    assert.equal(api.getCacheSize(), 0);
    assert.ok(events.includes("error"));
  });
}

test("typed Worker strategy errors retain partial equity without a second Worker", async () => {
  const { api, created } = harness("strategy");
  const value = await api.getOrStart();
  assert.equal(value.equity.equity, 0.5);
  assert.equal(value.strategy, null);
  assert.match(value.strategyError, /Typed Worker task failed/);
  assert.equal(created.length, 1);
});

test("V2 Rust backend can still be forced to TypeScript with normal task protocol", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const { api, created } = harness("success");
  globalThis.localStorage = {
    getItem(key) { return key === "pokerlab_v2_cfr_backend" ? "typescript" : null; }
  };
  try {
    const value = await api.getOrStart();
    assert.equal(value.strategyError, null);
    assert.equal(created.length, 1);
    assert.deepEqual(created[0].messages.map(msg => msg.task), ["equity", "strategy"]);
    assert.equal(Object.hasOwn(created[0].messages[0], "experimentalRustCfr"), false);
    assert.equal(created[0].messages[1].experimentalRustCfr, false);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test("V2 explicit Rust override is only attached to postflop strategy requests", async () => {
  const originalLocalStorage = globalThis.localStorage;
  const { api, created } = harness("success");
  globalThis.localStorage = {
    getItem(key) { return key === "pokerlab_v2_cfr_backend" ? "rust" : null; }
  };
  try {
    await api.getOrStart();
    assert.equal(created[0].messages[1].experimentalRustCfr, true);
    assert.equal(Object.hasOwn(created[0].messages[0], "experimentalRustCfr"), false);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});
