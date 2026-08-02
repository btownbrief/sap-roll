# SAP ROLL — agent instructions

Shared brain for any AI agent working in this repo. Read `README.md` first for
the architecture. Stephen is non-technical — explain consequential changes in
plain language.

## What this is

Sugaring-season Yacht dice for 2–4 players: five wooden dice, up to three rolls
per turn, holds, and a 12-category maple scorecard. Plain static site, **no
build step**: `index.html` + `style.css` + ES modules in `js/`. Deployed by
GitHub Pages via `.github/workflows/deploy.yml` on push. No backend beyond the
shared rooms service, no accounts, no analytics.

Use only public-domain dice-game rules and the SAP ROLL vocabulary already in
the product. Do not introduce third-party game trademarks in code or copy.

## The one non-negotiable

Every game rule lives in `js/engine.js` as pure functions over one plain
JSON-serializable state object. `engine.js` imports nothing and never touches
the DOM, timers, `Date`, or `Math.random`. Its seeded RNG lives in state and
`applyMove` returns a **new** state. `js/bot.js` may only use the engine's public
API; `js/main.js` is UI only.

All information in SAP ROLL is public. Pass-and-play never needs a handoff
blocker, and online every phone shows the roller's dice, holds, and all cards.

## Online play (the rooms layer)

`js/rooms.js` and `scripts/rooms-shim.mjs` are vendored, game-agnostic files;
their canonical copies live in `four-in-a-rowboat`. Never edit them here. A room
stores the entire engine state as opaque JSON plus a version. Seat index equals
engine player index: the host is player 0, then guests fill seats 1–3.

Keep the mandated room element IDs and behavior documented in the canonical
`ROOMS-INTEGRATION.md`: crew-size picker, lobby, polling, conflict repaint,
rejoin, two-tap leave, and rematch. Until the shared backend is installed, show
the clean `not_ready` message.

## Before you finish

Run and report:

```text
node scripts/test-engine.mjs
node scripts/test-rooms.mjs
node --check js/engine.js
node --check js/bot.js
node --check js/main.js
```

Engine tests must include all scoring edges, 2–4 player rotation, end/winner
detection, seed determinism, serialization, and at least 200 complete random
games. If the UI changed, inspect it at phone width or say honestly what could
not be inspected.
