// SAP ROLL — UI only. Rules live in engine.js; bot choices live in bot.js.

import {
  CATEGORIES, ROLLS_PER_TURN, UPPER_BONUS_TARGET, UPPER_BONUS_POINTS,
  createInitialState, legalMoves, applyMove, getStatus, previewScores, cardTotals,
} from './engine.js';
import { BOTS, chooseMove } from './bot.js';
import { OnlineMatch, savedSession, clearSession, getName } from './rooms.js';

const GAME = 'sap-roll';
const BOT_PLAYER = 1;
const DICE_GLYPHS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const $ = (id) => document.getElementById(id);

const menuEl = $('menu');
const gameEl = $('game');
const onlinePanel = $('onlinePanel');
const lobbyEl = $('lobby');
const opName = $('opName');
const opCode = $('opCode');
const opError = $('opError');
const rejoinBtn = $('rejoinBtn');

let G = null; // { mode: 'pass'|'bot'|'online', bot?, state }
let localSeats = 2;
let selectedSeats = 2;
let panelIntent = 'host';
let online = null; // { match, myPlayer }
let onlinePushing = false;
let botTimer = null;
let leaveTimer = null;
let toastTimer = null;
let lastRenderedKey = '';

const newSeed = () => (Math.random() * 0x100000000) >>> 0;

function showScreen(name) {
  menuEl.classList.toggle('hidden', name !== 'menu');
  gameEl.classList.toggle('hidden', name !== 'game');
}

function playerName(player) {
  if (!G) return `Player ${player + 1}`;
  if (G.mode === 'bot') return player === BOT_PLAYER ? BOTS[G.bot].name : 'You';
  if (G.mode === 'online') {
    if (player === online.myPlayer) return 'You';
    return online.match.seats.find((seat) => seat.seat === player)?.name || `Player ${player + 1}`;
  }
  return `Player ${player + 1}`;
}

function canAct() {
  if (!G || getStatus(G.state).over) return false;
  if (G.mode === 'bot') return G.state.currentPlayer !== BOT_PLAYER;
  if (G.mode === 'online') {
    return !!online && !onlinePushing && online.match.status === 'playing' &&
      G.state.currentPlayer === online.myPlayer;
  }
  return true;
}

function startGame(mode, numPlayers = 2, bot = null) {
  clearTimeout(botTimer);
  online = null;
  onlinePushing = false;
  G = { mode, bot, state: createInitialState({ numPlayers, seed: newSeed() }) };
  showScreen('game');
  $('gameOver').classList.add('hidden');
  $('rematchBtn').classList.remove('hidden');
  render();
  queueBot();
}

function render(fx = {}) {
  if (!G) return;
  const state = G.state;
  const status = getStatus(state);
  const moves = legalMoves(state);
  const actionable = canAct();
  const hasRolled = state.rollsLeft < ROLLS_PER_TURN;
  const canRoll = actionable && moves.some((move) => move.type === 'roll');
  const previews = hasRolled ? previewScores(state) : {};

  gameEl.style.setProperty('--players', state.numPlayers);
  renderPlayers(status);
  $('turnName').textContent = status.over ? 'Boil complete' : playerName(state.currentPlayer);
  $('turnPrompt').textContent = status.over
    ? 'The sugar log is full'
    : actionable
      ? (hasRolled ? 'Hold keepers, roll again, or score' : 'Shake the bucket to start')
      : (G.mode === 'online' ? 'Rolling at another phone' : 'Thinking by the woodpile…');

  $('rollMeter').replaceChildren(...Array.from({ length: ROLLS_PER_TURN }, (_, index) => {
    const dot = document.createElement('span');
    dot.className = `roll-dot${index < state.rollsLeft ? ' live' : ''}`;
    return dot;
  }));

  const diceEl = $('dice');
  diceEl.innerHTML = '';
  state.dice.forEach((value, index) => {
    const die = document.createElement('button');
    die.className = `die${value ? '' : ' empty'}${state.held[index] ? ' held' : ''}${fx.roll ? ' tumbling' : ''}`;
    die.textContent = DICE_GLYPHS[value] || '•';
    die.disabled = !actionable || !hasRolled || state.rollsLeft === 0;
    die.setAttribute('aria-label', value
      ? `${value}, ${state.held[index] ? 'held; tap to release' : 'tap to hold'}`
      : 'Not rolled yet');
    die.setAttribute('aria-pressed', String(state.held[index]));
    die.addEventListener('click', () => performMove({ type: 'toggleHold', index }));
    diceEl.appendChild(die);
  });

  const rollBtn = $('rollBtn');
  rollBtn.disabled = !canRoll;
  rollBtn.textContent = !hasRolled
    ? 'SHAKE THE BUCKET'
    : state.rollsLeft > 0 ? `ROLL AGAIN · ${state.rollsLeft} LEFT` : 'PICK A SCORE BOX';
  $('holdHint').textContent = !hasRolled
    ? 'Tap dice to hold after your first roll.'
    : state.rollsLeft > 0 ? 'Held dice stay pinned for the next shake.' : 'No rolls left — choose a box below.';

  renderScoreTable(previews, actionable && hasRolled);
  lastRenderedKey = JSON.stringify(state);
  if (status.over) showGameOver(status);
}

function renderPlayers(status) {
  const rail = $('playerRail');
  rail.innerHTML = '';
  for (let player = 0; player < G.state.numPlayers; player++) {
    const chip = document.createElement('div');
    chip.className = `player-chip${!status.over && player === G.state.currentPlayer ? ' active' : ''}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = playerName(player);
    const total = document.createElement('span');
    total.className = 'total';
    total.textContent = status.totals[player].total;
    chip.append(name, total);
    rail.appendChild(chip);
  }
}

function renderScoreTable(previews, allowScore) {
  const state = G.state;
  const table = document.createElement('table');
  table.className = 'score-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const categoryHead = document.createElement('th');
  categoryHead.className = 'cat-head';
  categoryHead.textContent = 'MAPLE CATEGORY';
  headRow.appendChild(categoryHead);
  for (let player = 0; player < state.numPlayers; player++) {
    const th = document.createElement('th');
    th.textContent = compactName(playerName(player));
    if (player === state.currentPlayer) th.className = 'active-col';
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const body = document.createElement('tbody');
  CATEGORIES.forEach((category, index) => {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.className = 'cat-cell';
    label.title = category.help;
    const title = document.createElement('b');
    title.textContent = category.name;
    const help = document.createElement('small');
    help.textContent = category.help;
    label.append(title, help);
    row.appendChild(label);

    for (let player = 0; player < state.numPlayers; player++) {
      const cell = document.createElement('td');
      cell.className = `score-cell${player === state.currentPlayer ? ' active-col' : ''}`;
      const value = state.scores[player][category.id];
      if (value !== null) {
        cell.textContent = value;
      } else if (allowScore && player === state.currentPlayer) {
        const button = document.createElement('button');
        const points = previews[category.id];
        button.textContent = `+${points}`;
        button.className = points === 0 ? 'zero' : '';
        button.setAttribute('aria-label', `Score ${points} points in ${category.name}. ${category.help}`);
        button.addEventListener('click', () => performMove({ type: 'score', category: category.id }));
        cell.classList.add('current-open');
        cell.appendChild(button);
      } else {
        cell.textContent = '·';
      }
      row.appendChild(cell);
    }
    body.appendChild(row);
    if (index === 5) addTotalRow(body, 'Upper + bonus', state.scores.map((card) => {
      const total = cardTotals(card);
      return total.upper + total.bonus;
    }), 'subtotal-row');
  });
  addTotalRow(body, `Bonus at ${UPPER_BONUS_TARGET}`, state.scores.map((card) => cardTotals(card).bonus), 'subtotal-row');
  addTotalRow(body, 'TOTAL SAP', state.scores.map((card) => cardTotals(card).total), 'total-row');
  table.appendChild(body);
  $('scoreTableWrap').replaceChildren(table);
}

function addTotalRow(body, labelText, values, className) {
  const row = document.createElement('tr');
  row.className = className;
  const label = document.createElement('th');
  label.scope = 'row';
  label.className = 'cat-cell';
  label.textContent = labelText;
  row.appendChild(label);
  values.forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
  });
  body.appendChild(row);
}

function compactName(name) {
  if (name === 'You') return 'YOU';
  const first = String(name).trim().split(/\s+/)[0] || 'P';
  return first.slice(0, 7).toUpperCase();
}

async function performMove(move) {
  if (!canAct()) return;
  let next;
  try {
    next = applyMove(G.state, move);
  } catch {
    return;
  }
  const priorPlayer = G.state.currentPlayer;
  G.state = next;
  render({ roll: move.type === 'roll' });
  if (move.type === 'roll' && navigator.vibrate) navigator.vibrate([18, 24, 18]);
  if (move.type === 'score') {
    const scored = next.lastAction.points;
    showToast(`${playerName(priorPlayer)} banked ${scored} point${scored === 1 ? '' : 's'}.`);
  }

  if (G.mode === 'online') {
    const match = online.match;
    onlinePushing = true;
    render({ roll: move.type === 'roll' });
    try {
      await match.push(next, { over: getStatus(next).over });
    } catch (error) {
      if (error?.code !== 'version_conflict') showToast('The line went quiet — trying to reconnect.');
      G.state = match.state;
    } finally {
      if (online && online.match === match) {
        onlinePushing = false;
        render();
      }
    }
  } else {
    queueBot();
  }
}

function queueBot() {
  clearTimeout(botTimer);
  if (!G || G.mode !== 'bot' || getStatus(G.state).over || G.state.currentPlayer !== BOT_PLAYER) return;
  botTimer = setTimeout(botStep, G.state.rollsLeft === ROLLS_PER_TURN ? 650 : 420);
}

function botStep() {
  if (!G || G.mode !== 'bot' || G.state.currentPlayer !== BOT_PLAYER || getStatus(G.state).over) return;
  const move = chooseMove(G.state, G.bot);
  if (!move) return;
  const oldPlayer = G.state.currentPlayer;
  G.state = applyMove(G.state, move);
  render({ roll: move.type === 'roll' });
  if (move.type === 'score') showToast(`${playerName(oldPlayer)} penciled in ${G.state.lastAction.points}.`);
  queueBot();
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 1800);
}

function showGameOver(status) {
  $('rematchBtn').classList.remove('hidden');
  const names = status.winners.map(playerName);
  $('resultTitle').textContent = names.length === 1 ? `${names[0]} wins the boil!` : 'A perfectly even pour!';
  $('resultLine').textContent = names.length === 1 ? 'The sweetest score in the shack.' : `${names.join(' & ')} share the top shelf.`;
  const scores = $('finalScores');
  scores.innerHTML = '';
  status.totals.forEach((total, player) => {
    const row = document.createElement('div');
    row.className = 'final-row';
    const name = document.createElement('span');
    name.textContent = playerName(player);
    const points = document.createElement('b');
    points.textContent = total.total;
    row.append(name, points);
    scores.appendChild(row);
  });
  $('gameOver').classList.remove('hidden');
}

/* --------------------------------------------------------------- controls */

document.querySelectorAll('[data-local-seats]').forEach((button) => {
  button.addEventListener('click', () => {
    localSeats = +button.dataset.localSeats;
    document.querySelectorAll('[data-local-seats]').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
  });
});

$('passBtn').addEventListener('click', () => startGame('pass', localSeats));
document.querySelectorAll('[data-bot]').forEach((button) => {
  button.addEventListener('click', () => startGame('bot', 2, button.dataset.bot));
});
$('rollBtn').addEventListener('click', () => performMove({ type: 'roll' }));

function openRules() { $('rulesPanel').classList.remove('hidden'); }
function closeRules() { $('rulesPanel').classList.add('hidden'); }
$('rulesBtn').addEventListener('click', openRules);
$('scoreHelp').addEventListener('click', openRules);
$('rulesClose').addEventListener('click', closeRules);
$('rulesPanel').addEventListener('click', (event) => { if (event.target === $('rulesPanel')) closeRules(); });

const rulesList = $('rulesList');
CATEGORIES.forEach((category) => {
  const row = document.createElement('div');
  row.className = 'rule-item';
  const name = document.createElement('b');
  name.textContent = category.name;
  const help = document.createElement('span');
  help.textContent = category.help;
  row.append(name, help);
  rulesList.appendChild(row);
});

$('homeBtn').addEventListener('click', (event) => goMenu(event.currentTarget));
$('menuBtn').addEventListener('click', (event) => goMenu(event.currentTarget));
$('rematchBtn').addEventListener('click', onlineRematchOrLocal);

function goMenu(button) {
  if (online) {
    if (button.dataset.armed !== '1') {
      button.dataset.armed = '1';
      button.dataset.oldText = button.textContent;
      button.textContent = 'LEAVE?';
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => resetLeave(button), 2500);
      return;
    }
    const match = online.match;
    online = null;
    match.leave();
  }
  clearTimeout(botTimer);
  resetLeave(button);
  G = null;
  $('gameOver').classList.add('hidden');
  showScreen('menu');
  refreshRejoin();
}

function resetLeave(button) {
  clearTimeout(leaveTimer);
  if (!button) return;
  if (button.dataset.oldText) button.textContent = button.dataset.oldText;
  button.dataset.armed = '';
  button.dataset.oldText = '';
}

async function onlineRematchOrLocal() {
  if (!G) return;
  if (G.mode !== 'online') {
    startGame(G.mode, G.state.numPlayers, G.bot);
    return;
  }
  const match = online.match;
  const fresh = createInitialState({ numPlayers: G.state.numPlayers, seed: newSeed() });
  $('rematchBtn').disabled = true;
  try {
    await match.push(fresh);
    if (!online || online.match !== match) return;
    G.state = fresh;
    $('gameOver').classList.add('hidden');
    render();
  } catch (error) {
    G.state = match.state;
    $('gameOver').classList.toggle('hidden', !getStatus(G.state).over);
    render();
  } finally {
    $('rematchBtn').disabled = false;
  }
}

/* ------------------------------------------------------------- online play */
// The whole public scorecard and dice table travel in the deterministic engine
// state. Seat number is engine player number; host/player 0 rolls first.

$('hostBtn').addEventListener('click', () => openOnlinePanel('host'));
$('joinBtn').addEventListener('click', () => openOnlinePanel('join'));
$('opCancel').addEventListener('click', () => onlinePanel.classList.add('hidden'));
$('opGo').addEventListener('click', onlineGo);
$('lobbyCancel').addEventListener('click', cancelLobby);
rejoinBtn.addEventListener('click', rejoinCrew);
opCode.addEventListener('input', () => {
  opCode.value = opCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
[opName, opCode].forEach((input) => input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') onlineGo();
}));

document.querySelectorAll('[data-seats]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedSeats = +button.dataset.seats;
    document.querySelectorAll('[data-seats]').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
  });
});

function openOnlinePanel(intent) {
  panelIntent = intent;
  $('opTitle').textContent = intent === 'host' ? 'START A BOIL' : 'JOIN A BOIL';
  $('opGo').textContent = intent === 'host' ? 'GET A CODE' : 'PULL UP A STOOL';
  $('opSeatsWrap').classList.toggle('hidden', intent !== 'host');
  $('opCodeWrap').classList.toggle('hidden', intent === 'host');
  opError.classList.add('hidden');
  opName.value = opName.value || getName();
  onlinePanel.classList.remove('hidden');
  (intent === 'join' && opName.value ? opCode : opName).focus();
}

const FRIENDLY_ERRORS = {
  not_found: 'No boil with that code — check it once more.',
  room_full: 'That sugar shack is already full.',
  room_started: 'That crew already started rolling.',
  not_ready: "Online play isn't switched on yet — check back soon!",
  offline: "Can't reach the shack — are you online?",
};

function friendly(error) {
  if (error?.code === 'wrong_game') {
    return `That code belongs to ${String(error.detail || 'another game').replace(/-/g, ' ')}.`;
  }
  return FRIENDLY_ERRORS[error?.code] || 'The sap line kinked — please try again.';
}

async function onlineGo() {
  const go = $('opGo');
  if (go.disabled) return;
  const name = opName.value.trim();
  if (!name) {
    opError.textContent = 'Every sugarmaker needs a name.';
    opError.classList.remove('hidden');
    opName.focus();
    return;
  }
  if (panelIntent === 'join' && opCode.value.trim().length !== 4) {
    opError.textContent = 'The boil code has 4 characters.';
    opError.classList.remove('hidden');
    opCode.focus();
    return;
  }
  go.disabled = true;
  opError.classList.add('hidden');
  try {
    const match = panelIntent === 'host'
      ? await OnlineMatch.create({
        game: GAME,
        name,
        seats: selectedSeats,
        state: createInitialState({ numPlayers: selectedSeats, seed: newSeed() }),
      })
      : await OnlineMatch.join({ game: GAME, code: opCode.value.trim(), name });
    onlinePanel.classList.add('hidden');
    if (match.status === 'waiting') openLobby(match);
    else enterOnlineGame(match);
  } catch (error) {
    opError.textContent = friendly(error);
    opError.classList.remove('hidden');
  } finally {
    go.disabled = false;
  }
}

function renderLobby(match) {
  $('lobbyCode').textContent = match.code;
  const list = $('lobbyNames');
  list.innerHTML = '';
  const total = match.state?.numPlayers || selectedSeats;
  for (let seat = 0; seat < total; seat++) {
    const joined = match.seats.find((candidate) => candidate.seat === seat);
    const item = document.createElement('li');
    item.textContent = joined ? `${joined.name} · Stool ${seat + 1}` : `Waiting at stool ${seat + 1}…`;
    list.appendChild(item);
  }
}

function openLobby(match) {
  if (lobbyEl._match && lobbyEl._match !== match) lobbyEl._match.stop();
  renderLobby(match);
  lobbyEl.classList.remove('hidden');
  lobbyEl._match = match;
  match.start({
    onStatus: (status) => {
      if (status === 'playing') {
        lobbyEl.classList.add('hidden');
        enterOnlineGame(match);
      } else if (status === 'over') {
        $('lobbyHint').textContent = 'A crew member stepped away. Start a fresh boil.';
      }
    },
    onPresence: () => renderLobby(match),
    onError: () => {},
  });
}

function cancelLobby() {
  const match = lobbyEl._match;
  if (match) match.leave();
  lobbyEl._match = null;
  lobbyEl.classList.add('hidden');
  refreshRejoin();
}

async function rejoinCrew() {
  rejoinBtn.disabled = true;
  try {
    const match = await OnlineMatch.resume({ game: GAME });
    if (match.status === 'waiting') openLobby(match);
    else enterOnlineGame(match);
  } catch (error) {
    if (['not_found', 'not_seated', 'room_started'].includes(error?.code)) {
      clearSession(GAME);
      refreshRejoin();
    }
  } finally {
    rejoinBtn.disabled = false;
  }
}

function enterOnlineGame(match) {
  clearTimeout(botTimer);
  online = { match, myPlayer: match.seat };
  onlinePushing = false;
  G = { mode: 'online', bot: null, state: match.state };
  lobbyEl.classList.add('hidden');
  onlinePanel.classList.add('hidden');
  $('gameOver').classList.add('hidden');
  $('rematchBtn').classList.remove('hidden');
  showScreen('game');
  render();
  match.start({
    onState: (state) => {
      if (!online || online.match !== match) return;
      const prior = lastRenderedKey;
      G.state = state;
      onlinePushing = false;
      const rollFx = state.lastAction?.type === 'roll' && JSON.stringify(state) !== prior;
      $('gameOver').classList.toggle('hidden', !getStatus(state).over);
      render({ roll: rollFx });
    },
    onStatus: (status) => {
      if (!online || status !== 'over' || getStatus(G.state).over) return;
      const departed = match.opponents().find((opponent) => opponent.left);
      if (departed) showDeparture(departed.name);
    },
    onPresence: (opponents) => {
      const departed = opponents.find((opponent) => opponent.left);
      if (departed && !getStatus(G.state).over) showDeparture(departed.name);
    },
    onError: (error) => {
      if (error?.code === 'not_found') {
        clearSession(GAME);
        online = null;
        G = null;
        showScreen('menu');
        refreshRejoin();
      }
    },
  });
}

function showDeparture(name) {
  $('resultTitle').textContent = 'The crew broke up';
  $('resultLine').textContent = `${name || 'A sugarmaker'} stepped away, so this boil is over.`;
  $('finalScores').innerHTML = '';
  $('rematchBtn').classList.add('hidden');
  $('gameOver').classList.remove('hidden');
}

function refreshRejoin() {
  const saved = savedSession(GAME);
  rejoinBtn.classList.toggle('hidden', !saved);
  if (saved) rejoinBtn.textContent = `↩ REJOIN YOUR BOIL (${saved.code})`;
}

refreshRejoin();
