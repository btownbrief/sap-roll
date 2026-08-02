# SAP ROLL build report

## Delivered

- Complete 2–4 player public-information dice game with deterministic seeded
  rolls, holds, three-roll turns, 12 maple categories, upper bonus, full-game
  totals, ties, and rematches.
- Pass-and-play with no unnecessary handoff screen; Sugarmaker Sue and Backyard
  Bob bot modes; 2–4 phone online rooms with lobby, rejoin, conflict recovery,
  synchronized holds, departure handling, and rematch.
- Phone-first sugaring-season UI, animated wooden dice, clear pinned holds,
  live score previews, all scorecards visible, scoring guide, manifest, social
  metadata, SVG icon, and generated 180×180 PNG icon.
- Fleet documentation and offline engine/room test suites.

## Calls made

- Sugar Shack scores an exact pair plus three alike for 25 points.
- Sugar Trail accepts any four-number run for 30; The Sap Line accepts either
  five-number run for 40.
- Hardwood Haul scores the total of all dice when at least four match.
- The upper bonus is 35 points at an upper subtotal of 63.
- Tied high totals produce shared winners.

## Visual verification note

The local browser playtest could not run in this workspace: local socket
binding is blocked, and the browser security policy blocks `file:` navigation.
No workaround was attempted. The phone layout was instead audited directly at
its 390px constraints: five equal dice columns, a 130px category column plus up
to four equal player columns, touch-sized primary controls, reduced-width rules
at 365px, sticky game header, and horizontally contained score table.

## Full verification output

```text
wrote icon-180.png (180×180)
icon-180.png: PNG image data, 180 x 180, 8-bit/color RGBA, non-interlaced
/Users/stephendavis/btownbrief/sap-roll/icon-180.png
  pixelWidth: 180
  pixelHeight: 180
SAP ROLL ENGINE
  ok — creates a 4-player game with host first
  ok — fresh turn waits for its first roll
  ok — only rolling is legal before dice exist
  ok — rejects too few players
  ok — rejects too many players
  ok — applyMove is immutable
  ok — roll produces five valid dice and spends one roll
  ok — held die stays pinned through a reroll
  ok — cannot hold before rolling
  ok — cannot score before rolling
  ok — upper boxes add only their matching face
  ok — Sap Run adds any five dice
  ok — Hardwood Haul requires at least four alike and scores the total
  ok — Sugar Shack is exactly a pair plus three alike
  ok — Sugar Trail recognizes a four-number run
  ok — The Sap Line recognizes either five-number run
  ok — FULL BOIL scores only five alike
  ok — 63 upper points earns the 35-point sweet bonus
  ok — 62 upper points does not earn the bonus
  ok — 2-player score rotates to seat 1
  ok — 2-player score rotates to seat 0
  ok — 3-player score rotates to seat 1
  ok — 3-player score rotates to seat 2
  ok — 3-player score rotates to seat 0
  ok — 4-player score rotates to seat 1
  ok — 4-player score rotates to seat 2
  ok — 4-player score rotates to seat 3
  ok — 4-player score rotates to seat 0
  ok — last score ends the game and detects the winner
  ok — finished game has no legal moves
  ok — finished game rejects more rolls
  ok — equal high totals produce shared winners
  ok — same seed and moves produce byte-identical state
  ok — JSON stringify/parse resumes with identical results
  ok — 240 random legal games finish cleanly across 2–4 players
  ok — both bot personalities choose only legal moves
  ok — 50 bot decisions finish well under 300ms (1.4ms)

ALL ENGINE TESTS PASSED (37 checks; 240-game soak)
SAP ROLL ROOMS
  ok — host creates room in engine seat 0
  ok — host session is saved
  ok — bad code is rejected (got not_found)
  ok — code for the wrong game is rejected (got wrong_game)
  ok — last seat joins and starts the room
  ok — guest sees host name
  ok — host poll sees the filled crew
  ok — host pushes a deterministic roll
  ok — guest receives dice, holds, and the full public scorecard
  ok — held die is synchronized to the other phone
  ok — stale push is rejected (got version_conflict)
  ok — version conflict refetches the server truth
  ok — room failures carry stable codes
  ok — two phones stay JSON-identical after every action
  ok — two-phone game reaches game over in 102 more actions
  ok — room status follows engine game over
  ok — either phone can start a fresh rematch
  ok — resume restores the same engine seat
  ok — leaving clears the local session
  ok — remaining phone sees a departed player
  ok — extra phone cannot enter a started room (got room_started)
  ok — three-phone room waits after seat 1 joins
  ok — three-phone room starts when seat 2 fills
  ok — all three phones stay JSON-identical after every action
  ok — three-phone game reaches game over in 156 actions
  ok — three-phone state preserves scorecards and seat mapping
  ok — fourth phone cannot enter a started three-seat room (got room_started)
  ok — missing backend reports not_ready (got not_ready)

ALL ROOMS TESTS PASSED (28 checks)
```

`node --check` also completed with no output for every `.js` and `.mjs` file
under `js/` and `scripts/`.
