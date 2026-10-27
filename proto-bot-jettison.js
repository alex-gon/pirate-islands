// PROTOTYPE (PI3 03), throwaway: how should bots jettison, and how crash-shy should they pick? Not part of the game.
// Loads rules.js with botJettison and botPick's value line swapped per variant, plays bot-only games, prints a table.
// Run: node proto-bot-jettison.js [games per seat count, default 1000]
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/rules.js', 'utf8');
const N = +process.argv[2] || 1000;

// Jettison rules. All read only public info: hauls and piles. myLoss: what the token is worth to me now.
const J = {
  // the placeholder in rules.js: the colour I hold fewest of, onto a random island
  placeholder: `const haul = state.players[me].haul, held = haul.filter(Boolean);
    return { colour: haul.indexOf(Math.min(...held)), island: Math.floor(rand(state) * state.islands.length) };`,
  // Spite: the token and island that cost me least plus help any rival least (a rival's gain counts winPull if it hands them a win)
  spite: `return bestJ(state, me, (c, i, loss, gain) => -(loss + P.spite * gain(c, i)));`,
  // Stash: the token that costs me least, onto the island I'd most like to raid after it lands (to win it back)
  stash: `return bestJ(state, me, (c, i, loss, gain, mine) => -loss * 100 + mine(c, i));`,
  // Stash, but away from islands a rival would most like: my value after it lands minus the best rival's
  stashSpite: `return bestJ(state, me, (c, i, loss, gain, mine) => -loss * 100 + mine(c, i) - P.spite * rivalWorth(c, i));`,
};
const helpers = `
function bestJ(state, me, score) {
  const { players, islands } = state, haul = players[me].haul;
  const w = (h, pile) => pile.reduce((a, n, c) => a + n * (1 + BOTS.sets * h[c]), 0) * (pile.some((n, c) => h[c] + n >= RULES.winAt) ? BOTS.winPull : 1);
  const plus = (pile, c) => pile.map((n, k) => n + (k === c));
  const less = c => haul.map((n, k) => n - (k === c));
  const gain = (c, i) => Math.max(...players.map((p, q) => q === me ? 0 : w(p.haul, plus(islands[i], c)) - w(p.haul, islands[i])));
  globalThis.rivalWorth = (c, i) => Math.max(...players.map((p, q) => q === me ? 0 : w(p.haul, plus(islands[i], c))));
  const mine = (c, i) => w(less(c), plus(islands[i], c));
  let best = null;
  haul.forEach((n, c) => { if (!n) return; const loss = 1 + BOTS.sets * (n - 1);
    islands.forEach((_, i) => { const s = score(c, i, loss, gain, mine) + rand(state) * 1e-6; if (!best || s > best.s) best = { s, colour: c, island: i }; }); });
  return { colour: best.colour, island: best.island };
}`;
// Crash-shy picking, under Jettison only: before greed, lower my worth for the island by (chance I'm not alone) x shy x my
// cheapest token's worth. shy 0 is botPick exactly as in rules.js.
const shyValue = `const held = players[me].haul.filter(Boolean), cheap = held.length ? 1 + BOTS.sets * (Math.min(...held) - 1) : 0;
    const shy = state.crashRule === 'jettison' ? P.shy * (1 - alone(lean, me, i)) * cheap : 0;
    const value = alone(lean, me, i) * Math.max(1e-9, worth(me, i) - shy) ** greed + BOTS.block * threat * best;`;

function load(jRule, P) {
  let s = jRule === 'asIs' ? src : src.replace(/(function botJettison\(state, me\) \{)[\s\S]*?\n\}/, `$1\n${J[jRule]}\n}\n${helpers}`)
             .replace(/const value = alone\(lean, me, i\).*;/, shyValue);
  const ctx = { P, structuredClone, Math }; ctx.globalThis = ctx;
  vm.runInNewContext(s, ctx);
  return ctx.Rules;
}

function play(R, rule, n, seed) {
  const kinds = R.BOTS.personalities.map(b => b.name);
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const bots = Array.from({ length: n }, () => kinds[Math.floor(rnd() * 3)]);
  const st = R.newGame(bots.map(() => ''), bots, seed, rule);
  let crashes = 0, jets = 0, ownIsland = 0, zeroDue = 0;
  while (!st.winners && st.round <= 500) {
    R.resolve(st);
    const h = st.history.at(-1), crashed = h.results.map((x, i) => x.kind === 'crash' ? i : -1).filter(i => i >= 0);
    crashes += crashed.length;
    if (st.jettisons) {
      st.jettisons.forEach((j, q) => { if (j) { jets++; if (j.island === h.picks[q]) ownIsland++; } });
      R.refill(st);
      if (h.results.every((x, i) => x.kind === 'crash' || h.jettisons.some(j => j && j.island === i))) zeroDue++;
    }
    if (!st.winners) R.nextRound(st);
  }
  if (!st.winners) R.endEarly(st);
  const ws = st.winners;
  return { rounds: st.history.length, crashes, jets, ownIsland, zeroDue, bagOut: st.bagOut, stuck: st.unfinished, maxIsland: st.maxIsland,
           winBy: bots.map((b, q) => [b, ws.includes(q) ? 1 / ws.length : 0]), n };
}

const variants = [
  ['rules.js as committed', 'jettison', 'asIs', { shy: 0 }],
  ['Freeze (v0.2)', 'freeze', 'placeholder', { shy: 0 }],
  ['Placeholder', 'jettison', 'placeholder', { shy: 0 }],
  ['Spite', 'jettison', 'spite', { spite: 1, shy: 0 }],
  ['Spite, shy 1', 'jettison', 'spite', { spite: 1, shy: 1 }],
  ['Stash', 'jettison', 'stash', { shy: 0 }],
    ['Stash+spite', 'jettison', 'stashSpite', { spite: 1, shy: 0 }],
  ['Spite, shy 3', 'jettison', 'spite', { spite: 1, shy: 3 }],
  ['Spite, shy 10', 'jettison', 'spite', { spite: 1, shy: 10 }],
];
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x, d = 1) => x.toFixed(d);
console.log(`${N} games at each of 3, 4, 5 seats per row; random personalities per seat; same seeds for every row.\n`);
console.log('| Variant | Rounds avg | p50 / p99 / max | >100 | Crashes/round | Jettisons/game | onto own crash | 0 due | Bag-out | Max island avg | Greedy | Sneaky | Wild |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [label, rule, jr, P] of variants) {
  const R = load(jr, P), games = [];
  for (const n of [3, 4, 5]) for (let g = 0; g < N; g++) games.push(play(R, rule, n, n * 100003 + g * 7919 + 1));
  const rounds = games.map(g => g.rounds), sum = k => games.reduce((a, g) => a + g[k], 0);
  const win = {}, fair = {};
  games.forEach(g => g.winBy.forEach(([b, w]) => { win[b] = (win[b] || 0) + w; fair[b] = (fair[b] || 0) + (g.stuck ? 0 : 1 / g.n); }));
  const share = b => f(win[b] / fair[b], 2);
  console.log(`| ${label} | ${f(sum('rounds') / games.length)} | ${pct(rounds, .5)} / ${pct(rounds, .99)} / ${Math.max(...rounds)} | ${rounds.filter(x => x > 100).length} | ${f(sum('crashes') / sum('rounds'), 2)} | ${f(sum('jets') / games.length)} | ${f(100 * sum('ownIsland') / Math.max(1, sum('jets')), 0)}% | ${f(100 * sum('zeroDue') / sum('rounds'), 1)}% | ${f(100 * sum('bagOut') / games.length, 0)}% | ${f(sum('maxIsland') / games.length)} | ${share('Greedy')} | ${share('Sneaky')} | ${share('Wild')} |`);
}
console.log('\nGreedy/Sneaky/Wild: share of wins against a fair share (1.00 = wins as often as its seats would by chance).');
