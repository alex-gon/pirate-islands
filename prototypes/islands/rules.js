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
// ---- Prototype: Island personalities. This prototype's numbers, tunable; see the vault ticket "PI4 03 Island Personalities" ----
// Each tile: start, refill (tokens drawn at setup and on refill); crash: 'share' (Lagoon) or 'destroy' (Volcano); alwaysGrows
// (refills even when crashed or jettisoned onto); raidBonus (a lone raider draws this many more, none if the bag is empty);
// hidden (bag-drawn tokens show only as a count); jettison (owed per crasher, default 1). Keep at least maxPlayers rows.
const PROTO = {
  islands: [ // the tile deck; deal one per island. Edit a number to retune a tile, remove a row to leave it out
    { key: 'lagoon',  name: 'Calm Lagoon',    icon: '🏝️', start: 2, refill: 1, crash: 'share',   says: 'Crash here? Share the pile instead.' },
    { key: 'volcano', name: 'Volcano',        icon: '🌋', start: 2, refill: 2, crash: 'destroy', says: 'Grows by 2. A crash here destroys the pile.' },
    { key: 'reef',    name: 'Shipwreck Reef', icon: '⚓', start: 2, refill: 1, alwaysGrows: true, says: 'Always grows, even after a crash.' },
    { key: 'cove',    name: 'Treasure Cove',  icon: '💎', start: 2, refill: 1, raidBonus: 1,      says: 'Raid it alone: take 1 more from the bag.' },
    { key: 'den',     name: "Smugglers' Den", icon: '🕳️', start: 2, refill: 1, hidden: true,      says: 'Its treasure is hidden.' },
    { key: 'skull',   name: 'Skull Rock',     icon: '💀', start: 2, refill: 1, jettison: 2,       says: 'Crash here: jettison 2.' },
    { key: 'sandbar', name: 'Sandbar',        icon: '🏖️', start: 2, refill: 0, jettison: 0,       says: 'Never grows. Crashing here is free.' },
    { key: 'turtle',  name: 'Turtle Island',  icon: '🐢', start: 4, refill: 1,                    says: 'Starts with 4 treasure.' },
  ],
  fixed: null, // e.g. ['volcano', 'lagoon', 'sandbar'] to force a deal while testing; null = random
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
const tile = (state, i) => PROTO.islands.find(t => t.key === state.tiles[i]); // island i's tile, fixed for the game
// What everyone sees of island i: a Den shows only its jettisoned tokens (state.seen) plus a count of the rest.
const shown = (state, i) => (tile(state, i).hidden ? state.seen[i] : state.islands[i]);
const unseen = (state, i) => total(state.islands[i]) - total(shown(state, i));

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
                  unfinished: false, maxIsland: 0, tiles: [], deep: zeros(), seen: names.map(zeros), share: null };
  // Deal the tiles (any fixed ones first), then draw each island's starting treasure as its tile says
  const fixed = (PROTO.fixed || []).slice(0, names.length), rest = PROTO.islands.map(t => t.key).filter(k => !fixed.includes(k));
  for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(rand(state) * (k + 1)); [rest[k], rest[j]] = [rest[j], rest[k]]; }
  state.tiles = [...fixed, ...rest].slice(0, names.length);
  state.islands = state.tiles.map((_, i) => draw(state, zeros(), tile(state, i).start));
  state.maxIsland = Math.max(...state.islands.map(total));
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

// How many treasures a seat owes this round: crashed on an island whose tile says jettison n (default 1; Skull Rock 2,
// Sandbar 0), capped at its haul. A Lagoon share is not a crash, so it owes none.
function owes(state, seat) {
  const h = state.history.at(-1), i = h?.picks[seat];
  if (i == null || h.results[i].kind !== 'crash') return 0;
  return Math.min(total(state.players[seat].haul), tile(state, i).jettison ?? 1);
}

// Records a jettison: the colours owed (one per token: a number for 1, an array for 2) from the seat's haul, all onto one
// island. Refuses outside the jettison step, a seat that owes none or has already jettisoned (final, like a pick), the wrong
// number of tokens, a colour it doesn't hold enough of, or an island that doesn't exist. The tokens stay in the haul until
// every jettison is revealed together, in refill.
function jettison(state, seat, colours, island) {
  const cs = [].concat(colours), haul = state.players[seat]?.haul;
  if (state.jettisons?.[seat] !== null || cs.length !== owes(state, seat)
    || !cs.every(c => Number.isInteger(c) && cs.filter(x => x === c).length <= haul[c])
    || !Number.isInteger(island) || island < 0 || island >= state.islands.length) return false;
  state.jettisons[seat] = { colours: cs, island };
  return true;
}

// jettisons[q]: false if seat q owes none, null until it jettisons, then { colours, island }.
const allJettisoned = state => !!state.jettisons?.every(j => j !== null);

// "Spite", every bot and the stand-in alike: the tokens and island that cost least, adding what the tokens are worth to my
// haul to the most any rival's worth for that island grows (winPull counts, so it won't hand a rival the win). Owing 2
// (Skull Rock), it weighs every pair. It reads only what everyone sees of a Den. A random fraction breaks ties.
function botJettison(state, me) {
  const { players, islands } = state, haul = players[me].haul, ways = [];
  const worth = (h, pile) => pile.reduce((a, n, c) => a + n * (1 + BOTS.sets * h[c]), 0) * (pile.some((n, c) => h[c] + n >= RULES.winAt) ? BOTS.winPull : 1);
  const choose = (from, left, got) => { // every way to take `left` more tokens from the haul, colours ascending
    if (!left) return ways.push(got);
    for (let c = from; c < haul.length; c++) if (got.filter(x => x === c).length < haul[c]) choose(c, left - 1, [...got, c]);
  };
  choose(0, owes(state, me), []);
  let best = null;
  ways.forEach(colours => islands.forEach((_, island) => {
    const pile = shown(state, island), after = pile.map((m, c) => m + colours.filter(x => x === c).length);
    const gain = players.map((p, q) => (q === me ? 0 : worth(p.haul, after) - worth(p.haul, pile))), h = [...haul];
    const cost = colours.reduce((a, c) => a + 1 + BOTS.sets * --h[c], 0) + Math.max(...gain) + rand(state) / 100;
    if (!best || cost < best.cost) best = { cost, colours, island };
  }));
  return { colours: best.colours, island: best.island };
}

// A bot's take in a Lagoon share: the token worth most to its own haul (winPull if it makes 5). A random fraction breaks ties.
function botShare(state, me) {
  const h = state.players[me].haul;
  let best = null;
  state.islands[state.share.island].forEach((n, c) => {
    const v = (1 + BOTS.sets * h[c]) * (h[c] + 1 >= RULES.winAt ? BOTS.winPull : 1) + rand(state) / 100;
    if (n && (best === null || v > best.v)) best = { v, c };
  });
  return best.c;
}

// "Guess the crowd": predict where each rival goes from their haul, score each island by (chance I'm there alone) x
// what its pile is worth to my haul ^greed, add the value of blocking a rival's winning island, then pick at weighted random.
// name defaults to the seat's own bot; the server passes one to play a dropped player's seat.
function botPick(state, me, name = state.players[me].bot) {
  const { players, islands } = state, { greed, focus } = BOTS.personalities.find(b => b.name === name);
  const prev = state.history.at(-1), last = prev?.picks || []; // a skipped seat's pick is null: no habit pull, no burned island
  const crashed = prev?.results[last[me]]?.kind === 'crash' ? last[me] : -1, norm = w => { const t = total(w); return w.map(x => x / t); };
  // Tiles count: a Den's hidden tokens and a Cove's bonus are each worth the average of q's colours, read from what's seen.
  const avg = q => total(players[q].haul.map(n => 1 + BOTS.sets * n)) / RULES.treasure.length;
  const wins = (q, i) => shown(state, i).some((n, c) => players[q].haul[c] + n >= RULES.winAt);
  const worth = (q, i) => (shown(state, i).reduce((a, n, c) => a + n * (1 + BOTS.sets * players[q].haul[c]), 0)
    + (unseen(state, i) + (tile(state, i).raidBonus || 0)) * avg(q)) * (wins(q, i) ? BOTS.winPull : 1);
  const h = players[me].haul, tok = total(h) ? h.reduce((a, n) => a + n * (1 + BOTS.sets * (n - 1)), 0) / total(h) : 0; // my average token
  const alone = (lean, q, i) => lean.reduce((a, l, r) => (r === q ? a : a * (1 - l[i])), 1);
  // A naive rival chases what's worth most to its own haul, and its last pick; a canny one also dodges the naive crowd.
  const naive = players.map((_, q) => norm(islands.map((_, i) => (worth(q, i) * (last[q] === i ? 1 + BOTS.habit : 1)) ** BOTS.herd)));
  const canny = players.map((_, q) => norm(islands.map((_, i) => alone(naive, q, i) * worth(q, i))));
  const lean = naive.map((l, q) => l.map((x, i) => (1 - BOTS.canny) * x + BOTS.canny * canny[q][i]));
  const best = Math.max(...islands.map((_, i) => worth(me, i))) ** greed;
  const weights = islands.map((_, i) => {
    const threat = 1 - lean.reduce((a, l, q) => (q !== me && wins(q, i) ? a * (1 - l[i]) : a), 1);
    const t = tile(state, i), a = alone(lean, me, i), w = worth(me, i), crowd = 1 + lean.reduce((s, l, q) => (q === me ? s : s + l[i]), 0);
    let value = (t.crash === 'destroy' ? Math.max(0, 1 - 2 * (1 - a)) : a) * w ** greed + BOTS.block * threat * best; // Volcano: crash risk counts double
    if (t.crash === 'share') value += (1 - a) * (w / Math.max(2, crowd)) ** greed; // Lagoon: a crash is a share of the pile
    value = Math.max(0, value - (1 - a) * ((t.jettison ?? 1) - 1) * tok ** greed); // Skull Rock costs 1 token more than a crash, Sandbar 1 less
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

// Resolve the round: raid, crash, share or unvisited per island, each by its tile, then check for a winner. A seat with no
// pick is skipped: it goes to no island. Afterwards it's between rounds (picks is null). A crash on the Lagoon opens a share
// (state.share): bots take theirs at once; it waits on share() while a person is next. Then settle checks for a winner.
function resolve(state) {
  const { players, islands, picks } = state;
  if (!picks) return false;
  const results = islands.map((pile, i) => {
    const who = picks.flatMap((isl, q) => (isl === i ? [q] : [])), t = tile(state, i);
    const r = { kind: who.length === 1 ? 'raid' : who.length ? (t.crash === 'share' ? 'share' : 'crash') : 'empty', who, before: [...pile] };
    if (t.hidden) r.seenBefore = [...state.seen[i]];
    if (r.kind === 'raid') {
      pile.forEach((n, c) => players[who[0]].haul[c] += n); islands[i] = zeros(); state.seen[i] = zeros();
      if (t.raidBonus) { r.bonus = draw(state, zeros(), Math.min(t.raidBonus, total(state.bag))); r.bonus.forEach((n, c) => players[who[0]].haul[c] += n); } // Cove; an empty bag gives none
    }
    if (r.kind === 'crash' && t.crash === 'destroy') { pile.forEach((n, c) => state.deep[c] += n); islands[i] = zeros(); r.destroyed = true; } // Volcano
    if (r.kind === 'share') { // smallest haul first (ties: seat order), fixed for the share, one each per pass while there's 1 for each
      const order = who.toSorted((p, q) => total(players[p].haul) - total(players[q].haul));
      state.share = { island: i, queue: Array(Math.floor(total(pile) / who.length)).fill(order).flat() }; r.took = [];
    }
    return r;
  });
  state.history.push({ round: state.round, picks: [...picks], results, jettisons: null }); // the full record; players see it only once the game is over
  state.picks = null;
  setAfter(state);
  playShare(state);
  if (!state.share) settle(state);
  return true;
}

// Records island piles after the round, and a Den's seen part, on the round's record
function setAfter(state) {
  state.history.at(-1).results.forEach((r, i) => { r.after = [...state.islands[i]]; if (tile(state, i).hidden) r.seenAfter = [...state.seen[i]]; });
}

// Records a take in the Lagoon share: 1 token of a colour on the Lagoon, by the seat whose turn it is. Refuses outside a share,
// another seat, or a colour the Lagoon doesn't hold. When the share is done, the round goes on to the win check.
function share(state, seat, colour) {
  if (state.share?.queue[0] !== seat || !(state.islands[state.share.island][colour] > 0)) return false;
  take(state, colour);
  playShare(state);
  if (!state.share) settle(state);
  return true;
}
function take(state, colour) {
  const { island, queue } = state.share, q = queue.shift();
  state.islands[island][colour]--; state.players[q].haul[colour]++;
  state.history.at(-1).results[island].took.push({ seat: q, colour });
  setAfter(state);
}
// Bots take their turns in the share; it closes when nobody is left to take
function playShare(state) {
  const s = state.share;
  if (!s) return;
  while (s.queue.length && state.players[s.queue[0]].bot) take(state, botShare(state, s.queue[0]));
  if (!s.queue.length) state.share = null;
}
const sharing = state => state.share?.queue[0] ?? null; // the seat taking next in the share, or null

// After the raids and any share: check for a winner. With Jettison, if a crasher owes treasure, the round waits in the
// jettison step (bot seats jettison at once) until refill; otherwise it refills now.
function settle(state) {
  const { players } = state, seats = players.map((_, q) => q), set = seats.filter(q => Math.max(...players[q].haul) >= RULES.winAt);
  if (set.length) state.winners = leaders(state, set);
  setAfter(state);
  const owe = seats.map(q => owes(state, q) > 0 && null);
  if (!state.winners && state.crashRule === 'jettison' && owe.includes(null)) {
    state.jettisons = owe;
    players.forEach((p, q) => { if (p.bot && owe[q] === null) state.jettisons[q] = botJettison(state, q); });
  } else finish(state);
}

// Ends the jettison step once every crasher who owes one has jettisoned; the caller jettisons for a slow seat first.
function refill(state) {
  if (!allJettisoned(state)) return false;
  finish(state);
  return true;
}

// Reveal every jettison together, moving each token from its haul onto its island (seen, even on a Den), then refill each
// island due by its tile: one that didn't crash and got no jettison, or a Reef always. The bag-out check counts what's due
// (a Volcano 2, a Sandbar 0): 0 due draws nothing and play goes on. A won round draws nothing.
function finish(state) {
  const { players, islands, bag, jettisons } = state, h = state.history.at(-1);
  jettisons?.forEach((j, q) => j && j.colours.forEach(c => {
    players[q].haul[c]--; islands[j.island][c]++;
    if (tile(state, j.island).hidden) state.seen[j.island][c]++;
  }));
  const due = islands.map((_, i) => i).filter(i => tile(state, i).alwaysGrows || (h.results[i].kind !== 'crash' && !jettisons?.some(j => j && j.island === i)));
  const need = due.reduce((a, i) => a + tile(state, i).refill, 0);
  if (!state.winners) {
    if (total(bag) < need) { state.winners = leaders(state, players.map((_, q) => q)); state.bagOut = true; }
    else due.forEach(i => draw(state, islands[i], tile(state, i).refill));
  }
  setAfter(state);
  if (jettisons) h.jettisons = jettisons.map(j => j || null);
  state.maxIsland = Math.max(state.maxIsland, ...islands.map(total));
  state.jettisons = null;
}

function nextRound(state) {
  if (state.picks || state.jettisons || state.share || state.winners) return false;
  state.round++;
  startRound(state);
  return true;
}

// Ends the game early, in any phase and under either crash rule: unfinished, nobody wins, and the round in play is dropped.
function endEarly(state) {
  if (state.winners) return false;
  Object.assign(state, { winners: [], unfinished: true, picks: null, jettisons: null, share: null });
  return true;
}

// What one seat may see, as a copy: never the bag or its count, another seat's pick or jettison this round, older reveals
// before the game is over, or the colours of a Den's bag-drawn tokens (only their count, in hidden) until it's over.
// seat = null for a spectator. jettisoning: the seat still owes a jettison. share: the Lagoon share in progress, public.
function viewFor(state, seat) {
  const s = structuredClone(state), over = s.winners !== null, last = s.history.at(-1) ?? null;
  const veil = i => !over && tile(s, i).hidden;
  if (last) last.results.forEach((r, i) => {
    if (veil(i)) {
      if (r.kind !== 'raid') Object.assign(r, { before: r.seenBefore, hiddenBefore: total(r.before) - total(r.seenBefore) }); // a raider shows what they took
      Object.assign(r, { after: r.seenAfter, hiddenAfter: total(r.after) - total(r.seenAfter) });
    }
    delete r.seenBefore; delete r.seenAfter;
  });
  return { round: s.round, islands: s.islands.map((p, i) => (veil(i) ? s.seen[i] : p)), hidden: s.islands.map((p, i) => (veil(i) ? unseen(s, i) : 0)),
           tiles: s.tiles, deep: s.deep, share: s.share, over, crashRule: s.crashRule,
           players: s.players.map((p, q) => ({ name: p.name, haul: p.haul, bot: p.bot, picked: s.picks?.[q] != null,
                                               jettisoning: s.jettisons?.[q] === null })),
           myPick: s.picks?.[seat] ?? null, myJettison: s.jettisons?.[seat] || null, last,
           winners: s.winners, bagOut: s.bagOut, unfinished: s.unfinished,
           ...(over && { history: s.history, maxIsland: s.maxIsland }) };
}

globalThis.Rules = { RULES, PROTO, BOTS, newGame, pick, allPicked, resolve, jettison, allJettisoned, refill, nextRound, endEarly,
                     botPick, botJettison, viewFor, tile, shown, unseen, owes, share, sharing, botShare };
})();
