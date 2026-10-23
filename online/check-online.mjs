// The online check (PIO5 03): plays rooms against a running server, the Mac's or the deployed one. Node's
// own WebSocket and fetch, no dependency.
//   node check-online.mjs [URL]   a made-up code is refused, then three sockets play a full game to game
//                                 over with real picks, each seeing only its own view. URL: http://localhost:8787
//   node check-online.mjs --cap   npm run dev only: 10 rooms from one address, then the 11th is refused
//   node check-online.mjs --expiry   only against `npx wrangler dev --var IDLE:3000`: an unused room expires,
//                                    in the lobby, in a game and with nobody connected
const args = process.argv.slice(2), base = (args.find(a => !a.startsWith('--')) ?? 'http://localhost:8787').replace(/\/$/, '');
const local = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(`${base}/`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = why => { console.error(`FAIL: ${why}`); process.exit(1); };
setTimeout(() => fail('took over 5 minutes'), 300000).unref();

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
  // Each socket picks a random island once per round and remembers it. A view must never carry the bag or
  // older reveals before the end, and its myPick is only ever this socket's own.
  const mine = [{}, {}, {}], done = [];
  const play = i => m => {
    const v = m.view; if (!v) return;
    if ('bag' in v || 'rng' in v || 'picks' in v || (!v.over && 'history' in v)) fail(`seat ${m.seat} sees ${Object.keys(v)}`);
    if (v.myPick !== null && v.myPick !== mine[i][v.round]) fail(`seat ${m.seat} was shown pick ${v.myPick} in round ${v.round}`);
    if (v.over) return done[i]?.(v);
    if (m.timer?.kind === 'pick' && mine[i][v.round] === undefined) {
      mine[i][v.round] = Math.random() * v.islands.length | 0; people[i].send({ type: 'pick', island: mine[i][v.round] });
    }
  };
  const { code, people } = await seatThree([0, 1, 2].map(play));
  const ends = people.map((_, i) => new Promise(ok => (done[i] = ok)));
  people[0].send({ type: 'start' });
  const [end] = await Promise.all(ends);
  const seats = people.map(c => c.last.seat);
  if (new Set(seats).size !== 3) fail(`seats ${seats}`);
  for (const h of end.history) seats.forEach((q, i) => { if (h.picks[q] !== mine[i][h.round]) fail(`round ${h.round}: seat ${q} picked ${mine[i][h.round]}, the room has ${h.picks[q]}`); });
  console.log(`ok: room ${code}, ${end.history.length} rounds to game over, winners ${end.winners.map(q => end.players[q].name).join(' & ')}`);
  people.forEach(c => c.ws.close());
}
process.exit(0);
