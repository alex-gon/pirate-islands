# 🏴‍☠️ Pirate Islands

A small pirate game where you bluff and predict. Everyone secretly picks an island at the same
time. If you're the only one who picked it, you take its treasure. If others picked it too, it
**crashes** and nobody gets anything.

This repo holds a small digital prototype for playtesting the tabletop rules (v0.2). Up to 5
players share one screen, and any seat can be played by a bot, so you can play alone.

## Play

Open `index.html` in any modern browser, with `rules.js` in the same folder. There's nothing to
install or build, and it has no dependencies.

1. Choose 3–5 seats, name them, and make any seat a human or a bot (**Greedy**, **Sneaky** or
   **Wild**).
2. Each human picks an island in secret. A pass-the-device screen appears between picks, but only
   when 2 or more humans are playing.
3. All picks are revealed together, and the islands resolve.

## Rules (v0.2)

- There is **one island per player**, and treasure comes in **5 colours**: Rubies, Emeralds,
  Sapphires, Gold and Pearls. The bag holds 15 of each, drawn blind and never put back.
- At setup, each island gets **2 random tokens** from the bag.
- Each round, everyone secretly picks an island, then all picks are revealed together.
  - **Raid:** if you're the only one who picked an island, you take its whole pile.
  - **Crash:** if 2 or more players picked it, nobody takes anything and the pile **freezes** as
    it is.
- Every island that didn't crash then gets **1 new token** from the bag.
- **The first player to hold 5 of one colour wins.** Off-colour treasure counts only in tiebreaks,
  though taking it also keeps it from your rivals.
- **Ties** are broken by most of the winning colour, then most different colours, then most
  tokens. If players are still level, they share the win.
- If the bag can't refill every island that's due a token, the game ends and the tiebreak order
  decides the winner.
- Everyone can see each player's haul by colour. The bag's contents stay hidden, and only the
  most recent reveal is shown.

## Bots

Bots see only public information: the island piles, every player's haul and the last round's
picks. They never see this round's picks or what's left in the bag. Each bot values tokens in
colours it already collects, guesses where its rivals will crowd in, and will deliberately crash
an island a rival could win on.

| Bot | Style |
|---|---|
| Greedy | Goes for the biggest piles |
| Sneaky | Prefers safe islands where it probably won't crash |
| Wild | Likes big piles, but its picks are more random |

## Tweaking

The game lives in `rules.js`, and `index.html` is the screen you play on. All the game numbers
are in the `RULES` block at the top of `rules.js`. That
includes colours, tokens per colour, starting pile, refill amount, win target and player count.
To try a variant, you usually only need to change one line. Bot tuning lives in the `BOTS` block
next to it.

The code is plain JavaScript with no framework, no build step and no tests. That's on purpose:
this is a throwaway prototype for finding out whether the core loop is fun. The one exception is
`node check.js`, which plays 1,000 bot-only games to check that every game ends and no player
can see hidden information. Run it after changing `rules.js`.
