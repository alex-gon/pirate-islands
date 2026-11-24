# Pirate Islands: Captain cards

A v0.4 prototype: three one-time cards each: Anchor, Cannon, Compass.

- **Spec:** the vault ticket "PI4 02 Captain Cards" (`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/`). Its rules and How to play
  words were approved by Alex on 2026-11-23; never invent a rule the ticket doesn't give.
- **Built** (PI4 02): `rules.js` keeps each player's cards (`players[q].cards`, uses left) and the round's cards (`plays`);
  `pick(state, seat, island, card)` takes one; a Compass opens the Compass step (`course`, `compass()`, `allCoursed()`)
  before `resolve` blasts and resolves; Anchor crashers draw after the refill and can win at once. Bots: `botPlay`,
  `botCourse`, tuned by `cannonAt`, `anchorAt`, `compassAt` in `BOTS`.
- **Base:** a copy of the root v0.3 hotseat at commit `96a6706`, playing Jettison only. Fixes to the root game are not
  carried here, and the other way round.
- **Numbers:** this prototype's live in the `PROTO` block under `RULES` in `rules.js`.
- **Check:** `node check.js` (from this folder or the repo root as `node prototypes/captains/check.js`).
- **Play:** open `index.html`, or see `../README.md` for phones.
