// SAP ROLL — pure Yacht dice rules for Btown Games.
//
// Every rule is a pure function over one plain JSON-serializable state object.
// No DOM, timers, Date, Math.random, or imports. The seeded PRNG lives in the
// state so every phone can replay and resume the exact same game.

export const DICE_COUNT = 5;
export const ROLLS_PER_TURN = 3;
export const UPPER_BONUS_TARGET = 63;
export const UPPER_BONUS_POINTS = 35;

export const CATEGORIES = Object.freeze([
  { id: 'ones', name: 'First Taps', short: '1s', help: 'Add all ones.' },
  { id: 'twos', name: 'Twin Buckets', short: '2s', help: 'Add all twos.' },
  { id: 'threes', name: 'Three Maples', short: '3s', help: 'Add all threes.' },
  { id: 'fours', name: 'Four Flues', short: '4s', help: 'Add all fours.' },
  { id: 'fives', name: 'Five Gallons', short: '5s', help: 'Add all fives.' },
  { id: 'sixes', name: 'Six Sugarmakers', short: '6s', help: 'Add all sixes.' },
  { id: 'choice', name: 'Sap Run', short: 'Any', help: 'Add all five dice, whatever they show.' },
  { id: 'fourKind', name: 'Hardwood Haul', short: '4×', help: 'Four or more alike scores the total of all dice.' },
  { id: 'fullHouse', name: 'Sugar Shack', short: '3+2', help: 'Three of one number and two of another scores 25.' },
  { id: 'smallStraight', name: 'Sugar Trail', short: '4↗', help: 'Four numbers in a row scores 30.' },
  { id: 'largeStraight', name: 'The Sap Line', short: '5↗', help: 'Five numbers in a row scores 40.' },
  { id: 'yacht', name: 'FULL BOIL!', short: '5×', help: 'Five alike scores 50.' },
]);

const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));
const UPPER_IDS = CATEGORIES.slice(0, 6).map((category) => category.id);

/** Start a 2–4 player game. Player 0 rolls first. */
export function createInitialState({ numPlayers = 2, seed = 1 } = {}) {
  if (!Number.isInteger(numPlayers) || numPlayers < 2 || numPlayers > 4) {
    throw new Error('SAP ROLL needs 2 to 4 players.');
  }
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer.');
  return {
    version: 1,
    numPlayers,
    rng: seed >>> 0,
    currentPlayer: 0,
    dice: new Array(DICE_COUNT).fill(0),
    held: new Array(DICE_COUNT).fill(false),
    rollsLeft: ROLLS_PER_TURN,
    scores: Array.from({ length: numPlayers }, () => emptyCard()),
    turnNumber: 0,
    lastAction: null,
  };
}

/** Every legal action for the current state. */
export function legalMoves(state) {
  if (getStatus(state).over) return [];
  const moves = [];
  const hasRolled = state.rollsLeft < ROLLS_PER_TURN;
  if (state.rollsLeft > 0) moves.push({ type: 'roll' });
  if (!hasRolled) return moves;

  if (state.rollsLeft > 0) {
    for (let index = 0; index < DICE_COUNT; index++) {
      moves.push({ type: 'toggleHold', index });
    }
  }
  for (const category of CATEGORIES) {
    if (state.scores[state.currentPlayer][category.id] === null) {
      moves.push({
        type: 'score',
        category: category.id,
        points: scoreDice(category.id, state.dice),
      });
    }
  }
  return moves;
}

/** Apply a roll, hold toggle, or score. Returns a brand-new state. */
export function applyMove(state, move) {
  if (!move || typeof move !== 'object') throw new Error('Move must be an object.');
  const legal = legalMoves(state);

  if (move.type === 'roll') {
    if (!legal.some((candidate) => candidate.type === 'roll')) {
      throw new Error('No rolls remain this turn.');
    }
    let rng = state.rng >>> 0;
    const dice = state.dice.slice();
    for (let index = 0; index < DICE_COUNT; index++) {
      if (!state.held[index]) {
        [rng, dice[index]] = rollDie(rng);
      }
    }
    return {
      ...copyState(state),
      rng,
      dice,
      rollsLeft: state.rollsLeft - 1,
      lastAction: { type: 'roll', player: state.currentPlayer },
    };
  }

  if (move.type === 'toggleHold') {
    if (!Number.isInteger(move.index) ||
        !legal.some((candidate) => candidate.type === 'toggleHold' && candidate.index === move.index)) {
      throw new Error('That die cannot be held right now.');
    }
    const held = state.held.slice();
    held[move.index] = !held[move.index];
    return {
      ...copyState(state),
      held,
      lastAction: { type: 'toggleHold', player: state.currentPlayer, index: move.index },
    };
  }

  if (move.type === 'score') {
    const scoring = legal.find((candidate) =>
      candidate.type === 'score' && candidate.category === move.category);
    if (!scoring || !CATEGORY_IDS.has(move.category)) {
      throw new Error('That score box is not open.');
    }
    const scores = state.scores.map((card) => ({ ...card }));
    scores[state.currentPlayer][move.category] = scoring.points;
    const nextPlayer = (state.currentPlayer + 1) % state.numPlayers;
    return {
      ...copyState(state),
      scores,
      currentPlayer: nextPlayer,
      dice: new Array(DICE_COUNT).fill(0),
      held: new Array(DICE_COUNT).fill(false),
      rollsLeft: ROLLS_PER_TURN,
      turnNumber: state.turnNumber + 1,
      lastAction: {
        type: 'score',
        player: state.currentPlayer,
        category: move.category,
        points: scoring.points,
      },
    };
  }

  throw new Error(`Unknown move type: ${String(move.type)}`);
}

/** Active turn or final totals and winner(s). */
export function getStatus(state) {
  const totals = state.scores.map(cardTotals);
  const complete = state.scores.every((card) =>
    CATEGORIES.every((category) => card[category.id] !== null));
  if (!complete) {
    return {
      status: 'active',
      over: false,
      turn: state.currentPlayer,
      totals,
      winners: [],
      winner: null,
    };
  }
  const high = Math.max(...totals.map((total) => total.total));
  const winners = totals.flatMap((total, player) => total.total === high ? [player] : []);
  return {
    status: 'over',
    over: true,
    turn: null,
    totals,
    winners,
    winner: winners.length === 1 ? winners[0] : null,
  };
}

/** Score all currently open categories; useful to UIs and bots. */
export function previewScores(state) {
  const card = state.scores[state.currentPlayer];
  return Object.fromEntries(CATEGORIES.map((category) => [
    category.id,
    card[category.id] === null ? scoreDice(category.id, state.dice) : null,
  ]));
}

/** Upper subtotal, bonus, lower subtotal, and grand total for one card. */
export function cardTotals(card) {
  const upper = UPPER_IDS.reduce((sum, id) => sum + (card[id] || 0), 0);
  const bonus = upper >= UPPER_BONUS_TARGET ? UPPER_BONUS_POINTS : 0;
  const lower = CATEGORIES.slice(6).reduce((sum, category) => sum + (card[category.id] || 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

function emptyCard() {
  return Object.fromEntries(CATEGORIES.map((category) => [category.id, null]));
}

function copyState(state) {
  return {
    ...state,
    dice: state.dice.slice(),
    held: state.held.slice(),
    scores: state.scores.map((card) => ({ ...card })),
    lastAction: state.lastAction ? { ...state.lastAction } : null,
  };
}

function rollDie(rng) {
  const next = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  return [next, (next % 6) + 1];
}

function scoreDice(category, dice) {
  const counts = new Array(7).fill(0);
  for (const die of dice) counts[die]++;
  const total = dice.reduce((sum, die) => sum + die, 0);
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  const run = unique.join('');

  const upperIndex = UPPER_IDS.indexOf(category);
  if (upperIndex !== -1) return counts[upperIndex + 1] * (upperIndex + 1);
  if (category === 'choice') return total;
  if (category === 'fourKind') return counts.some((count) => count >= 4) ? total : 0;
  if (category === 'fullHouse') return counts.includes(3) && counts.includes(2) ? 25 : 0;
  if (category === 'smallStraight') {
    return run.includes('1234') || run.includes('2345') || run.includes('3456') ? 30 : 0;
  }
  if (category === 'largeStraight') return run === '12345' || run === '23456' ? 40 : 0;
  if (category === 'yacht') return counts.includes(5) ? 50 : 0;
  throw new Error(`Unknown category: ${category}`);
}
