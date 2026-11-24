# Pirate Islands: Prototypes

Six forks of the v0.3 hotseat for the v0.4 trial, one new idea each, built from the vault's PI4 tickets
(`~/code/vault/Projects/Pirate Islands v0.4 Prototypes/PI4 Map.md`). Alex plays them and chooses what goes into v0.4.

| Folder | Prototype |
|---|---|
| `captains/` | Captain cards |
| `islands/` | Island personalities |
| `bounties/` | Bounty cards |
| `tokens/` | Doubloons and skulls |
| `weather/` | Weather |
| `parley/` | The Parley flag |

- **Self-contained.** Each folder has its own copy of `index.html`, `rules.js`, `howtoplay.js` and `check.js`
  (no symlinks, no `../` scripts), so each opens by double-click from `file://`. The root game and `online/` never
  import anything from here, and a fix on either side is not carried to the other.
- **Jettison only, hotseat only.** The Crash rule switch is gone; every game is Jettison. No online play, nothing deployed.
- **Numbers** for each idea live in the `PROTO` block under `RULES` in that folder's `rules.js`.
- **Checks.** `node prototypes/<folder>/check.js` from the repo root (or `node check.js` in the folder):
  1,000 bot games on Jettison.
- **Never invent a rule.** A case the ticket doesn't settle goes to Alex, and the answer goes in that ticket.

## Play

Double-click `index.html` here for the menu. On phones (the iPhone needs this: Safari won't open the hotseat from a
file), from the repo root:

```sh
python3 -m http.server 8000
```

then on any phone on the Mac's Wi-Fi open `http://<the Mac's Wi-Fi address>:8000/prototypes/`
(`ipconfig getifaddr en0` prints the address). No dependencies.
