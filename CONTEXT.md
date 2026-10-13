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

**Pick**:
The island a seat chooses for this round. Final once made.
_Avoid_: choice, move, lock

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
_Avoid_: lobby, server, match

**Spectator**:
Someone connected to a room without a seat. Sees only what every seat can see, and can't pick.
_Avoid_: observer, watcher

## Relationships

- A **Round** gives each **Seat** at most one **Pick**; a **Seat** with none is **Skipped**.
- Resolving a **Round** adds one **Reveal** and moves treasure from **Piles** to **Hauls**, and
  from the **Bag** to **Piles**.
- A **View** is always for one **Seat**, or for a **Spectator**.
- A **Room** holds one game; each **Seat** in it is played by at most one connection.

## Example dialogue

> **Dev:** "Jamie's phone locked and the timer ran out. Is Jamie **skipped**?"
> **Alex:** "Only if they're connected but slow. A dropped player gets a bot **pick** for their
> **seat** instead, and the seat keeps its **haul** when they come back."

## Flagged ambiguities

- "Player" meant both the person and the place at the table. Resolved: the place is a **Seat**;
  a person can leave and return to it.
