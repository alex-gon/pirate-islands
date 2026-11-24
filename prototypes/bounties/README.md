# Pirate Islands: Bounty cards

A v0.4 prototype: public goals: claim 2 bounties or 5 of a colour to win.

- **Spec:** the vault ticket "PI4 04 Bounty Cards" (`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/`). Its rules are a
  proposal until Alex approves them; never invent a rule the ticket doesn't give.
- **Base:** a copy of the root v0.3 hotseat at commit `96a6706`, playing Jettison only. Fixes to the root game are not
  carried here, and the other way round.
- **Numbers:** this prototype's live in the `PROTO` block under `RULES` in `rules.js`.
- **Check:** `node check.js` (from this folder or the repo root as `node prototypes/bounties/check.js`).
- **Play:** open `index.html`, or see `../README.md` for phones.
- **Bounties (PI4 04, approved by Alex 2026-11-23).** `state.deck` (hidden, never in `viewFor`) and `state.showing` hold
  indices into `PROTO.bounties`; `players[q].bounties` the claimed ones. `dist(haul, needs)` measures every `needs` form
  (`meets` is `dist === 0`). `claim` runs in `resolve` before the win test: a tie goes to fewer bounties held **before this
  check** (Alex's ruling), then the smaller haul, then random; each round's `claims` and `turned` cards go on its history
  entry. `leaders` sorts by bounties first. Bots add `BOTS.bounty` per token toward the bounty a pile helps most.
