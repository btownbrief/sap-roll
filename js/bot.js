// SAP ROLL bots. Decisions use only the engine's public API and visible state.

import { CATEGORIES, legalMoves, previewScores } from './engine.js';

export const BOTS = Object.freeze({
  sue: { name: 'Sugarmaker Sue', emoji: '🪣', blurb: 'steady hands, sharp pencil' },
  bob: { name: 'Backyard Bob', emoji: '🪵', blurb: 'trusts the dice and the weather' },
});

export function chooseMove(state, personality = 'sue') {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (personality === 'bob') return bobMove(state, moves);
  return sueMove(state, moves);
}

function sueMove(state, moves) {
  const scoreMoves = moves.filter((move) => move.type === 'score');
  const roll = moves.find((move) => move.type === 'roll');
  if (!scoreMoves.length) return roll || moves[0];

  const bestScore = bestScoringMove(state, scoreMoves);
  if (!roll || bestScore.points >= 40 || (state.rollsLeft === 1 && bestScore.points >= 30)) {
    return bestScore;
  }

  const desired = desiredHolds(state);
  const toggle = moves.find((move) =>
    move.type === 'toggleHold' && state.held[move.index] !== desired[move.index]);
  return toggle || roll;
}

function bobMove(state, moves) {
  const scoreMoves = moves.filter((move) => move.type === 'score');
  const roll = moves.find((move) => move.type === 'roll');
  if (!scoreMoves.length) return roll || moves[0];

  // Bob occasionally pencils a box early, and breaks ties with the engine RNG.
  if (!roll || ((state.rng >>> 3) % 7 === 0 && state.rollsLeft < 3)) {
    const previews = previewScores(state);
    const ranked = scoreMoves.slice().sort((a, b) => previews[b.category] - previews[a.category]);
    return ranked[Math.min(ranked.length - 1, (state.rng >>> 7) % Math.min(4, ranked.length))];
  }

  const toggleMoves = moves.filter((move) => move.type === 'toggleHold');
  if (toggleMoves.length && (state.rng & 3) === 1) {
    const whim = toggleMoves[(state.rng >>> 5) % toggleMoves.length];
    if (!state.held[whim.index]) return whim;
  }
  return roll;
}

function bestScoringMove(state, moves) {
  const previews = previewScores(state);
  const weights = Object.fromEntries(CATEGORIES.map((category, index) => [category.id, index]));
  return moves.slice().sort((a, b) =>
    (previews[b.category] - previews[a.category]) ||
    (weights[b.category] - weights[a.category]))[0];
}

function desiredHolds(state) {
  const counts = new Array(7).fill(0);
  state.dice.forEach((die) => counts[die]++);
  let face = 1;
  for (let value = 2; value <= 6; value++) {
    if (counts[value] > counts[face] || (counts[value] === counts[face] && value > face)) face = value;
  }

  // A strong run is worth preserving; otherwise chase the largest set.
  const unique = new Set(state.dice);
  const straightFaces = [
    [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6],
  ].sort((a, b) => b.filter((value) => unique.has(value)).length - a.filter((value) => unique.has(value)).length)[0];
  const straightCount = straightFaces.filter((value) => unique.has(value)).length;
  const keepStraight = straightCount >= 4 && counts[face] < 3;
  const seen = new Set();
  return state.dice.map((die) => {
    if (!keepStraight) return die === face;
    if (!straightFaces.includes(die) || seen.has(die)) return false;
    seen.add(die);
    return true;
  });
}
