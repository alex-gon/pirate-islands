// Pirate Islands rules and bots, shared by the hotseat page, the server and the bot check.
// A classic script: loading it sets globalThis.Rules. Every function takes the game state, a plain
// JSON-safe object, and changes it in place; nothing here reads a global game. Words: CONTEXT.md.
(() => {
// ---- Rules: change these numbers to try a variant ----
const RULES = {
  treasure: [ // the colours; mark is the letter on each token so colour isn't the only cue
    { name: 'Rubies', one: 'Ruby', mark: 'R', ink: '#ef5350' },
    { name: 'Emeralds', one: 'Emerald', mark: 'E', ink: '#66bb6a' },
    { name: 'Sapphires', one: 'Sapphire', mark: 'S', ink: '#64b5f6' },
    { name: 'Gold', one: 'Gold', mark: 'G', ink: '#ffd54f' },
    { name: 'Pearls', one: 'Pearl', mark: 'P', ink: '#ffffff' },
  ],
  perColour: 15, // tokens of each colour in the bag; drawn blind, never returned
  startPile: 2,  // tokens drawn onto every island at setup
  refill: 1,     // tokens drawn onto every island that didn't crash or get a jettison; a bag too short to refill them all ends the game
  winAt: 5,      // of one colour, checked after each round. Ties: most of own best colour → most colours → most pieces → share
  minPlayers: 3, maxPlayers: 5,
  pickTimer: 60, nextTimer: 5, // online only, in seconds: to pick, then the reveal pause. A room copies them at Start
};
// ---- Bots: tuning for computer seats. A bot reads only public info: piles, hauls, last round's reveal ----
const BOTS = {
  sets: 2,      // a token is worth 1, plus this much per token of its colour the player already holds
  winPull: 3,   // how much more an island counts when taking it would win the game
  herd: 3,      // a bot expects each rival to lean toward the piles worth most to that rival's haul; higher = more sure of it
  habit: 0.5,   // ...plus this extra pull toward their last pick
  canny: 0.5,   // share of rivals the bot expects to also dodge that crowd (0 = all naive, 1 = all canny)
  block: 1,     // how much a bot values crashing an island a rival would win on, against its own best island
  burned: 0.75, // a bot that crashed on an island last round values it this much as usual (1 = no memory)
  personalities: [ // greed: how much a bigger pile beats a safer one · focus: higher = sticks to its best guess, lower = more random
    { name: 'Greedy', greed: 2.5, focus: 2 },
    { name: 'Sneaky', greed: 0.5, focus: 2 },
    { name: 'Wild', greed: 2, focus: 1 },
  ],
};
const zeros = () => RULES.treasure.map(() => 0); // a pile, haul or bag: one count per colour
const total = a => a.reduce((x, y) => x + y, 0);

// mulberry32: the game's only source of chance, kept in state.rng so a saved game carries on exactly.
function rand(state) {
  let t = state.rng = (state.rng + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// bots[i]: a personality name, or null for a person. A blank name becomes 'Player N'. crashRule: 'jettison' (v0.3,
// each crasher puts 1 treasure from their haul onto any island) or 'freeze' (v0.2, a crashed island just gets no token).
function newGame(names, bots, seed, crashRule = 'jettison') {
  const state = { players: names.map((name, i) => ({ name: name.trim() ? name : `Player ${i + 1}`, haul: zeros(), bot: bots[i] ?? null })),
                  islands: [], bag: RULES.treasure.map(() => RULES.perColour), rng: seed | 0, round: 1, picks: null, jettisons: null,
                  crashRule: crashRule === 'freeze' ? 'freeze' : 'jettison', history: [], winners: null, bagOut: false,
                  unfinished: false, maxIsland: RULES.startPile };
  state.islands = names.map(() => draw(state, zeros(), RULES.startPile));
  startRound(state);
  return state;
}

// Draw n tokens blind from the bag onto a pile.
function draw(state, pile, n) {
  for (let k = 0; k < n; k++) {
    let r = rand(state) * total(state.bag), c = 0;
    while (r >= state.bag[c]) r -= state.bag[c++];
    state.bag[c]--; pile[c]++;
  }
  return pile;
}

// Every seat starts without a pick (null), then the bot seats pick.
function startRound(state) {
  state.picks = state.players.map(() => null);
  state.players.forEach((p, q) => { if (p.bot) state.picks[q] = botPick(state, q); });
}

// Records a pick. Refuses between rounds and once the game is over (picks is null then), a seat that
// has already picked (a pick is final), and a seat or island that doesn't exist.
function pick(state, seat, island) {
  if (state.picks?.[seat] !== null || !Number.isInteger(island) || island < 0 || island >= state.islands.length) return false;
  state.picks[seat] = island;
  return true;
}

const allPicked = state => !!state.picks?.every(p => p !== null);

// Records a jettison: 1 token of a colour in the seat's haul, onto any island. Refuses outside the jettison step, a seat
// that owes none or has already jettisoned (final, like a pick), and a colour it doesn't hold or an island that doesn't exist.
// The token stays in the haul until every jettison is revealed together, in refill.
function jettison(state, seat, colour, island) {
  if (state.jettisons?.[seat] !== null || !(state.players[seat].haul[colour] > 0)
    || !Number.isInteger(island) || island < 0 || island >= state.islands.length) return false;
  state.jettisons[seat] = { colour, island };
  return true;
}

// jettisons[q]: false if seat q owes none, null until it jettisons, then { colour, island }.
const allJettisoned = state => !!state.jettisons?.every(j => j !== null);

// Placeholder until PI3 03 decides how bots jettison: the colour it holds fewest of, onto a random island.
function botJettison(state, me) {
  const haul = state.players[me].haul, held = haul.filter(Boolean);
  return { colour: haul.indexOf(Math.min(...held)), island: Math.floor(rand(state) * state.islands.length) };
}

// "Guess the crowd": predict where each rival goes from their haul, score each island by (chance I'm there alone) x
// what its pile is worth to my haul ^greed, add the value of blocking a rival's winning island, then pick at weighted random.
// name defaults to the seat's own bot; the server passes one to play a dropped player's seat.
function botPick(state, me, name = state.players[me].bot) {
  const { players, islands } = state, { greed, focus } = BOTS.personalities.find(b => b.name === name);
  const prev = state.history.at(-1), last = prev?.picks || []; // a skipped seat's pick is null: no habit pull, no burned island
  const crashed = prev?.results[last[me]]?.kind === 'crash' ? last[me] : -1, norm = w => { const t = total(w); return w.map(x => x / t); };
  const wins = (q, i) => islands[i].some((n, c) => players[q].haul[c] + n >= RULES.winAt);
  const worth = (q, i) => islands[i].reduce((a, n, c) => a + n * (1 + BOTS.sets * players[q].haul[c]), 0) * (wins(q, i) ? BOTS.winPull : 1);
  const alone = (lean, q, i) => lean.reduce((a, l, r) => (r === q ? a : a * (1 - l[i])), 1);
  // A naive rival chases what's worth most to its own haul, and its last pick; a canny one also dodges the naive crowd.
  const naive = players.map((_, q) => norm(islands.map((_, i) => (worth(q, i) * (last[q] === i ? 1 + BOTS.habit : 1)) ** BOTS.herd)));
  const canny = players.map((_, q) => norm(islands.map((_, i) => alone(naive, q, i) * worth(q, i))));
  const lean = naive.map((l, q) => l.map((x, i) => (1 - BOTS.canny) * x + BOTS.canny * canny[q][i]));
  const best = Math.max(...islands.map((_, i) => worth(me, i))) ** greed;
  const weights = islands.map((_, i) => {
    const threat = 1 - lean.reduce((a, l, q) => (q !== me && wins(q, i) ? a * (1 - l[i]) : a), 1);
    const value = alone(lean, me, i) * worth(me, i) ** greed + BOTS.block * threat * best;
    return (value * (i === crashed ? BOTS.burned : 1)) ** focus;
  });
  let r = rand(state) * total(weights), i = 0;
  while (r > weights[i] && i < weights.length - 1) r -= weights[i++];
  return i;
}

// The tie order: most of one colour, then most different colours, then most pieces; whoever is level at the top shares.
function leaders(state, seats) {
  const key = q => { const h = state.players[q].haul; return (Math.max(...h) * 10 + h.filter(Boolean).length) * 100 + total(h); };
  const best = Math.max(...seats.map(key));
  return seats.filter(q => key(q) === best);
}

// Resolve the round: raid, crash or unvisited per island, then check for a winner. A seat with no pick is skipped: it
// goes to no island. Afterwards it's between rounds (picks is null). With Jettison, if a crasher has treasure, the round
// waits in the jettison step (bot seats jettison at once) until refill; otherwise it refills now.
function resolve(state) {
  const { players, islands, picks } = state;
  if (!picks) return false;
  const results = islands.map((pile, i) => {
    const who = picks.flatMap((isl, q) => (isl === i ? [q] : []));
    if (who.length === 1) { pile.forEach((n, c) => players[who[0]].haul[c] += n); islands[i] = zeros(); }
    return { kind: who.length === 1 ? 'raid' : who.length ? 'crash' : 'empty', who, before: [...pile] };
  });
  const seats = players.map((_, q) => q), set = seats.filter(q => Math.max(...players[q].haul) >= RULES.winAt);
  if (set.length) state.winners = leaders(state, set);
  results.forEach((r, i) => (r.after = [...islands[i]]));
  state.history.push({ round: state.round, picks: [...picks], results, jettisons: null }); // the full record; players see it only once the game is over
  state.picks = null;
  const owe = seats.map(q => results.some(r => r.kind === 'crash' && r.who.includes(q)) && total(players[q].haul) > 0 && null);
  if (!state.winners && state.crashRule === 'jettison' && owe.includes(null)) {
    state.jettisons = owe;
    players.forEach((p, q) => { if (p.bot && owe[q] === null) state.jettisons[q] = botJettison(state, q); });
  } else finish(state);
  return true;
}

// Ends the jettison step once every crasher who owes one has jettisoned; the caller jettisons for a slow seat first.
function refill(state) {
  if (!allJettisoned(state)) return false;
  finish(state);
  return true;
}

// Reveal every jettison together, moving each token from its haul onto its island, then refill every island that didn't
// crash or get a jettison. The bag-out check counts only those: 0 due draws nothing and play goes on. A won round draws nothing.
function finish(state) {
  const { players, islands, bag, jettisons } = state, h = state.history.at(-1);
  jettisons?.forEach((j, q) => { if (j) { players[q].haul[j.colour]--; islands[j.island][j.colour]++; } });
  const due = islands.filter((_, i) => h.results[i].kind !== 'crash' && !jettisons?.some(j => j && j.island === i));
  if (!state.winners) {
    if (total(bag) < due.length * RULES.refill) { state.winners = leaders(state, players.map((_, q) => q)); state.bagOut = true; }
    else due.forEach(pile => draw(state, pile, RULES.refill));
  }
  h.results.forEach((r, i) => (r.after = [...islands[i]]));
  if (jettisons) h.jettisons = jettisons.map(j => j || null);
  state.maxIsland = Math.max(state.maxIsland, ...islands.map(total));
  state.jettisons = null;
}

function nextRound(state) {
  if (state.picks || state.jettisons || state.winners) return false;
  state.round++;
  startRound(state);
  return true;
}

// Ends the game early, in any phase and under either crash rule: unfinished, nobody wins, and the round in play is dropped.
function endEarly(state) {
  if (state.winners) return false;
  Object.assign(state, { winners: [], unfinished: true, picks: null, jettisons: null });
  return true;
}

// What one seat may see, as a copy: never the bag or its count, another seat's pick or jettison this round, or older
// reveals before the game is over. seat = null for a spectator. jettisoning: the seat still owes a jettison.
function viewFor(state, seat) {
  const s = structuredClone(state), over = s.winners !== null;
  return { round: s.round, islands: s.islands, over, crashRule: s.crashRule,
           players: s.players.map((p, q) => ({ name: p.name, haul: p.haul, bot: p.bot, picked: s.picks?.[q] != null,
                                               jettisoning: s.jettisons?.[q] === null })),
           myPick: s.picks?.[seat] ?? null, myJettison: s.jettisons?.[seat] || null, last: s.history.at(-1) ?? null,
           winners: s.winners, bagOut: s.bagOut, unfinished: s.unfinished,
           ...(over && { history: s.history, maxIsland: s.maxIsland }) };
}

globalThis.Rules = { RULES, BOTS, newGame, pick, allPicked, resolve, jettison, allJettisoned, refill, nextRound, endEarly,
                     botPick, botJettison, viewFor };
})();
