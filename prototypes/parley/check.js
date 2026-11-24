// The bot check for the Parley flag prototype (PI4 08): 1,000 bot-only games across 3–5 seats and seeds, all on Jettison.
// Run: node check.js. Fails a game that throws, a lost or made-up token, a view that lets a seat see what it mustn't (a
// stance included), a share out of turn or out of order, or a sharer who jettisons. Games past 100 rounds are reported,
// not failed; one still going at 500 is ended early and reported. Ends with the Parley outcomes and grab rates.
require('./rules.js');
const { RULES, BOTS, newGame, pick, allPicked, resolve, share, shareTurn, shared, jettison, allJettisoned, refill, nextRound, endEarly,
        botPick, botStance, botShare, botJettison, viewFor } = Rules;
const kinds = BOTS.personalities.map(b => b.name), fails = [], long = [], rounds = { jettison: [], freeze: [] };
const ends = { win: 0, bagOut: 0, unfinished: 0 };
let seed = 1, skipped = 0, jettisons = 0, fullBag = RULES.perColour;
const outcomes = { raid: 0, share: 0, grab: 0, crash: 0 }, stances = Object.fromEntries(kinds.map(k => [k, { grab: 0, all: 0 }]));
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the check's own chance: seat order and skips
// A view mustn't change when the hidden parts do: the bag, the seed, other seats' picks and jettisons this round, and older
// reveals until the end.
function leaks(state, seat) {
  const v = viewFor(state, seat), s = structuredClone(state), other = (q, x) => q !== seat && x;
  s.bag = s.bag.map(n => n + 7); s.rng ^= 1;
  s.picks = s.picks?.map((p, q) => (other(q, p !== null) ? (p + 1) % s.islands.length : p));
  s.stances = s.stances?.map((x, q) => (other(q, x !== null) ? (x === 'grab' ? 'share' : 'grab') : x));
  s.jettisons = s.jettisons?.map((j, q) => (other(q, j) ? { colour: j.colour + 1, island: j.island + 1 } : j));
  if (!s.winners) s.history = s.history.map((h, k) => (k < s.history.length - 1 ? { round: -1 } : h));
  return 'bag' in v || 'rng' in v || 'jettisons' in v || 'stances' in v || (!v.over && 'history' in v) || JSON.stringify(v) !== JSON.stringify(viewFor(s, seat));
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
  // Games 49, 99…: ended early in round 3, halfway through the picks; games 29, 79…: at their first jettison step;
  // games 38, 88…: at their first share step.
  RULES.perColour = g < 900 ? fullBag : 4;
  const n = 3 + (g % 3), people = g % 2 === 0, skips = g % 4 === 0, seats = [...Array(n).keys()];
  const rule = 'jettison', stopPicking = g % 50 === 49, stopJettison = g % 50 === 29, stopShare = g % 50 === 38; // prototypes play Jettison only (PI4 01)
  const state = newGame(seats.map(() => ''), seats.map(q => (people ? null : kinds[(g + q) % 3])), g * 7919 + 1, rule);
  const kind = q => (people ? kinds[q % 3] : kinds[(g + q) % 3]);
  const look = () => {
    seats.concat(null).forEach(q => { if (leaks(state, q)) throw Error(`viewFor leaks to seat ${q}`); });
    if (!counted(state)) throw Error('a token was lost or made up');
  };
  const stop = () => {
    if (!endEarly(state) || state.winners.length || !viewFor(state, 0).unfinished) throw Error('ending early failed');
    if (pick(state, 0, 0, 'share') || share(state, 0, 0) || shared(state) || jettison(state, 0, 0, 0) || nextRound(state) || refill(state)) throw Error('an ended game played on');
    if (endEarly(state)) throw Error('a game ended twice');
  };
  try {
    for (let r = 1; !state.winners; r++) {
      if (r > 100 && rule === 'freeze') throw Error('no end after 100 rounds');
      if (r > 500) { stop(); break; }
      look();
      for (const [k, q] of seats.toSorted(() => rnd() - 0.5).entries()) {
        if (stopPicking && r === 3 && k === Math.floor(n / 2)) { stop(); break; }
        if (skips && rnd() < 0.2) { skipped++; continue; }
        if (state.picks[q] === null) {
          const isl = botPick(state, q, kinds[q % 3]);
          if (pick(state, q, isl) || pick(state, q, isl, 'maybe')) throw Error('a pick without a stance was taken');
          if (!pick(state, q, isl, botStance(state, q, isl, kinds[q % 3]))) throw Error('a fair pick was refused');
        }
        if (pick(state, q, 0, 'share')) throw Error('a pick was changed');
        look();
      }
      if (state.winners) break;
      if (!skips && !allPicked(state)) throw Error('a seat has no pick');
      if (!resolve(state)) throw Error('resolve refused');
      look();
      if (state.share) {
        if (!people) throw Error('a bot-only share waited');
        if (nextRound(state) || refill(state)) throw Error('the round went on during the share');
        if (stopShare) { stop(); break; }
        for (const sh of state.share) {
          const hauls = sh.order.map(q => state.players[q].haul.reduce((a, b) => a + b, 0));
          if (hauls.some((t, k) => k && t < hauls[k - 1])) throw Error('a share not in fewest-pieces order');
        }
        for (let q = shareTurn(state); q !== null; q = shareTurn(state)) {
          const pile = state.islands[state.share[0].island];
          if (shared(state)) throw Error('a share ended early');
          if (seats.some(o => o !== q && share(state, o, pile.findIndex(Boolean)))) throw Error('a share out of turn');
          if (pile.some((x, c) => !x && share(state, q, c))) throw Error('a colour not on the pile was shared');
          if (!share(state, q, botShare(state, q))) throw Error('a fair share was refused');
          look();
        }
        // 'taken': the pile is shared until it's gone · 'stays': only full rounds, fewer leftovers than sharers
        const kept = (r, i) => state.islands[i].reduce((a, b) => a + b, 0) >= (Rules.PROTO.shareLeftover === 'stays' ? r.who.length : 1);
        if (state.history.at(-1).results.some((r, i) => r.kind === 'share' && kept(r, i))) throw Error('a share left the wrong treasure behind');
        if (!shared(state)) throw Error('shared refused');
        if (shared(state)) throw Error('shared twice');
        look();
      }
      if (state.jettisons) {
        if (rule === 'freeze') throw Error('a Freeze game jettisoned');
        if (nextRound(state)) throw Error('a round started before the jettisons');
        if (stopJettison) { stop(); break; }
        // At a Parley crash only the grabbers owe one; sharers never jettison
        const crashed = state.history.at(-1).results.flatMap(x => (x.kind === 'crash' ? x.grabbers ?? x.who : []));
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
    state.history.forEach(h => state.parley.forEach(i => {
      const r = h.results[i];
      if (r.kind !== 'empty') outcomes[r.kind]++;
      r.who.forEach(q => { stances[kind(q)].all++; if (h.stances[q] === 'grab') stances[kind(q)].grab++; });
    }));
    rounds[rule].push(state.round); ends[state.unfinished ? 'unfinished' : state.bagOut ? 'bagOut' : 'win']++;
    if (state.round > 100) long.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}): ${state.unfinished ? 'still going at 500 rounds, ended early' : `${state.round} rounds`}`);
  } catch (e) { fails.push(`game ${g} (${n} seats, ${rule}, seed ${g * 7919 + 1}, round ${state.round}): ${e.message}`); }
}
const span = a => `${Math.min(...a)}–${Math.max(...a)}, average ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}`;
console.log(`1000 games: ${fails.length} failures. Rounds: Jettison ${span(rounds.jettison)}.`,
            `Ended by a win ${ends.win}, by the bag ${ends.bagOut}, early ${ends.unfinished}. Seats skipped: ${skipped}. Jettisons: ${jettisons}.`);
const per = k => (outcomes[k] / 1000).toFixed(2);
console.log(`Parley per game: raid ${per('raid')}, share ${per('share')}, lone grab ${per('grab')}, grab crash ${per('crash')}.`,
            `Grab rate at Parley: ${kinds.map(k => `${k} ${Math.round(100 * stances[k].grab / stances[k].all)}%`).join(', ')}.`);
fails.slice(0, 10).forEach(f => console.log(' ', f));
if (long.length) console.log(`Jettison games past 100 rounds: ${long.length}`), long.forEach(l => console.log(' ', l));
process.exitCode = fails.length ? 1 : 0;
