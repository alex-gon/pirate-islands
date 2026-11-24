// The bot check for the Island personalities prototype: 1,000 bot-only games across 3–5 seats, seeds and random island
// deals, all on Jettison. Run: node check.js
// Fails a game that throws, a lost or made-up token (the Volcano's destroyed pile, state.deep, included), a view that lets a
// seat see what it mustn't (a Den's hidden colours among it), or a bot that reads a Den's hidden colours. Games past 100
// rounds are reported, not failed; one still going at 500 is ended early and reported. Ends with a line per tile.
require('./rules.js');
const { RULES, PROTO, BOTS, newGame, pick, allPicked, resolve, jettison, allJettisoned, refill, nextRound, endEarly, botPick, botJettison,
        viewFor, tile, owes, share, sharing, botShare } = Rules;
const kinds = BOTS.personalities.map(b => b.name), fails = [], long = [], rounds = [];
const ends = { win: 0, bagOut: 0, unfinished: 0 };
const stats = Object.fromEntries(PROTO.islands.map(t => [t.key, { games: 0, rounds: 0, raid: 0, crash: 0, share: 0 }]));
let seed = 1, skipped = 0, jettisons = 0, twos = 0, takes = 0, fullBag = RULES.perColour;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the check's own chance: seat order and skips
// Swap the colours of every Den's hidden tokens (on the island and in the last reveal), keeping their count: nothing a seat
// may see, and nothing a bot reads, may change.
const rot = (pile, seen) => { const h = pile.map((n, c) => n - seen[c]); return seen.map((n, c) => n + h[(c + 1) % h.length]); };
function shuffleDen(s) {
  if (s.winners) return s;
  s.islands = s.islands.map((p, i) => (tile(s, i).hidden ? rot(p, s.seen[i]) : p));
  s.history.at(-1)?.results.forEach(r => {
    if (!r.seenAfter) return;
    if (r.kind !== 'raid') r.before = rot(r.before, r.seenBefore);
    r.after = rot(r.after, r.seenAfter);
  });
  return s;
}
// A view mustn't change when the hidden parts do: the bag, the seed, other seats' picks and jettisons this round, older
// reveals until the end, and a Den's hidden colours.
function leaks(state, seat) {
  const v = viewFor(state, seat), s = shuffleDen(structuredClone(state)), other = (q, x) => q !== seat && x;
  s.bag = s.bag.map(n => n + 7); s.rng ^= 1;
  s.picks = s.picks?.map((p, q) => (other(q, p !== null) ? (p + 1) % s.islands.length : p));
  s.jettisons = s.jettisons?.map((j, q) => (other(q, j) ? { colours: j.colours.map(c => c + 1), island: j.island + 1 } : j));
  if (!s.winners) s.history = s.history.map((h, k) => (k < s.history.length - 1 ? { round: -1 } : h));
  return 'bag' in v || 'rng' in v || 'jettisons' in v || 'seen' in v || (!v.over && 'history' in v) || JSON.stringify(v) !== JSON.stringify(viewFor(s, seat));
}
// A bot picks and jettisons the same with a Den's hidden colours swapped (same seed, so same chance)
function peeks(state, q) {
  const same = (f, ...a) => JSON.stringify(f(structuredClone(state), ...a)) !== JSON.stringify(f(shuffleDen(structuredClone(state)), ...a));
  return (state.picks?.[q] === null && same(botPick, q, kinds[q % 3])) || (state.jettisons?.[q] === null && same(botJettison, q));
}
// Every token is in the bag, on an island, in a haul or destroyed in the Volcano, and none is negative.
const counted = state => RULES.treasure.every((_, c) => {
  const all = [state.bag, state.deep, ...state.islands, ...state.players.map(p => p.haul)].map(a => a[c]);
  return all.every(n => n >= 0) && all.reduce((a, b) => a + b, 0) === RULES.perColour;
});
for (let g = 0; g < 1000; g++) {
  // Odd games: every seat a bot. Even games: every seat picked, shared and jettisoned through pick(), share() and jettison()
  // by a named bot, in random order; every other even game also skips each seat 1 time in 5, and Sneaky jettisons for a
  // skipped jettison, as online. The last 100 games use a bag of 4 per colour, so it runs out. Games 49, 99…: ended early
  // in round 3, halfway through the picks; games 29, 79…: at their first jettison step; games 39, 89…: at their first share.
  RULES.perColour = g < 900 ? fullBag : 4;
  const n = 3 + (g % 3), people = g % 2 === 0, skips = g % 4 === 0, seats = [...Array(n).keys()];
  const stopPicking = g % 50 === 49, stopJettison = g % 50 === 29, stopShare = g % 50 === 39;
  const state = newGame(seats.map(() => ''), seats.map(q => (people ? null : kinds[(g + q) % 3])), g * 7919 + 1, 'jettison');
  const look = () => {
    seats.concat(null).forEach(q => { if (leaks(state, q)) throw Error(`viewFor leaks to seat ${q}`); });
    seats.forEach(q => { if (peeks(state, q)) throw Error(`a bot read a Den's hidden colours for seat ${q}`); });
    if (!counted(state)) throw Error('a token was lost or made up');
  };
  const stop = () => {
    if (!endEarly(state) || state.winners.length || !viewFor(state, 0).unfinished) throw Error('ending early failed');
    if (pick(state, 0, 0) || jettison(state, 0, 0, 0) || share(state, 0, 0) || nextRound(state) || refill(state)) throw Error('an ended game played on');
    if (endEarly(state)) throw Error('a game ended twice');
  };
  try {
    if (new Set(state.tiles).size !== n || state.islands.some((p, i) => p.reduce((a, b) => a + b, 0) !== tile(state, i).start)) throw Error('a bad deal');
    for (let r = 1; !state.winners; r++) {
      if (r > 500) { stop(); break; }
      look();
      for (const [k, q] of seats.toSorted(() => rnd() - 0.5).entries()) {
        if (stopPicking && r === 3 && k === Math.floor(n / 2)) { stop(); break; }
        if (skips && rnd() < 0.2) { skipped++; continue; }
        if (state.picks[q] === null && !pick(state, q, botPick(state, q, kinds[q % 3]))) throw Error('a fair pick was refused');
        if (pick(state, q, 0)) throw Error('a pick was changed');
        look();
      }
      if (state.winners) break;
      if (!skips && !allPicked(state)) throw Error('a seat has no pick');
      if (!resolve(state)) throw Error('resolve refused');
      look();
      if (state.share) { // a person is next to take in the Lagoon share
        if (!people) throw Error('bots left a share open');
        if (nextRound(state) || refill(state)) throw Error('the round went on during a share');
        if (stopShare) { stop(); break; }
        const lagoon = state.share.island, order = state.history.at(-1).results[lagoon].who
          .toSorted((p, q) => state.players[p].haul.reduce((a, b) => a + b, 0) - state.players[q].haul.reduce((a, b) => a + b, 0));
        if (sharing(state) !== order[0]) throw Error('the share did not start with the smallest haul');
        while (state.share) {
          const q = sharing(state), c = botShare(state, q);
          if (share(state, (q + 1) % n, c)) throw Error('a seat took out of turn');
          if (share(state, q, state.islands[lagoon].findIndex(x => !x))) throw Error('a colour not on the Lagoon was taken');
          if (!share(state, q, c)) throw Error('a fair take was refused');
          takes++;
          look();
        }
      }
      if (state.jettisons) {
        if (nextRound(state)) throw Error('a round started before the jettisons');
        if (stopJettison) { stop(); break; }
        const h = state.history.at(-1);
        seats.forEach(q => {
          const isl = h.picks[q], hold = state.players[q].haul.reduce((a, b) => a + b, 0);
          const due = isl !== null && h.results[isl].kind === 'crash' ? Math.min(hold, tile(state, isl).jettison ?? 1) : 0;
          if (due !== owes(state, q) || (due > 0) !== (state.jettisons[q] !== false)) throw Error(`seat ${q} owes the wrong jettison`);
          if (!due && jettison(state, q, state.players[q].haul.findIndex(Boolean), 0)) throw Error('a seat that owed none jettisoned');
        });
        for (const q of seats.toSorted(() => rnd() - 0.5)) {
          if (state.jettisons[q] !== null) continue;
          const due = owes(state, q);
          if (state.players[q].haul.some((x, c) => x < due && jettison(state, q, Array(due).fill(c), 0))) throw Error("a colour not held was jettisoned");
          if (refill(state)) throw Error('refill came before every jettison');
          const j = skips && rnd() < 0.2 ? botJettison(state, q, 'Sneaky') : botJettison(state, q, kinds[q % 3]);
          if (j.colours.length !== due) throw Error('a bot jettisoned the wrong number');
          if (due === 2 && jettison(state, q, j.colours.slice(0, 1), j.island)) throw Error('1 was jettisoned where 2 are owed');
          if (!jettison(state, q, j.colours, j.island)) throw Error('a fair jettison was refused');
          if (jettison(state, q, j.colours, (j.island + 1) % n)) throw Error('a jettison was changed');
          if (due === 2) twos++;
          look();
        }
        if (!allJettisoned(state)) throw Error('a crasher has no jettison');
        if (!refill(state)) throw Error('refill refused');
        if (refill(state)) throw Error('refilled twice');
        jettisons += state.history.at(-1).jettisons.filter(Boolean).length;
        look();
      }
      if (!state.winners && !nextRound(state)) throw Error('nextRound refused');
    }
    rounds.push(state.round); ends[state.unfinished ? 'unfinished' : state.bagOut ? 'bagOut' : 'win']++;
    state.tiles.forEach((key, i) => {
      const t = stats[key]; t.games++; t.rounds += state.history.length;
      state.history.forEach(h => { if (h.results[i].kind in t) t[h.results[i].kind]++; });
    });
    if (state.round > 100) long.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}): ${state.unfinished ? 'still going at 500 rounds, ended early' : `${state.round} rounds`}`);
  } catch (e) { fails.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}, round ${state.round}, ${state.tiles.join(' ')}): ${e.message}`); }
}
const span = a => `${Math.min(...a)}–${Math.max(...a)}, average ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}`;
console.log(`1000 games: ${fails.length} failures. Rounds: ${span(rounds)}.`,
            `Ended by a win ${ends.win}, by the bag ${ends.bagOut}, early ${ends.unfinished}. Seats skipped: ${skipped}.`,
            `Jettisons: ${jettisons} (of 2: ${twos}). Share takes by pick: ${takes}.`);
console.log('Per tile, a share of its rounds: raided · crashed · shared, and the average rounds of the games it was in');
PROTO.islands.forEach(({ key, icon, name }) => {
  const t = stats[key], pc = x => `${(100 * x / t.rounds).toFixed(0)}%`;
  console.log(`  ${icon} ${name.padEnd(15)} ${String(t.games).padStart(4)} games · raided ${pc(t.raid)} · crashed ${pc(t.crash)} · shared ${pc(t.share)} · ${(t.rounds / t.games).toFixed(1)} rounds`);
});
fails.slice(0, 10).forEach(f => console.log(' ', f));
if (long.length) console.log(`Games past 100 rounds: ${long.length}`), long.slice(0, 10).forEach(l => console.log(' ', l));
process.exitCode = fails.length ? 1 : 0;
