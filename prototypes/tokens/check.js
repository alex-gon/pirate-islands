// The bot check for the Doubloons and skulls prototype (PI4 05): 1,000 bot-only games across 3–5 seats and seeds, all on
// Jettison, the first 500 with PROTO.skullsPass false (the default) and the last 500 with it true. Run: node check.js
// Fails a game that throws or doesn't end by 500 rounds, a lost or made-up token (bag + islands + hauls + locker = 85), a
// skull left in a haul between rounds, a win the Doubloon cap doesn't allow, a wrong jettison count, or a view that lets a
// seat see what it mustn't. Jettison games past 100 rounds are reported, not failed.
require('./rules.js');
const { RULES, PROTO, BOTS, D, X, REAL, inGame, best, owing, newGame, pick, allPicked, resolve, jettison, allJettisoned, refill,
        nextRound, endEarly, botPick, botJettison, viewFor } = Rules;
const kinds = BOTS.personalities.map(b => b.name), fails = [], long = [];
const fullBag = RULES.perColour, stats = [false, true].map(() => ({ games: 0, rounds: [], ends: { win: 0, bagOut: 0, unfinished: 0 },
  wildWins: 0, wins: 0, skulls: 0, skullRaids: [], jettisons: 0 }));
let seed = 1, skipped = 0;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // the check's own chance: seat order and skips
// A view mustn't change when the hidden parts do: the bag, the seed, other seats' picks and jettisons this round, and older
// reveals until the end.
function leaks(state, seat) {
  const v = viewFor(state, seat), s = structuredClone(state), other = (q, x) => q !== seat && x;
  s.bag = s.bag.map(n => n + 7); s.rng ^= 1;
  s.picks = s.picks?.map((p, q) => (other(q, p !== null) ? (p + 1) % s.islands.length : p));
  s.jettisons = s.jettisons?.map((j, q) => (other(q, j && !owing(j)) ? { ...j, colours: j.colours.map(c => c + 1), island: j.island + 1 } : j));
  if (!s.winners) s.history = s.history.map((h, k) => (k < s.history.length - 1 ? { round: -1 } : h));
  return 'bag' in v || 'rng' in v || 'jettisons' in v || (!v.over && 'history' in v) || JSON.stringify(v) !== JSON.stringify(viewFor(s, seat));
}
// Every token is in the bag, on an island, in a haul or (skulls) in the locker, none is negative, and they add up to 85.
const counted = state => RULES.treasure.every((_, c) => {
  const all = [state.bag, ...state.islands, ...state.players.map(p => p.haul)].map(a => a[c]).concat(c === X ? [state.locker] : []);
  return all.every(n => n >= 0) && all.reduce((a, b) => a + b, 0) === inGame(c);
});
const sum = a => a.reduce((x, y) => x + y, 0);
for (let g = 0; g < 1000; g++) {
  // Odd games: every seat a bot. Even games: every seat picked and jettisoned through pick() and jettison() by a named bot, in
  // random order; every other even game also skips each seat 1 time in 5, and Sneaky jettisons for a skipped jettison, as
  // online. Games 400–499 and 900–999 use a bag of 4 per colour, so it runs out.
  // Games 49, 99…: ended early in round 3, halfway through the picks; games 29, 79…: at their first jettison step.
  PROTO.skullsPass = g >= 500;
  const st = stats[+PROTO.skullsPass];
  RULES.perColour = g % 500 < 400 ? fullBag : 4;
  const n = 3 + (g % 3), people = g % 2 === 0, skips = g % 4 === 0, seats = [...Array(n).keys()];
  const rule = 'jettison', stopPicking = g % 50 === 49, stopJettison = g % 50 === 29; // prototypes play Jettison only (PI4 01)
  const state = newGame(seats.map(() => ''), seats.map(q => (people ? null : kinds[(g + q) % 3])), g * 7919 + 1, rule);
  if (sum(state.bag) + sum(state.islands.map(sum)) !== RULES.perColour * REAL.length + PROTO.doubloons + PROTO.skulls) fails.push(`game ${g}: not 85 tokens`);
  const look = () => {
    seats.concat(null).forEach(q => { if (leaks(state, q)) throw Error(`viewFor leaks to seat ${q}`); });
    if (!counted(state)) throw Error('a token was lost or made up');
    if (!state.jettisons && state.players.some(p => p.haul[X])) throw Error('a skull stayed in a haul');
  };
  const stop = () => {
    if (!endEarly(state) || state.winners.length || !viewFor(state, 0).unfinished) throw Error('ending early failed');
    if (pick(state, 0, 0) || jettison(state, 0, [0], 0) || nextRound(state) || refill(state)) throw Error('an ended game played on');
    if (endEarly(state)) throw Error('a game ended twice');
  };
  try {
    for (let r = 1; !state.winners; r++) {
      if (r > 500) throw Error('no end after 500 rounds');
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
      const piles = state.islands.map(p => [...p]), picks = [...state.picks], held = state.players.map(p => p.haul.filter((_, c) => c !== X).reduce((a, b) => a + b, 0));
      if (!resolve(state)) throw Error('resolve refused');
      const res = state.history.at(-1).results;
      // What each seat should owe: 1 for a crash with treasure; per skull raided, skullCost (capped at treasures held), or with
      // skullsPass exactly its skulls; nothing in a won round.
      const due = seats.map(q => {
        const r = res[picks[q]];
        if (!r || state.winners) return 0;
        const gained = r.kind === 'raid' ? piles[picks[q]].filter((_, c) => c !== X).reduce((a, b) => a + b, 0) : 0, sk = r.kind === 'raid' ? piles[picks[q]][X] : 0;
        return r.kind === 'crash' ? Math.min(1, held[q]) : PROTO.skullsPass ? sk : Math.min(sk * PROTO.skullCost, held[q] + gained);
      });
      res.forEach((x, i) => {
        if (x.kind !== 'raid' || !piles[i][X]) return;
        st.skulls += piles[i][X]; st.skullRaids.push(sum(piles[i]));
      });
      if (state.winners) {
        state.winners.forEach(q => { const h = state.players[q].haul; if (!state.bagOut && Math.max(...REAL.map(c => h[c])) < RULES.winAt - PROTO.wildCap) throw Error('a win broke the Doubloon cap'); });
      }
      look();
      if (state.jettisons) {
        if (nextRound(state)) throw Error('a round started before the jettisons');
        if (stopJettison) { stop(); break; }
        seats.forEach(q => {
          const j = state.jettisons[q], owes = j ? j.owed : 0;
          if (owes !== due[q]) throw Error(`seat ${q} owes ${owes}, not ${due[q]}`);
          if (!owes && jettison(state, q, [state.players[q].haul.findIndex(Boolean)], 0)) throw Error('a seat that owed none jettisoned');
        });
        for (const q of seats.toSorted(() => rnd() - 0.5)) {
          const j = state.jettisons[q];
          if (!owing(j)) continue;
          const h = state.players[q].haul;
          if (h.some((x, c) => !x && jettison(state, q, Array(j.owed).fill(c), 0))) throw Error('a colour not held was jettisoned');
          if (jettison(state, q, Array(j.owed + 1).fill(h.findIndex(Boolean)), 0)) throw Error('a jettison of the wrong size was taken');
          if (!j.pass && h[X] === 0 && jettison(state, q, Array(j.owed).fill(X), 0)) throw Error('a skull was jettisoned as treasure');
          if (refill(state)) throw Error('refill came before every jettison');
          const b = skips && rnd() < 0.2 ? botJettison(state, q, 'Sneaky') : botJettison(state, q, kinds[q % 3]);
          if (!jettison(state, q, b.colours, b.island)) throw Error('a fair jettison was refused');
          if (jettison(state, q, b.colours, (b.island + 1) % n)) throw Error('a jettison was changed');
          if (j.owed > 1 && new Set([b.island]).size !== 1) throw Error('a jettison split across islands');
          look();
        }
        if (!allJettisoned(state)) throw Error('a jettison is missing');
        if (!refill(state)) throw Error('refill refused');
        if (refill(state)) throw Error('refilled twice');
        st.jettisons += state.history.at(-1).jettisons.filter(Boolean).reduce((a, j) => a + j.colours.length, 0);
        look();
      }
      if (!state.winners && !nextRound(state)) throw Error('nextRound refused');
    }
    st.games++; st.rounds.push(state.round); st.ends[state.unfinished ? 'unfinished' : state.bagOut ? 'bagOut' : 'win']++;
    if (!state.unfinished && !state.bagOut) {
      st.wins++;
      if (state.winners.some(q => { const h = state.players[q].haul; return Math.max(...REAL.map(c => h[c])) < RULES.winAt && h[D]; })) st.wildWins++;
    }
    if (state.round > 100) long.push(`game ${g} (${n} seats, seed ${g * 7919 + 1}, skullsPass ${PROTO.skullsPass}): ${state.round} rounds`);
  } catch (e) { fails.push(`game ${g} (${n} seats, skullsPass ${PROTO.skullsPass}, seed ${g * 7919 + 1}, round ${state.round}): ${e.message}`); }
}
const avg = a => (a.length ? sum(a) / a.length : 0).toFixed(1);
const span = a => `${Math.min(...a)}–${Math.max(...a)}, average ${avg(a)}`;
console.log(`1000 games: ${fails.length} failures. Seats skipped: ${skipped}.`);
stats.forEach((s, k) => console.log(`  skullsPass ${!!k} (${s.games} games): rounds ${span(s.rounds)}. Ended by a win ${s.ends.win}, by the bag ${s.ends.bagOut},`,
  `early ${s.ends.unfinished}. Wins using Doubloons: ${s.wildWins} of ${s.wins}. Skulls taken per game: ${(s.skulls / s.games).toFixed(2)}.`,
  `Pile size at a skull raid: average ${avg(s.skullRaids)} (${s.skullRaids.length} raids). Tokens jettisoned: ${s.jettisons}.`));
fails.slice(0, 10).forEach(f => console.log(' ', f));
if (long.length) console.log(`Jettison games past 100 rounds: ${long.length}`), long.forEach(l => console.log(' ', l));
process.exitCode = fails.length ? 1 : 0;
