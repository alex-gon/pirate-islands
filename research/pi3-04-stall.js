// PI3 04: does Jettison stall the game? Bot-only games on rules.js as merged (Spite bots), random personalities.
// Run: node research/pi3-04-stall.js rules.js 10000   (output: research/pi3-04-stall-10k.txt). Throwaway branch, never merged.
require(require('path').resolve(process.argv[2]));
const { RULES, BOTS, newGame, resolve, refill, nextRound } = Rules;
const N = +process.argv[3] || 10000, kinds = BOTS.personalities.map(b => b.name), full = RULES.perColour;
let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];

function play(n, rule, seed, perColour) {
  RULES.perColour = perColour;
  const st = newGame(Array(n).fill(''), Array.from({ length: n }, () => kinds[Math.floor(rnd() * 3)]), seed, rule);
  let zeroDue = 0, emptyAt = null, emptyZeroRounds = 0, jet = 0, longestZeroRun = 0, run = 0;
  for (;;) {
    if (st.round > 2000) return { rounds: st.round, end: 'stalled', zeroDue, emptyAt, emptyZeroRounds, jet, longestZeroRun };
    resolve(st);
    if (st.jettisons) { jet += st.jettisons.filter(j => j).length; refill(st); }
    if (!st.bagOut && st.winners) return { rounds: st.round, end: 'win', zeroDue, emptyAt, emptyZeroRounds, jet, longestZeroRun };
    if (st.bagOut) return { rounds: st.round, end: 'bag', zeroDue, emptyAt, emptyZeroRounds, jet, longestZeroRun };
    const h = st.history.at(-1);
    const due = h.results.filter((r, i) => r.kind !== 'crash' && !h.jettisons?.some(j => j && j.island === i)).length;
    if (due === 0) { zeroDue++; run++; longestZeroRun = Math.max(longestZeroRun, run); if (emptyAt !== null) emptyZeroRounds++; } else run = 0;
    if (emptyAt === null && st.bag.every(x => x === 0)) emptyAt = st.round;
    nextRound(st);
  }
}

function row(n, rule, perColour) {
  const g = Array.from({ length: N }, (_, k) => play(n, rule, k * 7919 + n, perColour));
  const r = g.map(x => x.rounds).sort((a, b) => a - b), totalRounds = r.reduce((a, b) => a + b, 0);
  const pct = x => (100 * x).toFixed(1) + '%', empt = g.filter(x => x.emptyAt !== null);
  return {
    seats: n, rule, bag: perColour * 5, p50: q(r, 0.5), p99: q(r, 0.99), max: r.at(-1), avg: (totalRounds / N).toFixed(1),
    over100: g.filter(x => x.rounds > 100).length, stalled: g.filter(x => x.end === 'stalled').length,
    zeroDue: pct(g.reduce((a, x) => a + x.zeroDue, 0) / totalRounds), longestZeroRun: Math.max(...g.map(x => x.longestZeroRun)),
    win: pct(g.filter(x => x.end === 'win').length / N), bagOut: pct(g.filter(x => x.end === 'bag').length / N),
    bagEmptied: pct(empt.length / N), roundsAfterEmpty: empt.length ? Math.max(...empt.map(x => x.rounds - x.emptyAt)) : '–',
  };
}

const rows = [];
for (const perColour of [full, 8, 6, 4]) for (const n of [3, 4, 5]) for (const rule of ['jettison', 'freeze']) rows.push(row(n, rule, perColour));
console.table(rows);
