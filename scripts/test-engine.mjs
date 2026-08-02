// SAP ROLL engine tests — plain Node, no framework.

import {
  CATEGORIES, ROLLS_PER_TURN, UPPER_BONUS_POINTS,
  createInitialState, legalMoves, applyMove, getStatus, previewScores, cardTotals,
} from '../js/engine.js';
import { chooseMove } from '../js/bot.js';

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}

function expectThrow(fn, label) {
  try {
    fn();
    t(false, `${label} (did not throw)`);
  } catch {
    t(true, label);
  }
}

function withDice(dice, rollsLeft = 0) {
  return { ...createInitialState({ numPlayers: 2, seed: 7 }), dice: dice.slice(), rollsLeft };
}

function score(dice, category) {
  return previewScores(withDice(dice))[category];
}

console.log('SAP ROLL ENGINE');

const fresh = createInitialState({ numPlayers: 4, seed: 123 });
t(fresh.numPlayers === 4 && fresh.currentPlayer === 0, 'creates a 4-player game with host first');
t(fresh.dice.every((die) => die === 0) && fresh.rollsLeft === ROLLS_PER_TURN,
  'fresh turn waits for its first roll');
t(legalMoves(fresh).length === 1 && legalMoves(fresh)[0].type === 'roll',
  'only rolling is legal before dice exist');
expectThrow(() => createInitialState({ numPlayers: 1 }), 'rejects too few players');
expectThrow(() => createInitialState({ numPlayers: 5 }), 'rejects too many players');

const before = JSON.stringify(fresh);
const rolled = applyMove(fresh, { type: 'roll' });
t(JSON.stringify(fresh) === before && rolled !== fresh, 'applyMove is immutable');
t(rolled.dice.every((die) => die >= 1 && die <= 6) && rolled.rollsLeft === 2,
  'roll produces five valid dice and spends one roll');
const held = applyMove(rolled, { type: 'toggleHold', index: 2 });
const rerolled = applyMove(held, { type: 'roll' });
t(rerolled.dice[2] === held.dice[2] && rerolled.held[2], 'held die stays pinned through a reroll');
expectThrow(() => applyMove(fresh, { type: 'toggleHold', index: 0 }), 'cannot hold before rolling');
expectThrow(() => applyMove(fresh, { type: 'score', category: 'ones' }), 'cannot score before rolling');

t(score([1, 1, 1, 4, 6], 'ones') === 3 && score([6, 6, 2, 6, 1], 'sixes') === 18,
  'upper boxes add only their matching face');
t(score([1, 3, 4, 5, 6], 'choice') === 19, 'Sap Run adds any five dice');
t(score([4, 4, 4, 4, 2], 'fourKind') === 18 && score([4, 4, 4, 2, 2], 'fourKind') === 0,
  'Hardwood Haul requires at least four alike and scores the total');
t(score([2, 2, 5, 5, 5], 'fullHouse') === 25 && score([3, 3, 3, 3, 3], 'fullHouse') === 0,
  'Sugar Shack is exactly a pair plus three alike');
t(score([1, 2, 3, 4, 4], 'smallStraight') === 30 && score([1, 2, 3, 5, 6], 'smallStraight') === 0,
  'Sugar Trail recognizes a four-number run');
t(score([1, 2, 3, 4, 5], 'largeStraight') === 40 && score([2, 3, 4, 5, 6], 'largeStraight') === 40,
  'The Sap Line recognizes either five-number run');
t(score([6, 6, 6, 6, 6], 'yacht') === 50 && score([6, 6, 6, 6, 5], 'yacht') === 0,
  'FULL BOIL scores only five alike');

const bonusCard = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0]));
Object.assign(bonusCard, { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
t(cardTotals(bonusCard).upper === 63 && cardTotals(bonusCard).bonus === UPPER_BONUS_POINTS,
  '63 upper points earns the 35-point sweet bonus');
bonusCard.ones = 2;
t(cardTotals(bonusCard).upper === 62 && cardTotals(bonusCard).bonus === 0,
  '62 upper points does not earn the bonus');

for (const numPlayers of [2, 3, 4]) {
  let state = withDice([1, 1, 2, 3, 4]);
  state = { ...state, numPlayers, scores: Array.from({ length: numPlayers }, () =>
    Object.fromEntries(CATEGORIES.map((category) => [category.id, null]))) };
  for (let expected = 1; expected <= numPlayers; expected++) {
    state = applyMove(state, { type: 'score', category: 'ones' });
    t(state.currentPlayer === expected % numPlayers,
      `${numPlayers}-player score rotates to seat ${expected % numPlayers}`);
    if (expected < numPlayers) state = { ...state, dice: [2, 2, 3, 4, 5], rollsLeft: 0 };
  }
}

let almostDone = createInitialState({ numPlayers: 2, seed: 99 });
almostDone.scores = almostDone.scores.map((card) =>
  Object.fromEntries(Object.keys(card).map((id) => [id, 0])));
almostDone.scores[0].yacht = null;
almostDone.dice = [6, 6, 6, 6, 6];
almostDone.rollsLeft = 0;
almostDone.currentPlayer = 0;
almostDone = applyMove(almostDone, { type: 'score', category: 'yacht' });
const finished = getStatus(almostDone);
t(finished.over && finished.winner === 0 && finished.totals[0].total === 50,
  'last score ends the game and detects the winner');
t(legalMoves(almostDone).length === 0, 'finished game has no legal moves');
expectThrow(() => applyMove(almostDone, { type: 'roll' }), 'finished game rejects more rolls');

const tied = JSON.parse(JSON.stringify(almostDone));
tied.scores[1].yacht = 50;
const tieStatus = getStatus(tied);
t(tieStatus.over && tieStatus.winner === null && tieStatus.winners.length === 2,
  'equal high totals produce shared winners');

let a = createInitialState({ numPlayers: 3, seed: 0xabc123 });
let b = createInitialState({ numPlayers: 3, seed: 0xabc123 });
for (let i = 0; i < 3; i++) {
  a = applyMove(a, { type: 'roll' });
  b = applyMove(b, { type: 'roll' });
}
t(JSON.stringify(a) === JSON.stringify(b), 'same seed and moves produce byte-identical state');
const resumed = JSON.parse(JSON.stringify(a));
t(JSON.stringify(applyMove(a, { type: 'score', category: 'choice' })) ===
  JSON.stringify(applyMove(resumed, { type: 'score', category: 'choice' })),
  'JSON stringify/parse resumes with identical results');

let soakRng = 0x51a9b00b;
const randomIndex = (length) => {
  soakRng = (Math.imul(soakRng, 1664525) + 1013904223) >>> 0;
  return soakRng % length;
};
for (let game = 0; game < 240; game++) {
  const numPlayers = 2 + (game % 3);
  let state = createInitialState({ numPlayers, seed: soakRng });
  let actions = 0;
  while (!getStatus(state).over && actions < 240) {
    const moves = legalMoves(state);
    let move;
    const roll = moves.find((candidate) => candidate.type === 'roll');
    const scoring = moves.filter((candidate) => candidate.type === 'score');
    if (roll) {
      // Sometimes pin one die between rolls; otherwise keep the soak moving.
      const toggles = moves.filter((candidate) =>
        candidate.type === 'toggleHold' && !state.held[candidate.index]);
      move = state.rollsLeft === 2 && toggles.length && (soakRng & 7) === 0
        ? toggles[randomIndex(toggles.length)]
        : roll;
    } else {
      move = scoring[randomIndex(scoring.length)];
    }
    state = applyMove(state, move);
    actions++;
  }
  if (!getStatus(state).over || actions >= 240) {
    t(false, `random legal game ${game + 1}/240 finishes cleanly`);
  }
}
t(true, '240 random legal games finish cleanly across 2–4 players');

let botState = createInitialState({ numPlayers: 2, seed: 505 });
const started = performance.now();
for (let i = 0; i < 50 && !getStatus(botState).over; i++) {
  const move = chooseMove(botState, i % 2 ? 'bob' : 'sue');
  if (!legalMoves(botState).some((legal) =>
    legal.type === move.type && legal.index === move.index && legal.category === move.category)) {
    t(false, `bot move ${i + 1} is legal`);
  }
  botState = applyMove(botState, move);
}
const elapsed = performance.now() - started;
t(true, 'both bot personalities choose only legal moves');
t(elapsed < 300, `50 bot decisions finish well under 300ms (${elapsed.toFixed(1)}ms)`);

console.log(`\nALL ENGINE TESTS PASSED (${passed} checks; 240-game soak)`);
