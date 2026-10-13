// The bot check: 1,000 bot-only games across 3–5 seats and seeds. Run: node check.js
// Fails a game that throws, runs past 100 rounds, or where viewFor lets a seat see what it mustn't.
require('./rules.js');
const { RULES, BOTS, newGame, pick, allPicked, resolve, nextRound, botPick, viewFor } = Rules;
const kinds = BOTS.personalities.map(b => b.name), fails = [], rounds = [], ends = { win: 0, bagOut: 0 };
let seed = 1, skipped = 0, fullBag = RULES.perColour;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the check's own chance: seat order and skips
// A view mustn't change when the hidden parts do: the bag, the seed, other seats' picks this round, and older reveals until the end.
function leaks(state, seat) {
  const v = viewFor(state, seat), s = structuredClone(state);
  s.bag = s.bag.map(n => n + 7); s.rng ^= 1;
  s.picks = s.picks?.map((p, q) => (q === seat || p === null ? p : (p + 1) % s.islands.length));
  if (!s.winners) s.history = s.history.map((h, k) => (k < s.history.length - 1 ? { round: -1 } : h));
  return 'bag' in v || 'rng' in v || (!v.over && 'history' in v) || JSON.stringify(v) !== JSON.stringify(viewFor(s, seat));
}
for (let g = 0; g < 1000; g++) {
  // Odd games: every seat a bot. Even games: every seat picked through pick() by a named bot, in random order; every
  // other even game also skips each seat 1 time in 5. The last 100 games use a bag of 4 per colour, so it runs out.
  RULES.perColour = g < 900 ? fullBag : 4;
  const n = 3 + (g % 3), people = g % 2 === 0, skips = g % 4 === 0, seats = [...Array(n).keys()];
  const state = newGame(seats.map(() => ''), seats.map(q => (people ? null : kinds[(g + q) % 3])), g * 7919 + 1);
  const look = () => seats.concat(null).forEach(q => { if (leaks(state, q)) throw Error(`viewFor leaks to seat ${q}`); });
  try {
    for (let r = 1; !state.winners; r++) {
      if (r > 100) throw Error('no end after 100 rounds');
      look();
      for (const q of seats.toSorted(() => rnd() - 0.5)) {
        if (skips && rnd() < 0.2) { skipped++; continue; }
        if (state.picks[q] === null && !pick(state, q, botPick(state, q, kinds[q % 3]))) throw Error('a fair pick was refused');
        if (pick(state, q, 0)) throw Error('a pick was changed');
        look();
      }
      if (!skips && !allPicked(state)) throw Error('a seat has no pick');
      if (!resolve(state)) throw Error('resolve refused');
      look();
      if (!state.winners && !nextRound(state)) throw Error('nextRound refused');
    }
    rounds.push(state.round); ends[state.bagOut ? 'bagOut' : 'win']++;
  } catch (e) { fails.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}, round ${state.round}): ${e.message}`); }
}
const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
console.log(`1000 games: ${fails.length} failures. Rounds ${Math.min(...rounds)}–${Math.max(...rounds)}, average ${avg.toFixed(1)}.`,
            `Ended by a win ${ends.win}, by the bag ${ends.bagOut}. Seats skipped: ${skipped}.`);
fails.slice(0, 10).forEach(f => console.log(' ', f));
process.exitCode = fails.length ? 1 : 0;
