# Pirate Islands: Island personalities

A v0.4 prototype: every island has its own rule, dealt at random from 8 tiles (Calm Lagoon, Volcano, Shipwreck Reef,
Treasure Cove, Smugglers' Den, Skull Rock, Sandbar, Turtle Island).

- **Spec:** the vault ticket "PI4 03 Island Personalities" (`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/`),
  approved by Alex on 2026-11-23, with two cases settled then: an empty bag gives the Treasure Cove no bonus, and the
  Lagoon share order is fixed by hauls before the share. Never invent a rule the ticket doesn't give.
- **Base:** a copy of the root v0.3 hotseat at commit `96a6706`, playing Jettison only. Fixes to the root game are not
  carried here, and the other way round.
- **Numbers:** the tile deck lives in the `PROTO` block under `RULES` in `rules.js`, one row per tile. `PROTO.fixed`
  (e.g. `['volcano', 'lagoon', 'sandbar']`) forces a deal while testing.
- **New in `rules.js`:** `state.tiles` (each island's tile), `state.deep` (tokens destroyed by the Volcano),
  `state.seen` (a Den's jettisoned, seen tokens; the rest show only as a count) and `state.share` (a Lagoon share in
  progress: `share(state, seat, colour)` takes 1, `sharing(state)` is whose turn). `owes(state, seat)` is how many
  treasures a crasher jettisons; `jettison` takes an array of colours when 2 are owed. Bots read the tiles, never a
  Den's hidden colours.
- **Check:** `node check.js` (from this folder or the repo root as `node prototypes/islands/check.js`), about 90 s: 1,000
  games across random deals, plus a line per tile (how often it's raided, crashed or shared).
- **Play:** open `index.html`, or see `../README.md` for phones.
