# SAP ROLL 🍁🎲

A sugaring-season dice game for the Btown Games arcade. Roll five wooden dice,
pin the keepers, and fill a 12-box maple scorecard. Play on one phone, challenge
Sugarmaker Sue or Backyard Bob, or gather a 2–4 phone crew online.

**Live home:** https://play.btownbrief.com/sap-roll/

## House rules

- On your turn, roll the five dice and optionally hold any of them.
- Roll unheld dice up to two more times, then fill one open score box.
- The upper six boxes score matching dice. Reach 63 there for a 35-point bonus.
- The lower boxes cover any total, four alike, full house, two straights, and
  five alike. Every maple name has its plain scoring rule directly below it.
- After every player fills all 12 boxes, the highest grand total wins. Ties are
  shared.

## How it works

This is a plain static site with no package manager or build step.

| File | Responsibility |
| --- | --- |
| `js/engine.js` | All rules and seeded dice randomness as pure functions over one JSON-safe state object |
| `js/bot.js` | Sue's sensible set-chasing and Bob's chaotic-but-beatable choices |
| `js/main.js` | Screens, scorecard, dice animation, local modes, and online-room wiring |
| `js/rooms.js` | Untouched fleet room client |
| `scripts/rooms-shim.mjs` | Untouched offline room-service stand-in |

Online and pass-and-play use the same public table: every player can always see
the current dice, held dice, and every scorecard.

## Testing

```bash
node scripts/test-engine.mjs
node scripts/test-rooms.mjs
node --check js/engine.js
node --check js/bot.js
node --check js/main.js
```
