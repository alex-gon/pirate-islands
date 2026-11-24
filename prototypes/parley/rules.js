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
  pickTimer: 60, nextTimer: 5, jettisonTimer: 30, // online only, in seconds: to pick, the reveal pause, to jettison. A room copies them at Start
};
// ---- Prototype: The Parley flag. This prototype's numbers, tunable; see the vault ticket "PI4 08 Parley Flag" ----
const PROTO = {
  parleyIslands: 1,        // islands that fly the flag, chosen at random at setup
  extraIsland: false,      // true: the Parley island is added on top of the usual one-per-player islands
  shareLeftover: 'taken',  // 'taken': share until the pile is empty · 'stays': only full rounds, leftovers stay (the Lagoon's way)
  grabberAloneTakes: 'all',// 'all': a lone grabber among sharers takes the whole pile (the only setting so far)
  sharersJettison: false,  // true: sharers who lose to a grab, or sit in a double-grab crash, jettison too
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
  parley: { Greedy: 0.7, Sneaky: 0.3, Wild: 0.5 }, // chance to Grab at Parley, by personality (PI4 08)
  parleyWin: 0.2,    // ...plus this if the Parley pile would win the game for the bot
  parleyWary: 0.2,   // ...minus this if a rival likely there shows ✊ from their last Parley visit
  parleyLikely: 0.4, // "likely there": the bot's estimate that a rival picks that island
  parleyRead: { grab: 0.7, share: 0.3, none: 0.5 }, // how likely a rival is to grab, read from their last-Parley badge
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
                  unfinished: false, maxIsland: RULES.startPile,
                  parley: [], stances: null, lastStance: names.map(() => null), share: null };
  const n = names.length + (PROTO.extraIsland ? PROTO.parleyIslands : 0);
  state.islands = [...Array(n)].map(() => draw(state, zeros(), RULES.startPile));
  // The Parley flag (PI4 08): the added islands, or islands at random. It doesn't move during a game.
  if (PROTO.extraIsland) state.parley = [...Array(n).keys()].slice(names.length);
  while (state.parley.length < Math.min(PROTO.parleyIslands, n)) {
    const i = Math.floor(rand(state) * n);
    if (!state.parley.includes(i)) state.parley.push(i);
  }
  state.parley.sort((a, b) => a - b);
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

// Every seat starts without a pick or stance (null), then the bot seats pick.
function startRound(state) {
  state.picks = state.players.map(() => null);
  state.stances = state.players.map(() => null);
  state.players.forEach((p, q) => { if (p.bot) { state.picks[q] = botPick(state, q); state.stances[q] = botStance(state, q, state.picks[q]); } });
}

// Records a pick and its stance, 'grab' or 'share', played with every pick and counted only at Parley. Refuses between
// rounds and once the game is over (picks is null then), a seat that has already picked (a pick is final), a seat or
// island that doesn't exist, and a missing stance.
function pick(state, seat, island, stance) {
  if (state.picks?.[seat] !== null || !Number.isInteger(island) || island < 0 || island >= state.islands.length
    || !['grab', 'share'].includes(stance)) return false;
  state.picks[seat] = island;
  state.stances[seat] = stance;
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

// "Spite", every bot and the stand-in alike: the token and island that cost least, adding what the token is worth to my
// haul to the most any rival's worth for that island grows (winPull counts, so it won't hand a rival the win). A random
// fraction breaks ties.
function botJettison(state, me) {
  const { players, islands } = state, haul = players[me].haul;
  const worth = (h, pile) => pile.reduce((a, n, c) => a + n * (1 + BOTS.sets * h[c]), 0) * (pile.some((n, c) => h[c] + n >= RULES.winAt) ? BOTS.winPull : 1);
  let best = null;
  haul.forEach((n, colour) => n && islands.forEach((pile, island) => {
    const after = pile.map((m, c) => m + (c === colour)), gain = players.map((p, q) => (q === me ? 0 : worth(p.haul, after) - worth(p.haul, pile)));
    const cost = 1 + BOTS.sets * (n - 1) + Math.max(...gain) + rand(state) / 100;
    if (!best || cost < best.cost) best = { cost, colour, island };
  }));
  return { colour: best.colour, island: best.island };
}

// "Guess the crowd": predict where each rival goes from their haul, score each island by (chance I'm there alone) x
// what its pile is worth to my haul ^greed, add the value of blocking a rival's winning island, then pick at weighted random.
// name defaults to the seat's own bot; the server passes one to play a dropped player's seat.
const wins = (state, q, i) => state.islands[i].some((n, c) => state.players[q].haul[c] + n >= RULES.winAt);
const alone = (lean, q, i) => lean.reduce((a, l, r) => (r === q ? a : a * (1 - l[i])), 1);
const worthTo = (state, q, i) => state.islands[i].reduce((a, n, c) => a + n * (1 + BOTS.sets * state.players[q].haul[c]), 0) * (wins(state, q, i) ? BOTS.winPull : 1);

// lean[q][i]: how likely seat q picks island i, from public info only. A naive rival chases what's worth most to its own
// haul, and its last pick; a canny one also dodges the naive crowd.
function crowd(state) {
  const { players, islands } = state, last = state.history.at(-1)?.picks || [], norm = w => { const t = total(w); return w.map(x => x / t); };
  const worth = (q, i) => worthTo(state, q, i);
  const naive = players.map((_, q) => norm(islands.map((_, i) => (worth(q, i) * (last[q] === i ? 1 + BOTS.habit : 1)) ** BOTS.herd)));
  const canny = players.map((_, q) => norm(islands.map((_, i) => alone(naive, q, i) * worth(q, i))));
  return naive.map((l, q) => l.map((x, i) => (1 - BOTS.canny) * x + BOTS.canny * canny[q][i]));
}

// The bot's chance to Grab at a Parley island: its personality's lean, up if the pile would win it the game, down if a
// rival likely there grabbed at their last Parley visit (the public badge).
function grabChance(state, lean, me, i, name) {
  const wary = state.players.some((_, q) => q !== me && state.lastStance[q] === 'grab' && lean[q][i] >= BOTS.parleyLikely);
  return Math.min(1, Math.max(0, BOTS.parley[name] + (wins(state, me, i) ? BOTS.parleyWin : 0) - (wary ? BOTS.parleyWary : 0)));
}

// The bot's chance of getting a Parley island's pile: alone, or a lone grab, or its part of a share split by the
// expected visitors. Rivals' grabbing is read from their last-Parley badge.
function parleyGet(state, lean, me, i, name) {
  const rivals = state.players.map((_, q) => q).filter(q => q !== me), g = grabChance(state, lean, me, i, name);
  const read = q => BOTS.parleyRead[state.lastStance[q] ?? 'none'];
  const noGrab = rivals.reduce((a, q) => a * (1 - lean[q][i] * read(q)), 1); // nobody else there grabs (or nobody's there)
  const visitors = rivals.reduce((a, q) => a + lean[q][i], 0);
  return alone(lean, me, i) + Math.max(0, noGrab - alone(lean, me, i)) * (g + (1 - g) / (1 + visitors));
}

function botPick(state, me, name = state.players[me].bot) {
  const { islands } = state, { greed, focus } = BOTS.personalities.find(b => b.name === name);
  const prev = state.history.at(-1), last = prev?.picks || []; // a skipped seat's pick is null: no habit pull, no burned island
  const crashed = prev?.results[last[me]]?.kind === 'crash' ? last[me] : -1;
  const worth = (q, i) => worthTo(state, q, i), lean = crowd(state);
  const best = Math.max(...islands.map((_, i) => worth(me, i))) ** greed;
  const weights = islands.map((_, i) => {
    const threat = 1 - lean.reduce((a, l, q) => (q !== me && wins(state, q, i) ? a * (1 - l[i]) : a), 1);
    const get = state.parley.includes(i) ? parleyGet(state, lean, me, i, name) : alone(lean, me, i);
    const value = get * worth(me, i) ** greed + BOTS.block * threat * best;
    return (value * (i === crashed ? BOTS.burned : 1)) ** focus;
  });
  let r = rand(state) * total(weights), i = 0;
  while (r > weights[i] && i < weights.length - 1) r -= weights[i++];
  return i;
}

// The bot's stance for its pick: at Parley, grab with grabChance; elsewhere it's ignored, so at random.
function botStance(state, me, island, name = state.players[me].bot) {
  const g = state.parley.includes(island) ? grabChance(state, crowd(state), me, island, name) : 0.5;
  return rand(state) < g ? 'grab' : 'share';
}

// The bot's take in a share step: the token on the pile worth most to its own haul. A random fraction breaks ties.
function botShare(state, me) {
  const pile = state.islands[state.share[0].island], haul = state.players[me].haul;
  let best = -1, colour = -1;
  pile.forEach((n, c) => {
    const v = (1 + BOTS.sets * haul[c]) * (haul[c] + 1 >= RULES.winAt ? BOTS.winPull : 1) + rand(state) / 100;
    if (n && v > best) { best = v; colour = c; }
  });
  return colour;
}

// The tie order: most of one colour, then most different colours, then most pieces; whoever is level at the top shares.
function leaders(state, seats) {
  const key = q => { const h = state.players[q].haul; return (Math.max(...h) * 10 + h.filter(Boolean).length) * 100 + total(h); };
  const best = Math.max(...seats.map(key));
  return seats.filter(q => key(q) === best);
}

// Resolve the round: raid, crash or unvisited per island; at a Parley island, by stance: alone a raid, all Share a
// share, exactly one Grab a grab (the grabber takes the pile), two or more Grabs a crash. A seat with no pick is
// skipped: it goes to no island. Afterwards it's between rounds (picks is null). A share opens the share step
// (state.share; bot seats take at once) and the round waits, before the winner check, until shared. Then settle.
function resolve(state) {
  const { players, islands, picks, stances } = state;
  if (!picks) return false;
  const take = (q, i) => { islands[i].forEach((n, c) => players[q].haul[c] += n); islands[i] = zeros(); };
  const results = islands.map((pile, i) => {
    const who = picks.flatMap((isl, q) => (isl === i ? [q] : [])), before = [...pile];
    if (who.length === 1) { take(who[0], i); return { kind: 'raid', who, before }; }
    if (!who.length) return { kind: 'empty', who, before };
    if (!state.parley.includes(i)) return { kind: 'crash', who, before };
    const grabbers = who.filter(q => stances[q] === 'grab');
    if (!grabbers.length) return { kind: 'share', who, before, takes: [] };
    if (grabbers.length === 1) { take(grabbers[0], i); return { kind: 'grab', who, before, grabbers }; }
    return { kind: 'crash', who, before, grabbers };
  });
  // Shares are settled after every raid and grab: taking turns, fewest pieces first (ties: seat order), 1 token each,
  // until the pile is empty ('taken'), or only full rounds with leftovers staying ('stays').
  const shares = results.flatMap((r, i) => {
    if (r.kind !== 'share') return [];
    const order = r.who.toSorted((a, b) => total(players[a].haul) - total(players[b].haul) || a - b), t = total(islands[i]);
    const left = PROTO.shareLeftover === 'stays' ? order.length * Math.floor(t / order.length) : t;
    return left ? [{ island: i, order, left, taken: 0 }] : [];
  });
  results.forEach((r, i) => { if (state.parley.includes(i)) r.who.forEach(q => (state.lastStance[q] = stances[q])); });
  results.forEach((r, i) => (r.after = [...islands[i]]));
  // the full record; players see it only once the game is over
  state.history.push({ round: state.round, picks: [...picks], stances: [...stances], results, jettisons: null });
  state.picks = null; state.stances = null; state.share = shares;
  botShares(state);
  if (!state.share.length) { state.share = null; settle(state); }
  return true;
}

const shareTurn = state => { const s = state.share?.[0]; return s ? s.order[s.taken % s.order.length] : null; };

// Bot seats take their turn in the share step at once, until it's a person's turn or every share is done.
function botShares(state) {
  for (let q = shareTurn(state); q !== null && state.players[q].bot; q = shareTurn(state)) share(state, q, botShare(state, q));
}

// Records a take in the share step: 1 token of a colour from the Parley pile. Refuses outside the share step, a seat
// whose turn it isn't, and a colour the pile doesn't hold. Then the bot seats take theirs.
function share(state, seat, colour) {
  const s = state.share?.[0];
  if (!s || shareTurn(state) !== seat || !(state.islands[s.island][colour] > 0)) return false;
  state.islands[s.island][colour]--; state.players[seat].haul[colour]++;
  state.history.at(-1).results[s.island].takes.push({ seat, colour });
  if (++s.taken === s.left) state.share.shift();
  if (!state.players[seat].bot) botShares(state);
  return true;
}

// Ends the share step once every share is done, then settles the round. The caller shares for a slow seat first.
function shared(state) {
  if (!state.share || state.share.length) return false;
  state.share = null;
  settle(state);
  return true;
}

// The rest of the round: check for a winner, then with Jettison, if a crasher who owes one has treasure, the round
// waits in the jettison step (bot seats jettison at once) until refill; otherwise it refills now. At a Parley crash only
// the grabbers owe one (unless sharersJettison, which also takes the sharers beaten by a lone grab).
function settle(state) {
  const { players, islands } = state, h = state.history.at(-1), results = h.results;
  const seats = players.map((_, q) => q), set = seats.filter(q => Math.max(...players[q].haul) >= RULES.winAt);
  if (set.length) state.winners = leaders(state, set);
  results.forEach((r, i) => (r.after = [...islands[i]]));
  const owes = (r, q) => r.who.includes(q) && (r.kind === 'crash' && (!r.grabbers || r.grabbers.includes(q) || PROTO.sharersJettison)
    || r.kind === 'grab' && PROTO.sharersJettison && !r.grabbers.includes(q));
  const owe = seats.map(q => results.some(r => owes(r, q)) && total(players[q].haul) > 0 && null);
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
  if (state.picks || state.share || state.jettisons || state.winners) return false;
  state.round++;
  startRound(state);
  return true;
}

// Ends the game early, in any phase and under either crash rule: unfinished, nobody wins, and the round in play is dropped.
function endEarly(state) {
  if (state.winners) return false;
  Object.assign(state, { winners: [], unfinished: true, picks: null, stances: null, share: null, jettisons: null });
  return true;
}

// What one seat may see, as a copy: never the bag or its count, another seat's pick, stance or jettison this round, or
// older reveals before the game is over. seat = null for a spectator. jettisoning: the seat still owes a jettison.
// Public: the Parley islands, each player's stance at their last Parley visit, and the share step.
function viewFor(state, seat) {
  const s = structuredClone(state), over = s.winners !== null;
  return { round: s.round, islands: s.islands, over, crashRule: s.crashRule, parley: s.parley, lastStance: s.lastStance,
           share: s.share, shareTurn: shareTurn(s), myStance: s.stances?.[seat] ?? null,
           players: s.players.map((p, q) => ({ name: p.name, haul: p.haul, bot: p.bot, picked: s.picks?.[q] != null,
                                               jettisoning: s.jettisons?.[q] === null })),
           myPick: s.picks?.[seat] ?? null, myJettison: s.jettisons?.[seat] || null, last: s.history.at(-1) ?? null,
           winners: s.winners, bagOut: s.bagOut, unfinished: s.unfinished,
           ...(over && { history: s.history, maxIsland: s.maxIsland }) };
}

globalThis.Rules = { RULES, PROTO, BOTS, newGame, pick, allPicked, resolve, share, shareTurn, shared, jettison, allJettisoned,
                     refill, nextRound, endEarly, botPick, botStance, botShare, botJettison, viewFor };
})();
