// The online check (PIO5 03): plays rooms against a running server, the Mac's or the deployed one. Node's
// own WebSocket and fetch, no dependency.
//   node check-online.mjs [URL]   a made-up code is refused, then three sockets play a Jettison game and a Freeze
//                                 game to game over with real picks and jettisons, each seeing only its own view,
//                                 then end a third early. URL: http://localhost:8787
//   node check-online.mjs --cap   npm run dev only: 10 rooms from one address, then the 11th is refused
//   node check-online.mjs --expiry   only against `npx wrangler dev --var IDLE:3000`: an unused room expires,
//                                    in the lobby, in a game and with nobody connected
const args = process.argv.slice(2), base = (args.find(a => !a.startsWith('--')) ?? 'http://localhost:8787').replace(/\/$/, '');
const local = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${base}/`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = why => { console.error(`FAIL: ${why}`); process.exit(1); };
setTimeout(() => fail('took over 8 minutes'), 480000).unref();

// address: sent as CF-Connecting-IP, which only wrangler dev believes (Cloudflare sets its own).
async function create(name, address) {
  const res = await fetch(`${base}/create`, { method: 'POST', body: JSON.stringify({ name }), headers: address ? { 'CF-Connecting-IP': address } : {} });
  return { status: res.status, ...(await res.json()) };
}

// One socket in a room. Every message goes to onMessage; until() waits for the first that passes a test.
function connect(code, onMessage = () => {}) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/room/${code}`), waits = [];
  const c = { ws, last: null, send: msg => ws.send(JSON.stringify(msg)),
    until: (test, why) => new Promise((ok, no) => { if (c.last && test(c.last)) return ok(c.last); waits.push({ test, ok }); setTimeout(() => no(new Error(`waited for ${why}`)), 20000).unref(); }) };
  setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 5000).unref(); // as the page does
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    c.last = JSON.parse(e.data); onMessage(c.last);
    for (const w of [...waits]) if (w.test(c.last)) waits.splice(waits.indexOf(w), 1), w.ok(c.last);
  };
  return c;
}

// The host makes a room and two guests join it, everyone seated and named in the lobby.
async function seatThree(onMessage = [() => {}, () => {}, () => {}]) {
  const { code, token } = await create('Ann');
  const people = [['Ann', token], ['Ben'], ['Cat']].map(([name, token], i) => {
    const c = connect(code, onMessage[i]);
    c.ws.onopen = () => c.send({ type: 'join', name, token });
    return c;
  });
  await people[0].until(m => m.waiting?.every(s => s.name && !s.away), 'three seated');
  return { code, people };
}

async function refused(code) {
  const m = await connect(code).until(m => m.error, 'a refusal');
  if (m.error !== 'no such room') fail(`room ${code}: ${m.error}, not "no such room"`);
}

if (args.includes('--cap')) {
  if (!local) fail('--cap runs only against npm run dev: on the real site it would lock this address out for an hour');
  const address = `10.${Math.random() * 255 | 0}.${Math.random() * 255 | 0}.1`; // a new one each run, so the Mac isn't locked out
  for (let n = 1; n <= 10; n++) if ((await create('Cap', address)).status !== 200) fail(`room ${n} of 10 refused`);
  const eleventh = await create('Cap', address);
  if (eleventh.status !== 429) fail(`the 11th room got ${eleventh.status}, not 429`);
  if ((await create('Cap', `${address}0`)).status !== 200) fail('another address was refused too');
  console.log(`ok: 10 rooms from ${address}, the 11th refused with 429, another address still served`);
} else if (args.includes('--expiry')) {
  if (!local) fail('--expiry needs a server started with --var IDLE:3000');
  const expired = c => c.until(m => m.error === 'room expired', '"room expired"');
  const lobby = await seatThree();
  await Promise.all(lobby.people.map(expired)); await refused(lobby.code);
  const game = await seatThree();
  game.people[0].send({ type: 'start' }); await game.people[1].until(m => m.view, 'the game');
  await Promise.all(game.people.map(expired)); await refused(game.code); // nobody picked
  const { code } = await create('Nobody'); await sleep(5000); await refused(code);
  console.log('ok: a lobby, a game nobody picks in and a room nobody joined each expired, and their codes name no room');
} else {
  await refused('00000'); // 0 is never in a code
  // Each socket picks a random island once per round, and when it owes a jettison sends a random token of its haul
  // onto a random island, remembering both. A view must never carry the bag, this round's picks or jettisons, or
  // older reveals before the end; its myPick and myJettison are only ever this socket's own, and no jettison shows
  // before every one is in. Seat 2 lets its first jettison time out, so Sneaky jettisons for it (🤖).
  let g = null; // the game being played: what each socket sent, by round
  const same = (a, b) => a?.colour === b?.colour && a?.island === b?.island;
  const play = i => m => {
    const v = m.view; if (!v || !g) return;
    if ('bag' in v || 'rng' in v || 'picks' in v || 'jettisons' in v || (!v.over && 'history' in v)) fail(`seat ${m.seat} sees ${Object.keys(v)}`);
    if (v.myPick !== null && v.myPick !== g.picks[i][v.round]) fail(`seat ${m.seat} was shown pick ${v.myPick} in round ${v.round}`);
    if (v.myJettison && !same(v.myJettison, g.jettisons[i][v.round])) fail(`seat ${m.seat} was shown jettison ${JSON.stringify(v.myJettison)} in round ${v.round}`);
    if (v.players.some(p => p.jettisoning) && (v.last.jettisons || m.timer?.kind !== 'jettison')) fail(`seat ${m.seat} sees jettisons, or no jettison timer, before all are in`);
    if (v.over) return g.done[i]?.(v);
    if (m.timer?.kind === 'pick' && g.picks[i][v.round] === undefined) {
      g.picks[i][v.round] = Math.random() * v.islands.length | 0; people[i].send({ type: 'pick', island: g.picks[i][v.round] });
    }
    if (v.players[m.seat].jettisoning && !(v.round in g.jettisons[i])) {
      if (i === 2 && !g.slow) return (g.slow = v.round, g.jettisons[i][v.round] = null); // never sent: the timer runs out
      const colours = v.players[m.seat].haul.flatMap((n, c) => (n ? [c] : []));
      const j = g.jettisons[i][v.round] = { colour: colours[Math.random() * colours.length | 0], island: Math.random() * v.islands.length | 0 };
      people[i].send({ type: 'jettison', ...j });
    }
  };
  const { code, people } = await seatThree([0, 1, 2].map(play));
  const lobby = (why, test = () => true) => Promise.all(people.map(c => c.until(m => m.waiting && test(m), why)));

  // Plays one game to game over under a crash rule, then checks the room's history against what each socket sent.
  async function playGame(rule) {
    g = { picks: [{}, {}, {}], jettisons: [{}, {}, {}], slow: rule === 'freeze' && 'never', done: [] };
    const ends = people.map((_, i) => new Promise(ok => (g.done[i] = ok)));
    people[0].send({ type: 'start' });
    const [end] = await Promise.all(ends);
    if (end.crashRule !== rule) fail(`played ${end.crashRule}, not ${rule}`);
    const seats = people.map(c => c.last.seat);
    if (new Set(seats).size !== 3) fail(`seats ${seats}`);
    for (const h of end.history) seats.forEach((q, i) => {
      if (h.picks[q] !== g.picks[i][h.round]) fail(`round ${h.round}: seat ${q} picked ${g.picks[i][h.round]}, the room has ${h.picks[q]}`);
      const sent = g.jettisons[i][h.round], j = h.jettisons?.[q];
      if (sent === undefined ? j : sent === null ? !(j && h.botJettisons[q]) : !same(j, sent))
        fail(`round ${h.round}: seat ${q} jettisoned ${JSON.stringify(sent)}, the room has ${JSON.stringify(j)}`);
    });
    const n = end.history.flatMap(h => h.jettisons ?? []).filter(Boolean).length;
    if (rule === 'freeze' ? n : !n) fail(`${n} jettisons in a ${rule} game`);
    const slow = rule === 'freeze' ? '' : g.slow ? `, round ${g.slow}'s timed out to Sneaky` : ', none timed out (seat 2 never owed one)';
    console.log(`ok: room ${code}, ${rule}: ${end.history.length} rounds to game over, ${n} jettisons${slow}, winners ${end.winners.map(q => end.players[q].name).join(' & ')}`);
    g = null;
    return end;
  }

  // The lobby starts on Jettison, and only the host changes the rule.
  if (people[1].last.rule !== 'jettison') fail(`the lobby's rule is ${people[1].last.rule}`);
  people[1].send({ type: 'rule', rule: 'freeze' });
  if ((await people[1].until(m => m.error, 'a refusal')).error !== 'Ann is still here') fail(`a guest set the rule`);
  await playGame('jettison');
  people[0].send({ type: 'new' }); await lobby('the lobby');
  people[0].send({ type: 'rule', rule: 'freeze' }); await lobby('Freeze', m => m.rule === 'freeze');
  await playGame('freeze');
  // End game: unfinished, nobody wins, and New game returns to the lobby with the rule kept.
  people[0].send({ type: 'new' }); await lobby('the lobby');
  people[0].send({ type: 'start' }); await Promise.all(people.map(c => c.until(m => m.view && !m.view.over, 'the game')));
  people[0].send({ type: 'end' });
  await Promise.all(people.map(c => c.until(m => m.view?.over && m.view.unfinished && !m.view.winners.length && !m.timer, 'an unfinished game')));
  people[0].send({ type: 'new' }); await lobby('the lobby, still Freeze', m => m.rule === 'freeze');
  console.log('ok: only the host sets the rule; End game makes it unfinished with no winner, and New game keeps the rule');
  people.forEach(c => c.ws.close());
}
process.exit(0);
