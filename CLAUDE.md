# Pirate Islands — hotseat prototype

A throwaway digital prototype of the Pirate Islands board game, for playtesting. 3–5 people share
one screen, secretly pick islands one at a time, then watch the reveal.

- **Everything is `index.html`.** Plain JS, no build, no dependencies. Open it in a browser.
- **Rule numbers live in the `RULES` block** at the top of the script. A variant is a one-line edit.
- **Keep it tiny and readable.** Fewer lines over cleverness. No framework, no tests, no tooling
  unless a playtest proves it's needed.

## Where the planning lives

Not here. Design and rules are in the Obsidian vault at `~/code/vault`:

- Rules (source of truth): `Games/Pirate Islands/Pirate Islands - Rules.md`
- Game note and playtest log: `Games/Pirate Islands/Pirate Islands.md`
- Wayfinder map and tickets: `Projects/Pirate Islands Digital/PI Map.md`

Never invent a rule. If the build needs one the rules don't give, ask Alex and record it in the
vault rules.
