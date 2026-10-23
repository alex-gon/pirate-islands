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
- **`online/`: the one folder with dependencies.** Rooms for playing on phones and in browser tabs:
  a Cloudflare Worker with one Durable Object per room, `online/src/room.js`, that holds the
  real game on `rules.js` and sends each connection only `viewFor` its own seat. `online/package.json`
  holds only `wrangler`; nothing else is added without a reason. Run it on the Mac with
  `cd online && npm install && npm run dev`, offline, with no Cloudflare account.
  `"dev": { "ip": "0.0.0.0" }` in `wrangler.jsonc` puts it on the Mac's Wi-Fi address too, which
  wrangler prints, so phones on the same network can play. `online/public/` is the page, with
  `rules.js` as a symlink to the root file (a deploy uploads what it points to) and `qrcode.js`,
  Kazuhiko Arase's `qrcode-generator` 2.0.4 vendored as one file, MIT (`qrcode-LICENSE.txt`).
- **Deployed** on Cloudflare's free plan from Alex's account, at a `workers.dev` address (filled in
  here by the first deploy, PIO5 05). `cd online && npm run deploy` puts the same code online. Over a
  free-plan limit requests fail; nothing is ever charged, and no card is on the account. A redeploy
  drops every socket (pages reconnect by themselves, rooms keep their state); `wrangler delete`
  destroys every room, with no undo.
- **Safe to share.** A room nobody has used for 2 hours (no `join`, `seats`, `free`, `start`, `pick`
  or `new`; pings don't count) expires in any phase: its storage is deleted, every connection gets
  `room expired`, and its code names no room. `POST /create` is capped by the `Limiter` Durable
  Object, one per address (`CF-Connecting-IP`): 10 rooms in any hour, then `429`; an hour after its
  latest room it deletes itself. The same under `npm run dev`.
- **The online check.** `cd online && node check-online.mjs [URL]` (default `http://localhost:8787`,
  or the deployed `https://` address) has a made-up code refused, then plays three sockets through a
  full game with real picks, checking each sees only its own view; about a minute. Against
  `npm run dev` only: `--cap` (10 rooms, the 11th refused) and, with the server started as
  `npx wrangler dev --var IDLE:3000`, `--expiry`. Run it after any change to `online/`.
- **The page's screens.** `/` is the setup screen: one name, Create a room, Join by code, and
  **Pass and play**, a link to `/hotseat`. That is `online/public/hotseat.html`, a symlink to the
  root `index.html` (no timers; its pick screen shows the Last round block). `/?room=CODE` skips
  setup; the host gets the code large, a dropdown per seat, − / + and Start, guests a waiting
  lobby, and only the host gets New game.
  Every lobby screen, the host's and the guests', shows the room link under the code, and as a QR
  code for a camera. The name and the seat token live in `sessionStorage` (a refresh rejoins);
  `localStorage` only prefills the name field. While visible, the page sends `ping` every 5 s.
  The socket is `wss://` when the page is `https:`, else `ws://`.
- **Wake Lock.** While the page is in a room (lobby or game) it asks to keep the screen on, on any
  tap (an iPhone grants it only then) and on becoming visible; it lets go at game over and on
  leaving. Only over `https`: on the Wi-Fi's `http` address it doesn't exist. Refusals are ignored,
  and nothing is shown.
- **The page's game screens.** For the pick timer only, a blue bar fixed to the top edge shrinks
  smoothly from the message's `timer.msLeft`, the seconds large under it; nothing during the reveal
  pause, in the lobby or at game over. While a round is open, the pick, picked and welcome-back
  screens show a **Last round** block under the hauls, one line per player from `view.last`
  (`Ann → B: raided alone, took …`, `💥 crash with Cat`, `skipped (too slow)`, 🤖 for a stand-in),
  their own bold, red if skipped; the hotseat shows the same block under Lock in. A skipped seat reads
  `→ skipped (too slow)` (`skipped` in the game-over table), and the seat itself gets a red line. A
  stand-in seat's card is dashed with `left · 🤖 playing`, and its picks carry 🤖 in the reveal and
  the table (the room stamps each round's `standIns` on its history entry). A seat back mid-round
  is told the bot picked for it. Guests get "Sam gone? Take over as host", which sends `seats`
  unchanged in the lobby or `new` at game over. The watching screen says why a bot seat can't be
  taken; a closed room or a refused code gives the setup screen back, the name filled in.
- **Reconnecting.** The page never asks for a reload. When the socket closes, or a ping gets no
  `pong` in 4 s, the last screen greys with "Reconnecting…" (after 30 s: "Still trying. Check
  your connection.") and the page reconnects: at once when it becomes visible, else 1, 2, 4… s apart up to
  10 s while visible, forever. It drops its old socket unheard first, then rejoins by token. Never
  after `room closed`, `room expired` or `no such room`. A tab whose seat a newer connection took forgets its
  token and only watches.
- **Rooms by code.** `POST /create` with `{ name }` makes a 5-character room code, saves the room
  with 3 open seats and that name on seat 0, and returns `{ code, token }`. The link is
  `/?room=CODE`; the room is `/room/CODE`, and a code no create made (or a closed or expired room's)
  is refused and closed. Too many creates from one address get `429` (see Safe to share). Each room saves itself in
  `online/.wrangler/state`, pending timers included, which survives restarts: delete that folder to
  reset every room. Every message carries `host` and `timer` (`{ kind, msLeft }` or null), and
  `standIns` once a game exists.
- **Seat tokens.** The room makes one when it gives a person a seat and sends it only to that
  connection. `join` is `{ name, token? }`: a matching token returns to its seat (the older
  connection there becomes a spectator, told why), else the lowest open seat no token holds, else
  watching. A token holds its seat in the lobby too, until the host makes it a bot, removes it or
  frees it. The lobby's `waiting` names every held seat, and marks it `away` when its holder isn't
  connected (the lobby's alarm looks every 15 s, so a locked phone shows too): everyone sees "Cat · away", the host gets Free seat, a spectator is told the seat is
  kept for Cat, and Start refuses with "Cat is away". In the lobby, a spectator who sent `join` gets
  the next seat to open (earliest join first), with no reload.
- **The host** is a seat, `room.host` (seat 0 at create). Only the host sends `seats` (3–5 entries,
  each open or a bot), `free` (`{ seat }`: an away seat's token stops working and the seat is open),
  `start` and `new`, which returns to the lobby; while the host is away, any
  seated person may, and becomes the host. **Connected** means a ping answered (the room's
  automatic `pong`) or a join in the last 15 s; an open socket alone isn't enough.
- **Timers.** `pickTimer` and `nextTimer` in `RULES` (60 and 5 s) are copied into the room at
  Start and run on its one alarm, guarded by the saved `room.timer`. A round resolves when every
  seat has picked or the pick timer runs out; then the reveal pause starts the next round by itself.
  An alarm more than 2 s late (the server was down) restarts its phase instead.
- **Stand-ins.** At the pick timer, a seat without a pick is skipped if connected, and dropped if
  not: `room.standIns` marks it, and Sneaky picks for it then and at each round start. It ends at
  the next round once its token holder is connected (at game over, as soon as they rejoin; the
  rounds it played keep their 🤖), and at New game a stand-in seat whose holder
  isn't connected is open. If every person seat has a stand-in, the room closes: its storage is deleted, every
  connection gets `room closed`, and its code names no room.

## Where the planning lives

Not here. Design and rules are in the Obsidian vault at `~/code/vault`:

- Rules (source of truth): `Games/Pirate Islands/Pirate Islands - Rules.md`
- Game note and playtest log: `Games/Pirate Islands/Pirate Islands.md`
- Wayfinder maps and tickets: `Projects/Pirate Islands Digital/PI Map.md` (v0.1), `Projects/Pirate Islands v0.2/PI2 Map.md` (v0.2),
  `Projects/Pirate Islands Online Rules Module/PIO Map.md` (the rules in `rules.js`),
  `Projects/Pirate Islands Online One Room/PIO2 Map.md` (the room in `online/`),
  `Projects/Pirate Islands Online Lobby/PIO3 Map.md` (rooms by code, the host, phones),
  `Projects/Pirate Islands Online Timers/PIO4 Map.md` (timers, stand-ins, reconnecting),
  `Projects/Pirate Islands Online Deploy/PIO5 Map.md` (putting it online)

Never invent a rule. If the build needs one the rules don't give, ask Alex and record it in the
vault rules.
