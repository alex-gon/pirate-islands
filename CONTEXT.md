# Pirate Islands

A hidden-pick treasure game: each round every player secretly picks an island, and an island
taken alone is raided while a shared one crashes. These are the words the code and the plans use.

## Language

**Seat**:
One place at the table, numbered from 0. A seat is played by a person or a bot, and keeps its haul
when a bot takes over for a dropped player or the player returns.
_Avoid_: player slot, turn

**Bot seat**:
A seat played by a computer personality (Greedy, Sneaky or Wild) from the start of the game.
_Avoid_: AI, CPU

**Stand-in**:
The bot (always Sneaky) that plays a dropped person's seat from the round their pick timer ran out
until they return. It lasts only for that game. Players read it as "left · a bot is playing".
_Avoid_: replacement, bot seat (that is a bot for the whole game)

**Dropped**:
A seated person whose connection is gone when the pick timer runs out. Their seat gets a
**Stand-in**, never a skip. A connected person who is just slow is **Skipped** instead.
_Avoid_: disconnected (a phone can disconnect and return within one round without dropping), left

**Away**:
In the **Lobby**, a seat whose **Seat token** holder isn't connected. The seat is kept for them
until the **Host** frees it; then it is open, and their token no longer returns them to it.
_Avoid_: dropped (that is only when the pick timer runs out), empty, open

**Seat token**:
The private proof, kept on one device, that a seat belongs to the person there. Only its holder
can return to a seat; someone without it can only watch.
_Avoid_: session, password

**Pick**:
The island a seat chooses for this round. Final once made.
_Avoid_: choice, move, lock

**Pick timer**:
Online, the time every seat has to pick in one round (1 minute), shown as a bar shrinking across
the top of every phone. The round resolves when every seat has picked or the timer runs out.
_Avoid_: turn timer, clock

**Reveal pause**:
Online, the 5 seconds the reveal stays on screen before the next round starts by itself, with
nothing counting down. Pass and play has none: a button starts each round.
_Avoid_: countdown, next-round countdown, break, Next round button (pass and play only)

**Skipped**:
A seat that has no pick when the round resolves (online, the pick timer ran out). It goes to no
island: it takes nothing and doesn't count toward a crash.
_Avoid_: passed, forfeited

**Round**:
Every seat picks, then the round resolves: raid, crash or unvisited per island, the winner check,
then the refill.

**Between rounds**:
The time after a round resolves and before the next starts, while the reveal is on screen. No pick
is accepted.

**Reveal**:
The record of one resolved round: every seat's pick and what happened on each island. Players see
only the last one during play, and all of them once the game is over.
_Avoid_: result screen

**Pile**:
The treasure tokens sitting on one island, counted by colour.

**Haul**:
The treasure tokens a seat has taken, counted by colour. Public.
_Avoid_: score

**Bag**:
The tokens not yet drawn. Hidden, including how many are left.

**View**:
What one seat may see of a game: everything public plus its own pick, never the bag, another
seat's pick this round, or older reveals before the end.
_Avoid_: client state, snapshot

**Room**:
One place online where players' tabs or phones meet to play one game at a time, seat by seat.
_Avoid_: server, match

**Spectator**:
Someone connected to a room without a seat. Sees only what every seat can see, and can't pick.
_Avoid_: observer, watcher

**Room code**:
The five characters that name one room. A code that names no room is refused, never created.
_Avoid_: room id, PIN

**Host**:
The one seated person who chooses the seats and bots, starts the game, and begins a new one. At
first it is whoever created the room, in seat 0. While the host is disconnected, any seated person
may do what the host does (choose the seats, start, or begin a new game), and the first to do so
becomes the host; the old host returns as an ordinary player.
_Avoid_: owner, admin, leader

**Lobby**:
A room before its game starts: people join, and the host sets the seats and presses Start. A
phase of a room, never another name for the room.
_Avoid_: waiting room, setup

**Room expired**:
A room nobody has used for 2 hours: no one has joined, changed the seats, started, picked or begun
a new game. It deletes itself in any phase, its **Room code** names no room any more, and any phone
still connected is told the room closed for that reason. Keeping a page open is not using it.
_Avoid_: timed out, idle (a slow seat in a round is **Skipped**, not idle)

**Pass and play**:
Playing on one shared device passed round the table, each person picking in secret in turn. No
room, no host: the other way to play besides a room.
_Avoid_: hotseat (the code's nickname for its page, never a word players read), local game

## Relationships

- A **Round** gives each **Seat** at most one **Pick**; a **Seat** with none is **Skipped**.
- Resolving a **Round** adds one **Reveal** and moves treasure from **Piles** to **Hauls**, and
  from the **Bag** to **Piles**.
- A **View** is always for one **Seat**, or for a **Spectator**.
- A **Room** holds one game; each **Seat** in it is played by at most one connection.
- A **Room** has one **Host** and one **Room code**, and is a **Lobby** until the **Host** starts
  a game, and again when the **Host** begins a new one.
- **Pass and play** has **Seats** and **Bot seats** but no **Room**, **Host** or **Lobby**.
- A **Dropped** person's **Seat** is played by a **Stand-in** until the holder of its **Seat token**
  returns; the **Seat** keeps its **Haul** either way, and is open again in the next **Lobby**.
- A **Room** closes when every person's **Seat** is **Dropped**: its game ends with no winner, and
  its **Room code** names no room any more.
- A **Room** also closes when it has **expired**, whatever its phase: a finished game, a lobby left
  open, or a game where no one picks any more.

## Example dialogue

> **Dev:** "Jamie's phone locked and the timer ran out. Is Jamie **skipped**?"
> **Alex:** "Only if they're connected but slow. Jamie is **dropped**, so a **stand-in** picks for
> the **seat** instead, and the seat keeps its **haul** when Jamie's **seat token** comes back."

## Flagged ambiguities

- "Player" meant both the person and the place at the table. Resolved: the place is a **Seat**;
  a person can leave and return to it.
- "Lobby" was avoided as a name for the **Room**. Resolved: a **Lobby** is the phase of a room
  before its game starts, never the room itself.
- "Bot" covered both a seat that is a bot all game and one that plays for a dropped person.
  Resolved: the first is a **Bot seat**, the second a **Stand-in**.
- "Host" meant seat 0. Resolved: the **Host** is a role that can move to another seat while the
  host is disconnected; seat 0 is only where it starts.
