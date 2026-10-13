# Pirate Islands — hotseat prototype

A throwaway digital prototype of the Pirate Islands board game, for playtesting, at rules v0.2:
coloured treasure from a bag, first to 5 of one colour. 3–5 seats share one screen, secretly pick
islands one at a time, then watch the reveal. Any seat can be a **bot**
(Greedy, Sneaky or Wild), so one person can play alone; the pass-the-device screen only appears
when 2+ humans are seated.

- **Two files.** `rules.js` is the game: rules and bots, a classic script that sets
  `globalThis.Rules`, shared by this page, the online room (`import "../../rules.js"`) and Node
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
- **`online/`: the one folder with dependencies.** Rooms for playing in browser tabs on this
  Mac: a Cloudflare Worker with one Durable Object per room, `online/src/room.js`, that holds the
  real game on `rules.js` and sends each connection only `viewFor` its own seat. `online/package.json`
  holds only `wrangler`; nothing else is added without a reason. Run it with
  `cd online && npm install && npm run dev`. It runs offline with no Cloudflare account; nothing is
  deployed. `online/public/` is the page, with `rules.js` as a symlink to the root file.
  `"dev": { "ip": "0.0.0.0" }` in `wrangler.jsonc` puts it on the Mac's Wi-Fi address too, which
  wrangler prints, so phones on the same network can play.
- **The page's screens.** `/` is the setup screen: one name, Create a room, Join by code, and
  **Pass and play**, a link to `/hotseat`. That is `online/public/hotseat.html`, a symlink to the
  root `index.html`, which stays untouched. `/?room=CODE` skips setup; the host gets the code large,
  a dropdown per seat, − / + and Start, guests a waiting lobby, and only the host gets New game.
  The name lives in `sessionStorage` (a refresh rejoins); `localStorage` only prefills the field.
- **Rooms by code.** `POST /create` with `{ name }` makes a 5-character room code, saves the room
  with 3 open seats and that name on seat 0, and returns `{ code }`. The link is
  `http://localhost:8787/?room=CODE`; the room is `ws://localhost:8787/room/CODE`, and a code no
  create made is refused and closed. The **host** is whoever holds seat 0 (a vacant seat 0 goes only
  to a name match); only the host sends `seats` (3–5 entries, each open or a bot), `start` and
  `new`, which returns to the lobby. There is no `SEATS` line any more: the seats live in each
  room's storage. Each room saves itself in `online/.wrangler/state`, which survives restarts:
  delete that folder to reset every room. Resolving when every seat has picked and the `next`
  message are build scaffolding that the pick timer replaces.

## Where the planning lives

Not here. Design and rules are in the Obsidian vault at `~/code/vault`:

- Rules (source of truth): `Games/Pirate Islands/Pirate Islands - Rules.md`
- Game note and playtest log: `Games/Pirate Islands/Pirate Islands.md`
- Wayfinder maps and tickets: `Projects/Pirate Islands Digital/PI Map.md` (v0.1), `Projects/Pirate Islands v0.2/PI2 Map.md` (v0.2),
  `Projects/Pirate Islands Online Rules Module/PIO Map.md` (the rules in `rules.js`),
  `Projects/Pirate Islands Online One Room/PIO2 Map.md` (the room in `online/`)

Never invent a rule. If the build needs one the rules don't give, ask Alex and record it in the
vault rules.
