# Pirate Islands: The Parley flag

A v0.4 prototype: one island where you secretly Grab or Share.

- **Spec:** the vault ticket "PI4 08 Parley Flag" (`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/`). Its rules are a
  approved by Alex on 2026-11-23, with three answers recorded there (a last-Parley badge, fewest pieces first, auto Share
  off Parley); never invent a rule the ticket doesn't give.
- **Engine:** `pick(state, seat, island, stance)` takes `'grab'` or `'share'`. `resolve` settles a Parley island by stance
  (kinds `raid`, `share`, `grab`, `crash` with `grabbers`); a share opens `state.share` (bots take at once), `share(state,
  seat, colour)` takes 1 in turn, and `shared(state)` runs the winner check and the jettisons. `state.lastStance` is
  each player's public badge. Bots: `botStance`, `botShare`, tuned by `BOTS.parley*`.
- **Base:** a copy of the root v0.3 hotseat at commit `96a6706`, playing Jettison only. Fixes to the root game are not
  carried here, and the other way round.
- **Numbers:** this prototype's live in the `PROTO` block under `RULES` in `rules.js`.
- **Check:** `node check.js` (from this folder or the repo root as `node prototypes/parley/check.js`).
- **Play:** open `index.html`, or see `../README.md` for phones.
