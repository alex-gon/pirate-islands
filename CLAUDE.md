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
  The name and the seat token live in `sessionStorage` (a refresh rejoins); `localStorage` only
  prefills the name field. While visible, the page sends `ping` every 5 s.
- **The page's game screens.** A bar fixed to the top edge shrinks smoothly from the message's
  `timer.msLeft`, the seconds large under it: blue with the number alone for the pick timer, grey
  `Next round in 12` for the countdown; none in the lobby or at game over. A skipped seat reads
  `→ skipped (too slow)` (`skipped` in the game-over table), and the seat itself gets a red line. A
  stand-in seat's card is dashed with `left · 🤖 playing`, and its picks carry 🤖 in the reveal and
  the table (the room stamps each round's `standIns` on its history entry). A seat back mid-round
  is told the bot picked for it. Guests get "Sam gone? Take over as host", which sends `seats`
  unchanged in the lobby or `new` at game over. The watching screen says why a bot seat can't be
  taken; a closed room or a refused code gives the setup screen back, the name filled in.
- **Reconnecting.** The page never asks for a reload. When the socket closes, or a ping gets no
  `pong` in 4 s, the last screen greys with "Reconnecting…" (after 30 s: "Is the Mac's server
  running?") and the page reconnects: at once when it becomes visible, else 1, 2, 4… s apart up to
  10 s while visible, forever. It drops its old socket unheard first, then rejoins by token. Never
  after `room closed` or `no such room`. A tab whose seat a newer connection took forgets its
  token and only watches.
- **Rooms by code.** `POST /create` with `{ name }` makes a 5-character room code, saves the room
  with 3 open seats and that name on seat 0, and returns `{ code, token }`. The link is
  `http://localhost:8787/?room=CODE`; the room is `ws://localhost:8787/room/CODE`, and a code no
  create made (or a closed room's) is refused and closed. Each room saves itself in
  `online/.wrangler/state`, pending timers included, which survives restarts: delete that folder to
  reset every room. Every message carries `host` and `timer` (`{ kind, msLeft }` or null), and
  `standIns` once a game exists.
- **Seat tokens.** The room makes one when it gives a person a seat and sends it only to that
  connection. `join` is `{ name, token? }`: a matching token returns to its seat (the older
  connection there becomes a spectator, told why), else the lowest open seat no token holds, else
  watching. A token holds its seat in the lobby too, until the host makes it a bot or removes it.
- **The host** is a seat, `room.host` (seat 0 at create). Only the host sends `seats` (3–5 entries,
  each open or a bot), `start` and `new`, which returns to the lobby; while the host is away, any
  seated person may, and becomes the host. **Connected** means a ping answered (the room's
  automatic `pong`) or a join in the last 15 s; an open socket alone isn't enough.
- **Timers.** `pickTimer` and `nextTimer` in `RULES` (60 and 15 s) are copied into the room at
  Start and run on its one alarm, guarded by the saved `room.timer`. A round resolves when every
  seat has picked or the pick timer runs out; then the countdown starts the next round by itself.
  An alarm more than 2 s late (the server was down) restarts its phase instead.
- **Stand-ins.** At the pick timer, a seat without a pick is skipped if connected, and dropped if
  not: `room.standIns` marks it, and Sneaky picks for it then and at each round start. It ends at
  the next round once its token holder is connected, and at New game a stand-in seat nobody holds
  is open. If every person seat has a stand-in, the room closes: its storage is deleted, every
  connection gets `room closed`, and its code names no room.

## Where the planning lives

Not here. Design and rules are in the Obsidian vault at `~/code/vault`:

- Rules (source of truth): `Games/Pirate Islands/Pirate Islands - Rules.md`
- Game note and playtest log: `Games/Pirate Islands/Pirate Islands.md`
- Wayfinder maps and tickets: `Projects/Pirate Islands Digital/PI Map.md` (v0.1), `Projects/Pirate Islands v0.2/PI2 Map.md` (v0.2),
  `Projects/Pirate Islands Online Rules Module/PIO Map.md` (the rules in `rules.js`),
  `Projects/Pirate Islands Online One Room/PIO2 Map.md` (the room in `online/`),
  `Projects/Pirate Islands Online Lobby/PIO3 Map.md` (rooms by code, the host, phones),
  `Projects/Pirate Islands Online Timers/PIO4 Map.md` (timers, stand-ins, reconnecting)

Never invent a rule. If the build needs one the rules don't give, ask Alex and record it in the
vault rules.
