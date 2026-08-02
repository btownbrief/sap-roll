// Online rooms wiring test: real vendored client + local shim, no network.
// Plays complete 2- and 3-phone SAP ROLL games through the real engine.

import { createRooms } from './rooms-shim.mjs';
import { createInitialState, legalMoves, applyMove, getStatus } from '../js/engine.js';

const GAME = 'sap-roll';
const stores = new Map();
let current = 'A';
globalThis.localStorage = {
  getItem: (key) => stores.get(current)?.get(key) ?? null,
  setItem: (key, value) => stores.get(current).set(key, String(value)),
  removeItem: (key) => stores.get(current).delete(key),
};
function device(id) {
  if (!stores.has(id)) stores.set(id, new Map());
  current = id;
}
for (const id of ['A', 'B', 'C', 'D']) device(id);
device('A');

let passed = 0;
function t(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ok — ${label}`);
}
async function expectCode(promise, code, label) {
  try {
    await promise;
    t(false, `${label} (no error thrown)`);
  } catch (error) {
    t(error?.code === code, `${label} (got ${error?.code})`);
  }
}

let choiceRng = 0x8badf00d;
function randomChoice(items) {
  choiceRng = (Math.imul(choiceRng, 1664525) + 1013904223) >>> 0;
  return items[choiceRng % items.length];
}

async function syncPhones(phones) {
  for (const phone of phones) {
    device(phone.device);
    await phone.match._fetch();
  }
  const truth = JSON.stringify(phones[0].match.state);
  return phones.every((phone) => JSON.stringify(phone.match.state) === truth);
}

async function playSyncedGame(phones, cap = 400) {
  let actions = 0;
  let synced = await syncPhones(phones);
  while (!getStatus(phones[0].match.state).over && actions < cap && synced) {
    const truth = phones[0].match.state;
    const mover = phones.find((phone) => phone.match.seat === truth.currentPlayer);
    if (!mover) throw new Error(`No phone for engine player ${truth.currentPlayer}`);
    device(mover.device);
    await mover.match._fetch();
    const moves = legalMoves(mover.match.state);
    const rolls = moves.filter((move) => move.type === 'roll');
    const scores = moves.filter((move) => move.type === 'score');
    const toggles = moves.filter((move) =>
      move.type === 'toggleHold' && !mover.match.state.held[move.index]);
    let move;
    if (rolls.length) {
      const shouldHold = mover.match.state.rollsLeft === 2 && toggles.length && (choiceRng & 3) === 0;
      move = shouldHold ? randomChoice(toggles) : rolls[0];
    } else {
      move = randomChoice(scores);
    }
    const next = applyMove(mover.match.state, move);
    await mover.match.push(next, { over: getStatus(next).over });
    actions++;
    synced = await syncPhones(phones);
  }
  return { actions, synced, finished: getStatus(phones[0].match.state).over };
}

const shim = createRooms();
let backendReady = true;
globalThis.BTOWN_ROOMS_URL = 'http://rooms.test';
globalThis.fetch = async (url, options = {}) => {
  if (!backendReady) return new Response('{}', { status: 404 });
  const method = options.method || 'GET';
  const match = String(url).match(/\/rest\/v1\/rpc\/(\w+)$/);
  if (method !== 'POST' || !match || !shim.rpcs[match[1]]) {
    return new Response(JSON.stringify({ message: 'not a room rpc' }), { status: 404 });
  }
  try {
    const body = shim.rpcs[match[1]](JSON.parse(options.body || '{}')) ?? {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: error.rpc ? 400 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

const { OnlineMatch, savedSession, RoomsError } = await import('../js/rooms.js');

console.log('SAP ROLL ROOMS');

device('A');
const host = await OnlineMatch.create({
  game: GAME,
  name: 'Maple A',
  state: createInitialState({ numPlayers: 2, seed: 101 }),
  seats: 2,
});
t(/^[A-Z2-9]{4}$/.test(host.code) && host.seat === 0 && host.status === 'waiting',
  'host creates room in engine seat 0');
t(savedSession(GAME)?.roomId === host.roomId, 'host session is saved');

device('B');
await expectCode(OnlineMatch.join({ game: GAME, code: 'ZZZZ', name: 'X' }),
  'not_found', 'bad code is rejected');
await expectCode(OnlineMatch.join({ game: 'four-in-a-rowboat', code: host.code, name: 'X' }),
  'wrong_game', 'code for the wrong game is rejected');
const guest = await OnlineMatch.join({ game: GAME, code: ` ${host.code.toLowerCase()} `, name: 'Maple B' });
t(guest.seat === 1 && guest.status === 'playing', 'last seat joins and starts the room');
t(guest.opponents()[0].name === 'Maple A', 'guest sees host name');

device('A');
await host._fetch();
t(host.status === 'playing' && host.opponents()[0].name === 'Maple B',
  'host poll sees the filled crew');

let stateA = applyMove(host.state, { type: 'roll' });
await host.push(stateA);
t(host.version === 1, 'host pushes a deterministic roll');

device('B');
await guest._fetch();
t(JSON.stringify(guest.state) === JSON.stringify(stateA),
  'guest receives dice, holds, and the full public scorecard');

device('A');
stateA = applyMove(host.state, { type: 'toggleHold', index: 0 });
await host.push(stateA);
device('B');
await guest._fetch();
t(guest.state.held[0] === true, 'held die is synchronized to the other phone');

const stale = applyMove(guest.state, { type: 'roll' });
device('A');
stateA = applyMove(host.state, { type: 'roll' });
await host.push(stateA);
device('B');
await expectCode(guest.push(stale), 'version_conflict', 'stale push is rejected');
t(guest.version === host.version && JSON.stringify(guest.state) === JSON.stringify(host.state),
  'version conflict refetches the server truth');
t(new RoomsError('offline').code === 'offline', 'room failures carry stable codes');

const twoPhone = await playSyncedGame([
  { device: 'A', match: host },
  { device: 'B', match: guest },
]);
t(twoPhone.synced, 'two phones stay JSON-identical after every action');
t(twoPhone.finished && twoPhone.actions < 400,
  `two-phone game reaches game over in ${twoPhone.actions} more actions`);
t(host.status === 'over', 'room status follows engine game over');

device('B');
const rematchVersion = guest.version;
await guest.push(createInitialState({ numPlayers: 2, seed: 202 }));
t(guest.status === 'playing' && guest.version === rematchVersion + 1,
  'either phone can start a fresh rematch');

device('A');
const resumed = await OnlineMatch.resume({ game: GAME });
t(resumed.roomId === host.roomId && resumed.seat === 0 && resumed.status === 'playing',
  'resume restores the same engine seat');
await resumed.leave();
t(savedSession(GAME) === null, 'leaving clears the local session');

device('B');
await guest._fetch();
t(guest.status === 'over' && guest.opponents()[0].left,
  'remaining phone sees a departed player');

device('A');
const fullHost = await OnlineMatch.create({
  game: GAME,
  name: 'A',
  state: createInitialState({ numPlayers: 2, seed: 303 }),
  seats: 2,
});
device('B');
await OnlineMatch.join({ game: GAME, code: fullHost.code, name: 'B' });
device('C');
await expectCode(OnlineMatch.join({ game: GAME, code: fullHost.code, name: 'C' }),
  'room_started', 'extra phone cannot enter a started room');

device('A');
const host3 = await OnlineMatch.create({
  game: GAME,
  name: 'North',
  state: createInitialState({ numPlayers: 3, seed: 404 }),
  seats: 3,
});
device('B');
const guest3b = await OnlineMatch.join({ game: GAME, code: host3.code, name: 'Center' });
t(guest3b.seat === 1 && guest3b.status === 'waiting',
  'three-phone room waits after seat 1 joins');
device('C');
const guest3c = await OnlineMatch.join({ game: GAME, code: host3.code, name: 'South' });
t(guest3c.seat === 2 && guest3c.status === 'playing',
  'three-phone room starts when seat 2 fills');

const threePhone = await playSyncedGame([
  { device: 'A', match: host3 },
  { device: 'B', match: guest3b },
  { device: 'C', match: guest3c },
]);
t(threePhone.synced, 'all three phones stay JSON-identical after every action');
t(threePhone.finished && threePhone.actions < 400,
  `three-phone game reaches game over in ${threePhone.actions} actions`);
t(host3.state.numPlayers === 3 && host3.state.scores.length === 3,
  'three-phone state preserves scorecards and seat mapping');

device('D');
await expectCode(OnlineMatch.join({ game: GAME, code: host3.code, name: 'Too Late' }),
  'room_started', 'fourth phone cannot enter a started three-seat room');

backendReady = false;
const freshRooms = await import('../js/rooms.js?not-ready');
device('D');
await expectCode(
  freshRooms.OnlineMatch.create({ game: GAME, name: 'A', state: {} }),
  'not_ready',
  'missing backend reports not_ready',
);

console.log(`\nALL ROOMS TESTS PASSED (${passed} checks)`);
process.exit(0);
