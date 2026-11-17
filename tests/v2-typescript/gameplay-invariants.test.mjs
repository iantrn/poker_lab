import test from "node:test";
import assert from "node:assert/strict";
import { installDeck } from "../../frontend/src/core/deck.ts";
import { installPokerRules } from "../../frontend/src/core/poker-rules.ts";
import { installEvaluator } from "../../frontend/src/core/evaluator.ts";
import { installGameEngine } from "../../frontend/src/core/game-engine.ts";
import { installBotProfiles } from "../../frontend/src/bots/profiles.ts";

// These tests exercise actual V2 TypeScript modules without reading V1 fixtures.
const previousWindow = globalThis.window;
globalThis.window = {};
const Deck = installDeck();
const rules = installPokerRules();
const evaluator = installEvaluator();
const Game = installGameEngine();
const botProfiles = installBotProfiles();
if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

// The engine uses window as its dependency container when a game starts.
function withRuntime(callback) {
  const previous = globalThis.window;
  globalThis.window = {
    PokerLabDeck: Deck, PokerLabRules: rules, PokerLabHandEvaluator: evaluator
  };
  try { return callback(); }
  finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("V2 deck exposes 52 unique cards, deterministic unshuffled order and finite draws", () => {
  const deck = new Deck({ autoShuffle: false });
  assert.equal(deck.remaining(), 52);
  const cards = deck.draw(52);
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map(card => card.id)).size, 52);
  assert.equal(new Set(cards.map(card => card.suit)).size, 4);
  assert.equal(deck.isEmpty(), true);
  assert.equal(deck.remaining(), 0);
  deck.reset({ shuffle: false });
  assert.equal(deck.remaining(), 52);
  assert.equal(deck.getState().dealtCards, 0);
});

test("V2 showdown evaluation and fundamental no-limit betting rules have known results", () => {
  const royal = [10,11,12,13,14].map(value => ({value,suit:"hearts"}));
  const result = evaluator.evaluate(royal);
  assert.equal(result.category, 9);
  assert.equal(result.score[0], 9);
  assert.equal(evaluator.compareScores(result.score, result.score), 0);
  assert.throws(() => evaluator.evaluate([royal[0], royal[0], ...royal.slice(2)]));
  assert.equal(rules.betting.getMinimumRaiseTo(2,2),4);
  assert.equal(rules.betting.getAmountToCall(6,2),4);
  assert.ok(rules.positions.getPositionNames(2).includes("BTN/SB"));
  assert.equal(rules.positions.getPositionNames(6).length,6);
});

test("V2 bot personality catalog remains independently queryable", () => {
  const profiles = botProfiles.getAllProfiles();
  const difficulties = botProfiles.getAllDifficulties();
  assert.ok(profiles.length >= 3);
  assert.ok(difficulties.length >= 2);
  assert.equal(botProfiles.hasProfile("balanced"),true);
  assert.equal(botProfiles.getProfile("unavailable"),null);
});

for (const seats of [2, 3, 4, 5, 6]) {
  test("V2 " + seats + "-seat hands maintain legal actors, chip conservation and rotation", () =>
    withRuntime(() => {
      const players = Array.from({length: seats}, (_, i) =>
        ({id:"player"+i,name:"Seat "+i,stack:100,isHuman:i===0,isBot:false}));
      const game = new Game({players,smallBlind:0.5,bigBlind:1,dealerIndex:0});
      assert.equal(game.startHand().street,"preflop");
      assert.equal(game.handPositions.length,seats);
      assert.equal(new Set(game.handPositions.map(p=>p.position)).size,seats);
      assert.equal(new Set(game.players.flatMap(p=>p.holeCards.map(c=>c.value+"_"+c.suit))).size,seats*2);
      if(seats===2)assert.equal(game.handPositions[0].position,"BTN/SB");
      let actions = 0;
      while(!game.handComplete) {
        assert.ok(actions++<100,"Betting round must terminate");
        const playerId=game.currentPlayerId;
        assert.ok(playerId,"Live hand must have a current actor");
        const options=game.getPlayerActionOptions(playerId);
        const action=options.canCheck?"check":options.canCall?"call":"fold";
        game.act(action,null,playerId);
        if(!game.handComplete) {
          const total=game.players.reduce((sum,p)=>sum+p.stack,0)+game.getPot();
          assert.equal(total,100*seats,"Chip conservation during betting");
        }
      }
      assert.equal(game.players.reduce((sum,p)=>sum+p.stack,0),100*seats,
        "All chips must be distributed after showdown");
      assert.equal(game.board.length,5);
      const dealer=game.dealerIndex;
      game.nextHand();
      assert.equal(game.dealerIndex,(dealer+1)%seats);
      assert.equal(game.handNumber,2);
    })
  );
}
