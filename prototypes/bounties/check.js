// The bot check for the Bounty cards prototype: 1,000 bot-only games across 3–5 seats and seeds, all on Jettison. Run: node check.js
// Fails a game that throws, a lost or made-up token, a view that lets a seat see what it mustn't (the deck's order included),
// a bounty claimed twice or claimed by a haul that didn't meet it, a tie for a bounty settled against rule 3, a winner who
// hadn't won, or a game still going at 500 rounds. Jettison games past 100 rounds are reported, not failed.
require('./rules.js');
const { RULES, PROTO, BOTS, meets, newGame, pick, allPicked, resolve, jettison, allJettisoned, refill, nextRound, endEarly, botPick, botJettison,
        viewFor } = Rules;
const kinds = BOTS.personalities.map(b => b.name), fails = [], long = [], rounds = { jettison: [], freeze: [] };
const ends = { win: 0, bagOut: 0, unfinished: 0 };
const byBounty = PROTO.bounties.map(() => 0), winBy = { colour: 0, bounties: 0, both: 0 };
let seed = 1, skipped = 0, jettisons = 0, fullBag = RULES.perColour;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the check's own chance: seat order and skips
// A view mustn't change when the hidden parts do: the bag, the seed, other seats' picks and jettisons this round, and older
// reveals until the end.
function leaks(state, seat) {
  const v = viewFor(state, seat), s = structuredClone(state), other = (q, x) => q !== seat && x;
  s.bag = s.bag.map(n => n + 7); s.rng ^= 1; s.deck = s.deck.toReversed().concat(99);
  s.picks = s.picks?.map((p, q) => (other(q, p !== null) ? (p + 1) % s.islands.length : p));
  s.jettisons = s.jettisons?.map((j, q) => (other(q, j) ? { colour: j.colour + 1, island: j.island + 1 } : j));
  if (!s.winners) s.history = s.history.map((h, k) => (k < s.history.length - 1 ? { round: -1 } : h));
  return 'bag' in v || 'rng' in v || 'deck' in v || 'jettisons' in v || (!v.over && 'history' in v) || JSON.stringify(v) !== JSON.stringify(viewFor(s, seat));
}
// Every token is in the bag, on an island or in a haul, and none is negative.
const counted = state => RULES.treasure.every((_, c) => {
  const all = [state.bag, ...state.islands, ...state.players.map(p => p.haul)].map(a => a[c]);
  return all.every(n => n >= 0) && all.reduce((a, b) => a + b, 0) === RULES.perColour;
});
for (let g = 0; g < 1000; g++) {
  // Odd games: every seat a bot. Even games: every seat picked and jettisoned through pick() and jettison() by a named bot, in
  // random order; every other even game also skips each seat 1 time in 5, and Sneaky jettisons for a skipped jettison, as
  // online. Each kind is played under both crash rules. The last 100 games use a bag of 4 per colour, so it runs out.
  // Games 49, 99…: ended early in round 3, halfway through the picks; games 29, 79…: at their first jettison step.
  RULES.perColour = g < 900 ? fullBag : 4;
  const n = 3 + (g % 3), people = g % 2 === 0, skips = g % 4 === 0, seats = [...Array(n).keys()];
  const rule = 'jettison', stopPicking = g % 50 === 49, stopJettison = g % 50 === 29; // prototypes play Jettison only (PI4 01)
  const state = newGame(seats.map(() => ''), seats.map(q => (people ? null : kinds[(g + q) % 3])), g * 7919 + 1, rule);
  const look = () => {
    seats.concat(null).forEach(q => { if (leaks(state, q)) throw Error(`viewFor leaks to seat ${q}`); });
    if (!counted(state)) throw Error('a token was lost or made up');
  };
  const stop = () => {
    if (!endEarly(state) || state.winners.length || !viewFor(state, 0).unfinished) throw Error('ending early failed');
    if (pick(state, 0, 0) || jettison(state, 0, 0, 0) || nextRound(state) || refill(state)) throw Error('an ended game played on');
    if (endEarly(state)) throw Error('a game ended twice');
  };
  try {
    for (let r = 1; !state.winners; r++) {
      if (r > 100 && rule === 'freeze') throw Error('no end after 100 rounds');
      if (r > 500) { stop(); throw Error('no end after 500 rounds'); }
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
      const held = state.players.map(p => p.bounties.length), before = [...state.showing];
      if (!resolve(state)) throw Error('resolve refused');
      look();
      // Every claim was met when it was made, was face up, and went to fewer bounties, then the smaller haul (rule 3).
      const h = state.history.at(-1), all = state.players.flatMap(p => p.bounties), size = q => state.players[q].haul.reduce((a, b) => a + b, 0);
      if (new Set(all).size !== all.length) throw Error('a bounty was claimed twice');
      if (state.showing.some(k => all.includes(k))) throw Error('a claimed bounty is still face up');
      h.claims.forEach(c => {
        if (!before.includes(c.bounty) || !meets(state.players[c.seat].haul, c.bounty)) throw Error('a bounty was claimed without being met');
        if (c.rivals.some(q => !meets(state.players[q].haul, c.bounty))) throw Error("a rival didn't meet the bounty");
        if (c.rivals.some(q => held[q] < held[c.seat] || (held[q] === held[c.seat] && size(q) < size(c.seat)))) throw Error('a tie went the wrong way');
        byBounty[c.bounty]++;
      });
      before.forEach(k => { if (!h.claims.some(c => c.bounty === k) && state.players.some(p => meets(p.haul, k))) throw Error('a met bounty was left unclaimed'); });
      if (state.jettisons) {
        if (rule === 'freeze') throw Error('a Freeze game jettisoned');
        if (nextRound(state)) throw Error('a round started before the jettisons');
        if (stopJettison) { stop(); break; }
        const crashed = state.history.at(-1).results.flatMap(x => (x.kind === 'crash' ? x.who : []));
        seats.forEach(q => {
          const owes = crashed.includes(q) && state.players[q].haul.some(Boolean);
          if (owes !== (state.jettisons[q] !== false)) throw Error(`seat ${q} owes the wrong jettison`);
          if (!owes && jettison(state, q, state.players[q].haul.findIndex(Boolean), 0)) throw Error('a seat that owed none jettisoned');
        });
        for (const q of seats.toSorted(() => rnd() - 0.5)) {
          if (state.jettisons[q] !== null) continue;
          if (state.players[q].haul.some((x, c) => !x && jettison(state, q, c, 0))) throw Error("a colour not held was jettisoned");
          if (refill(state)) throw Error('refill came before every jettison');
          const j = skips && rnd() < 0.2 ? botJettison(state, q, 'Sneaky') : botJettison(state, q, kinds[q % 3]);
          if (!jettison(state, q, j.colour, j.island)) throw Error('a fair jettison was refused');
          if (jettison(state, q, j.colour, (j.island + 1) % n)) throw Error('a jettison was changed');
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
    if (state.winners.length && !state.bagOut) state.winners.forEach(q => {
      const p = state.players[q], colour = Math.max(...p.haul) >= RULES.winAt, b = p.bounties.length >= PROTO.toWin;
      if (!colour && !b) throw Error('a winner had not won');
      winBy[colour && b ? 'both' : colour ? 'colour' : 'bounties']++;
    });
    rounds[rule].push(state.round); ends[state.unfinished ? 'unfinished' : state.bagOut ? 'bagOut' : 'win']++;
    if (state.round > 100) long.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}): ${state.unfinished ? 'still going at 500 rounds, ended early' : `${state.round} rounds`}`);
  } catch (e) { fails.push(`game ${g} (${n} seats, ${rule}, seed ${g * 7919 + 1}, round ${state.round}): ${e.message}`); }
}
const span = a => `${Math.min(...a)}–${Math.max(...a)}, average ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}`;
console.log(`1000 games: ${fails.length} failures. Rounds: Jettison ${span(rounds.jettison)}.`,
            `Ended by a win ${ends.win}, by the bag ${ends.bagOut}, early ${ends.unfinished}. Seats skipped: ${skipped}. Jettisons: ${jettisons}.`);
console.log(`Winners by 5 of a colour ${winBy.colour}, by ${PROTO.toWin} bounties ${winBy.bounties}, by both ${winBy.both}.`,
            `Claims: ${PROTO.bounties.map((b, k) => `${b.icon} ${b.name} ${byBounty[k]}`).join(', ')}.`, '(The unchanged v0.3 fork averages 12.9 rounds on this check; a big drop means toWin should be 3.)');
fails.slice(0, 10).forEach(f => console.log(' ', f));
if (long.length) console.log(`Jettison games past 100 rounds: ${long.length}`), long.forEach(l => console.log(' ', l));
process.exitCode = fails.length ? 1 : 0;
