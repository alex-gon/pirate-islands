# Pirate Islands: Doubloons and skulls

A v0.4 prototype: wild gold and cursed skulls in the bag.

- **Spec:** the vault ticket "PI4 05 Doubloons and Skulls" (`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/`), approved
  by Alex as written on 2026-11-23; never invent a rule the ticket doesn't give.
- **What it adds:** 5 🪙 Doubloons (wild, at most 2 count toward your 5) and 5 💀 Skulls (raid one and jettison 1 treasure per
  skull, all onto one island; the skull goes to Davy Jones' locker, `state.locker`) in the bag, 85 tokens in all. A crash
  leaves skulls on the pile; a win comes before the curse. `PROTO.skullsPass = true` tries the "hot potato" instead: the
  raider jettisons the skulls themselves, and they stay in play.
- **Engine:** tokens 5 and 6 of every pile, haul and bag are the Doubloon and Skull (`Rules.D`, `Rules.X`); `best(haul)` is
  the win score. A jettison is `jettison(state, seat, colours, island)`, `colours` as long as the seat's `owed`.
- **Base:** a copy of the root v0.3 hotseat at commit `96a6706`, playing Jettison only. Fixes to the root game are not
  carried here, and the other way round.
- **Numbers:** this prototype's live in the `PROTO` block under `RULES` in `rules.js`.
- **Check:** `node check.js` (from this folder or the repo root as `node prototypes/tokens/check.js`).
- **Play:** open `index.html`, or see `../README.md` for phones.
