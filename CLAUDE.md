# Pirate Islands — hotseat prototype

A throwaway digital prototype of the Pirate Islands board game, for playtesting, at rules v0.2:
coloured treasure from a bag, first to 5 of one colour. 3–5 seats share one screen, secretly pick
islands one at a time, then watch the reveal. Any seat can be a **bot**
(Greedy, Sneaky or Wild), so one person can play alone; the pass-the-device screen only appears
when 2+ humans are seated.

- **Two files.** `rules.js` is the game: rules and bots, a classic script that sets
  `globalThis.Rules`, shared by this page, the future server (`import "./rules.js"`) and Node
  (`require("./rules.js")`). Every function takes the game state, a JSON-safe object, and nothing
  in it reads a global. `index.html` is the hotseat: screens, turn order, pass screens; it loads
  `rules.js` with a plain `<script src>` and still opens with a double-click. Plain JS, no build, no
  dependencies. Words (seat, pick, skipped, view) are in `CONTEXT.md`.
- **Rule numbers live in the `RULES` block** at the top of `rules.js`. A variant is a one-line edit.
- **Bot tuning lives in the `BOTS` block** beside it. Bots read only public info (island piles, hauls,
  last round's picks), never this round's locks or the bag, and never change the rules.
- **Keep it tiny and readable.** Fewer lines over cleverness. No framework, no tests, no tooling
  unless a playtest proves it's needed.
- **One exception: the bot check.** `node check.js` (no dependencies, about 20 s) plays 1,000
  bot-only games on `rules.js` and fails if a game throws, runs past 100 rounds, or `viewFor` shows
  a seat the bag, another seat's pick this round, or the history before the end. Some games skip
  seats; the last 100 use a small bag so it runs out. Run it after any change to `rules.js`.

## Where the planning lives

Not here. Design and rules are in the Obsidian vault at `~/code/vault`:

- Rules (source of truth): `Games/Pirate Islands/Pirate Islands - Rules.md`
- Game note and playtest log: `Games/Pirate Islands/Pirate Islands.md`
- Wayfinder maps and tickets: `Projects/Pirate Islands Digital/PI Map.md` (v0.1), `Projects/Pirate Islands v0.2/PI2 Map.md` (v0.2),
  `Projects/Pirate Islands Online Rules Module/PIO Map.md` (the rules in `rules.js`)

Never invent a rule. If the build needs one the rules don't give, ask Alex and record it in the
vault rules.
