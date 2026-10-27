// PROTOTYPE (PI3 05 The Jettison Screens), throwaway, never merged: three variants of the Jettison screens on both
// pages, ?variant=A|B|C, switched from the black bar at the bottom (or ← →). Loaded after rules.js by both pages.
// Online, the room code PROTO is a fake room run in this tab (pretend players Sam and Cat, a Greedy bot), so one
// phone can play every screen. Prototype only: every player starts with some treasure, and "Crash me" makes a
// pretend player land on your island, so jettisons come at once.
(() => {
const { RULES } = Rules;
const JETTISON_TIMER = 30; // the build puts this in RULES beside pickTimer and nextTimer
const params = new URLSearchParams(location.search);
const KEYS = ['A', 'B', 'C'], NAMES = { A: 'Same as picking', B: 'Island first', C: 'Step by step' };
const variant = KEYS.includes((params.get('variant') || '').toUpperCase()) ? params.get('variant').toUpperCase() : 'A';
const L = i => 'ABCDE'[i];
const chip = (c, n = 1, cls = '') => `<span class="t ${cls}" style="background:${RULES.treasure[c].ink}">${RULES.treasure[c].mark}${n > 1 ? `×${n}` : ''}</span>`;
const tokens = counts => counts.map((n, c) => (n ? chip(c, n) : '')).join('') || '<span class="empty">empty</span>';
const RULE = { jettison: 'Jettison (v0.3)', freeze: 'Freeze (v0.2)' };
const short = r => (r === 'freeze' ? 'Freeze' : 'Jettison');

document.head.insertAdjacentHTML('beforeend', `<style>
  #jp-bar { position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 6px; align-items: center;
    background: #111; color: #fff; border-radius: 999px; padding: 4px 8px; font: 14px system-ui; box-shadow: 0 2px 10px #0006; white-space: nowrap; }
  #jp-bar button { margin: 0; padding: 6px 10px; background: #333; font-size: 14px; } #jp-bar button.on { background: #b8860b; }
  body { padding-bottom: 72px; }
  .t.ghost { outline: 2px dashed #1d5c7a; outline-offset: 1px; opacity: 0.75; }
  .jtok { font-size: 15px; } .jtok .t { font-size: 22px; padding: 2px 8px; }
  .jrow { border: 2px solid #c9b78f; border-radius: 10px; background: #fff; margin-bottom: 6px; }
  .jrow.open { border-color: #1d5c7a; } .jrow > button { width: 100%; margin: 0; background: none; color: #222; text-align: left; display: flex; gap: 8px; align-items: center; }
  .jrow > div { padding: 0 10px 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  button.small { font-size: 15px; padding: 6px 10px; background: none; color: #1d5c7a; border: 1px solid #1d5c7a; } /* the hotseat has none */
  .jbig { display: block; width: 100%; text-align: left; color: #222; background: #fff; border: 2px solid #c9b78f; }
  .jbig.sel { border-color: #1d5c7a; background: #d7ecf5; }
  .jcover { background: #1d3b4a; color: #fff; border-radius: 12px; padding: 20px 16px; text-align: center; }
  .jtag { display: inline-block; background: #1d3b4a; color: #fff; border-radius: 999px; padding: 2px 10px; font-size: 14px; }
  .jstrip { background: #e8dcc0; border-radius: 8px; padding: 4px 10px; margin-bottom: 8px; font-size: 15px; }
  .jrule { display: flex; gap: 6px; } .jrule .card { text-align: left; }
  #jp-confirm { border: 2px solid #c9b78f; border-radius: 12px; max-width: 320px; } #jp-confirm::backdrop { background: #0006; }
</style>`);

// ---- The switcher bar ----
const extras = []; // [label, on?, onclick]: the page's prototype toggles
function bar() {
  const go = k => { params.set('variant', k); location.search = params; };
  const i = KEYS.indexOf(variant), prev = KEYS[(i + 2) % 3], next = KEYS[(i + 1) % 3];
  let el = document.getElementById('jp-bar');
  if (!el) { el = document.createElement('div'); el.id = 'jp-bar'; document.body.append(el); }
  el.innerHTML = `<button onclick="JP.go('${prev}')">◀</button><b>${variant}</b> ${NAMES[variant]}<button onclick="JP.go('${next}')">▶</button>`
    + extras.map(([label, on], k) => `<button class="${on() ? 'on' : ''}" onclick="JP.extra(${k})">${label}</button>`).join('');
  JP.go = go;
}
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const i = KEYS.indexOf(variant);
  if (e.key === 'ArrowLeft') JP.go(KEYS[(i + 2) % 3]);
  if (e.key === 'ArrowRight') JP.go(KEYS[(i + 1) % 3]);
});

// ---- The setup switch. editable false: a guest sees the host's choice ----
function ruleSwitch(rule, editable) {
  const dis = editable ? '' : 'disabled';
  if (variant === 'A') return `<h2>Crash rule</h2><div class="row">${['jettison', 'freeze'].map(r =>
    `<button class="card ${rule === r ? 'sel' : ''}" ${dis} onclick="act.rule('${r}')">${RULE[r]}</button>`).join('')}</div>`;
  if (variant === 'B') return editable
    ? `<p>Crash rule <select onchange="act.rule(this.value)">${['jettison', 'freeze'].map(r => `<option value="${r}" ${rule === r ? 'selected' : ''}>${RULE[r]}</option>`).join('')}</select></p>`
    : `<p>Crash rule: <b>${RULE[rule]}</b> <span class="muted">(the host chooses)</span></p>`;
  const blurb = { jettison: 'Crashers each put 1 treasure from their haul onto an island.', freeze: 'A crashed island freezes. Nobody jettisons.' };
  return `<h2>Crash rule</h2>${['jettison', 'freeze'].map(r => `<button class="jbig ${rule === r ? 'sel' : ''}" ${dis} onclick="act.rule('${r}')">
    <b>${rule === r ? '●' : '○'} ${RULE[r]}</b>${r === 'jettison' ? ' <span class="muted">· default</span>' : ''}<br><span class="muted">${blurb[r]}</span></button>`).join('')}`;
}

// ---- Which rule is in play, on the game screens: A in the round line, B a tag on top, C a strip on top ----
const roundExtra = rule => (variant === 'A' ? ` · Crash rule: ${short(rule)}` : '');
const topTag = rule => (variant === 'B' ? `<p style="margin: 0 0 8px"><span class="jtag">${rule === 'freeze' ? '❄️' : '⚓'} ${short(rule)}</span></p>`
  : variant === 'C' ? `<div class="jstrip">Crash rule: <b>${RULE[rule]}</b></div>` : '');

// ---- Jettisoning: s is the choice not yet locked in ----
const s = { colour: null, island: null, step: 1 };
const reset = () => Object.assign(s, { colour: null, island: null, step: 1 });
const preview = (pile, i) => tokens(pile).replace('<span class="empty">empty</span>', '')
  + (s.colour !== null && s.island === i ? chip(s.colour, 1, 'ghost') : '') || '<span class="empty">empty</span>';
const lockBtn = lock => `<button class="big" ${s.colour === null || s.island === null ? 'disabled' : ''} onclick="${lock}">Lock in${s.colour === null || s.island === null ? ''
  : ` ${RULES.treasure[s.colour].mark} → Island ${L(s.island)}`}</button>`;

// o: { who (heading, e.g. 'Ann, '), haul, islands, crashedOn, lock (JS to run) }
function jettisonView(o) {
  const colours = o.haul.flatMap((n, c) => (n ? [c] : []));
  const there = `You crashed on ${L(o.crashedOn)}.`;
  if (variant === 'A') return `<h2>${o.who}Jettison 1 treasure</h2><p class="muted">${there} Choose a treasure from your haul, then any island.</p>
    <div class="row">${colours.map(c => `<button class="card jtok ${s.colour === c ? 'sel' : ''}" onclick="JP.colour(${c})">${chip(c)}<br>${o.haul[c]} in haul</button>`).join('')}</div>
    <div class="row">${o.islands.map((pile, i) => `<button class="card ${s.island === i ? 'sel' : ''}" onclick="JP.island(${i})"><b>${L(i)}</b>${preview(pile, i)}</button>`).join('')}</div>
    ${lockBtn(o.lock)}`;
  if (variant === 'B') return `<h2>${o.who}Jettison: tap an island, then a treasure</h2><p class="muted">${there} Any island, ${L(o.crashedOn)} included.</p>
    ${o.islands.map((pile, i) => `<div class="jrow ${s.island === i ? 'open' : ''}"><button onclick="JP.island(${i})"><b style="font-size: 22px">${L(i)}</b>
      ${preview(pile, i)}${i === o.crashedOn ? ' <span class="muted">💥 crashed here</span>' : ''}</button>
      ${s.island === i ? `<div>Put here: ${colours.map(c => `<button class="card jtok ${s.colour === c ? 'sel' : ''}" style="flex: none" onclick="JP.colour(${c})">${chip(c)} <span class="muted">${o.haul[c]}</span></button>`).join('')}</div>` : ''}</div>`).join('')}
    ${lockBtn(o.lock)}`;
  if (s.step === 1) return `<div class="jcover"><p style="margin: 0">${there}</p><h2 style="margin: 4px 0">${o.who}Jettison 1 treasure</h2><p style="margin: 0">Step 1 of 2: which one goes overboard?</p></div>
    ${colours.map(c => `<button class="jbig jtok" onclick="JP.colour(${c})">${chip(c)} ${RULES.treasure[c].name} <span class="muted">· ${o.haul[c]} in your haul</span></button>`).join('')}`;
  return `<div class="jcover"><h2 style="margin: 0">${o.who}Step 2 of 2: ${chip(s.colour)} onto which island?</h2></div>
    ${o.islands.map((pile, i) => `<button class="jbig ${s.island === i ? 'sel' : ''}" onclick="JP.island(${i})"><b>Island ${L(i)}</b>${i === o.crashedOn ? ' <span class="muted">(you crashed here)</span>' : ''}<br>
      ${tokens(pile)} → ${tokens(pile.map((n, c) => n + (c === s.colour)))}</button>`).join('')}
    ${lockBtn(o.lock)}<button class="small" onclick="JP.back()">← Choose another treasure</button>`;
}

// o: { list: [{ name, done }], mine: { colour, island } or null, secs }
function waitingView(o) {
  const left = o.list.filter(x => !x.done).map(x => x.name), mine = o.mine && `${chip(o.mine.colour)} → ${L(o.mine.island)}`;
  const and = a => a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a[0] ?? '';
  if (variant === 'A') return `<h2>${mine ? `You jettisoned ${mine}` : 'Jettisoning'}</h2>
    <div class="row">${o.list.map(x => `<div class="card">${x.name}<br>${x.done ? '✓' : '⚓'}</div>`).join('')}</div>
    <p class="muted">⚓ = still choosing, ✓ = done. Waiting for ${and(left)}…</p>`;
  if (variant === 'B') return `<h2>Waiting for jettisons</h2>${mine ? `<p>Yours: <b>${mine}</b>, locked in.</p>` : ''}
    <ul>${o.list.map(x => `<li>${x.name}: ${x.done ? '✓ done' : '⏳ choosing'}</li>`).join('')}</ul><p class="muted">All jettisons show together.</p>`;
  return `<div class="jcover"><p style="font-size: 40px; margin: 0">⚓</p><h2 style="margin: 4px 0">${and(left)} ${left.length > 1 ? 'are' : 'is'} jettisoning</h2>
    ${mine ? `<p>Your jettison is locked in: ${mine}</p>` : ''}<p style="margin: 0">Every jettison is revealed together.</p></div>`;
}

// ---- The reveal: a crash line under each rule, then the jettisons once refill has run ----
function crashLine(r, i, names, rule) {
  return rule === 'freeze' ? `<p class="crash"><b>${L(i)}:</b> CRASH! ${names} collided. Nobody takes anything and ${L(i)} stays frozen.</p>`
    : `<p class="crash"><b>${L(i)}:</b> CRASH! ${names} collided. Nobody takes anything, and each of them jettisons 1 treasure.</p>`;
}
// h: a history entry after refill. name(q): the escaped name. Crashers whose jettison is null had an empty haul.
function jettisonReveal(h, name) {
  if (!h.jettisons) return '';
  const crashers = h.picks.flatMap((isl, q) => (isl !== null && h.results[isl].kind === 'crash' ? [q] : []));
  const bot = q => (h.jettisonBots?.[q] ? ' 🤖' : '');
  const empty = crashers.filter(q => !h.jettisons[q]).map(q => `${name(q)}: empty haul, nothing to jettison`);
  if (variant === 'B') return `<h2>Jettisons</h2>${h.results.map((r, i) => {
    const onto = crashers.filter(q => h.jettisons[q]?.island === i);
    return onto.length ? `<p><b>${L(i)}:</b> ${onto.map(q => `+ ${chip(h.jettisons[q].colour)} from ${name(q)}${bot(q)}`).join(', ')}. Now: ${tokens(r.after)} <span class="muted">(no refill)</span></p>` : '';
  }).join('')}${empty.map(e => `<p class="muted">${e}</p>`).join('')}`;
  return `<p><b>Jettisons:</b> ${crashers.filter(q => h.jettisons[q]).map(q => `<b>${name(q)}</b>${bot(q)} ${chip(h.jettisons[q].colour)} → ${L(h.jettisons[q].island)}`).join(' · ')}</p>
    ${empty.map(e => `<p class="muted">${e}</p>`).join('')}`;
}
const jSuffix = (h, q) => (h.jettisons?.[q] ? `, jettisoned ${chip(h.jettisons[q].colour)} → ${L(h.jettisons[q].island)}${h.jettisonBots?.[q] ? ' 🤖' : ''}` : '');
const jCell = (h, q) => (h.jettisons?.[q] ? ` ${RULES.treasure[h.jettisons[q].colour].mark}→${L(h.jettisons[q].island)}` : '');

// ---- Ending early: A a button at the bottom with the browser's confirm, then the unfinished game-over screen;
// B a button by the round line, tapped twice, then straight back to setup or the lobby; C a dialog, then the screen ----
let armed = null;
const endButton = where => ((where === 'top') === (variant === 'B')
  ? `<p style="text-align: ${variant === 'B' ? 'right' : 'center'}; margin: 4px 0"><button class="small" id="jp-end" onclick="JP.end()">${armed ? 'Tap again to end · nobody wins' : 'End game'}</button></p>` : '');
function end() {
  if (variant === 'A') { if (confirm('End this game now? It ends unfinished: nobody wins.')) JP.onEnd(); return; }
  if (variant === 'B') {
    if (armed) { clearTimeout(armed); armed = null; return JP.onEnd(); }
    armed = setTimeout(() => { armed = null; JP.redraw(); }, 3000); return JP.redraw();
  }
  let d = document.getElementById('jp-confirm');
  if (!d) { document.body.insertAdjacentHTML('beforeend', `<dialog id="jp-confirm"><h2>End the game?</h2><p>It ends <b>unfinished</b>: nobody wins, and the tie order isn't used.</p>
    <button class="big" onclick="this.closest('dialog').close(); JP.onEnd()">End game</button><button class="big small" onclick="this.closest('dialog').close()">Keep playing</button></dialog>`); d = document.getElementById('jp-confirm'); }
  d.showModal();
}
const endFirst = variant !== 'B'; // whether an unfinished game-over screen comes before setup or the lobby

// Prototype only: every player starts with 1–3 treasure, taken from the bag, so a crash owes a jettison from round 1.
function seedHauls(state) {
  state.players.forEach(p => { for (let k = 0; k < 2 + (state.rng & 1); k++) { const c = Math.floor(Math.random() * 5); if (state.bag[c]) state.bag[c]--, p.haul[c]++; } });
}

// ---- The fake room: ?room=PROTO plays in this tab, speaking the room's messages over a pretend socket ----
const room = { rule: 'jettison', host: 0, names: ['', 'Sam', 'Cat', 'Player 4'], bots: [null, null, null, 'Greedy'], game: null, timer: null,
               standIns: [false, false, false, false], crash: true, note: null, ws: null, timeouts: [] };
const PRETEND = [1, 2]; // seats played by pretend people: they take a few seconds, as people do
function msg(seat = 0) {
  const { game, timer } = room, out = game ? { seat, view: Rules.viewFor(game, seat), standIns: room.standIns }
    : { seat, waiting: room.bots.map((bot, q) => ({ name: bot ? `Player ${q + 1}` : room.names[q], bot, away: false })) };
  return { ...out, host: room.host, crashRule: game?.crashRule ?? room.rule, note: room.note,
           timer: timer && { kind: timer.kind, msLeft: Math.max(0, timer.endsAt - Date.now()) } };
}
const push = () => room.ws?.onmessage?.({ data: JSON.stringify(msg()) });
const later = (ms, f) => room.timeouts.push(setTimeout(() => { f(); push(); }, ms));
const clear = () => { room.timeouts.forEach(clearTimeout); room.timeouts = []; };
function arm(kind) {
  clear();
  const secs = { pick: RULES.pickTimer, jettison: JETTISON_TIMER, next: RULES.nextTimer }[kind];
  room.timer = { kind, endsAt: Date.now() + secs * 1000 };
  later(secs * 1000, () => ring(kind));
  const g = room.game;
  if (kind === 'pick') PRETEND.forEach(q => later(2000 + Math.random() * 6000, () => { if (g.picks?.[q] === null) Rules.pick(g, q, Rules.botPick(g, q, 'Sneaky')), settle(); }));
  if (kind === 'jettison') PRETEND.forEach(q => g.jettisons[q] === null && later(3000 + Math.random() * 7000, () => {
    if (g.jettisons?.[q] === null) { const j = Rules.botJettison(g, q); Rules.jettison(g, q, j.colour, j.island); settle(); } }));
}
function ring(kind) {
  const g = room.game;
  if (kind === 'pick') resolve();
  else if (kind === 'jettison') { // too slow: Sneaky jettisons, marked 🤖
    const h = g.history.at(-1); h.jettisonBots = g.jettisons.map(j => j === null);
    g.jettisons.forEach((j, q) => { if (j === null) { const b = Rules.botJettison(g, q); Rules.jettison(g, q, b.colour, b.island); } });
    settle();
  } else { Rules.nextRound(g); arm('pick'); }
}
function resolve() {
  const g = room.game; Rules.resolve(g); g.history.at(-1).standIns = [...room.standIns];
  afterStep();
}
function afterStep() {
  const g = room.game;
  if (g.jettisons) { if (room.timer?.kind !== 'jettison') arm('jettison'); }
  else if (g.winners) { clear(); room.timer = null; }
  else arm('next');
}
function settle() { // after any pick or jettison: move on once everyone is done
  const g = room.game;
  if (g.picks && Rules.allPicked(g)) resolve();
  else if (g.jettisons && Rules.allJettisoned(g)) { Rules.refill(g); afterStep(); }
}
function handle(m) {
  const g = room.game;
  if (m.type === 'join') room.names[0] = m.name;
  if (m.type === 'rule' && !g) room.rule = m.rule;
  if (m.type === 'start' && !g) {
    room.note = null;
    room.game = Rules.newGame(room.names, room.bots, Date.now(), room.rule); seedHauls(room.game);
    arm('pick');
  }
  if (m.type === 'pick' && Rules.pick(g, 0, m.island)) {
    const other = PRETEND.find(q => g.picks[q] === null) ?? PRETEND[0];
    if (room.crash) g.picks[other] = m.island; // prototype: a pretend player lands on your island
    settle();
  }
  if (m.type === 'jettison' && Rules.jettison(g, 0, m.colour, m.island)) settle();
  if (m.type === 'end' && g) { Rules.endEarly(g); clear(); room.timer = null; if (!endFirst) room.game = null, room.note = 'ended'; }
  if (m.type === 'new') { clear(); room.timer = null; room.game = null; }
  push();
}
class FakeSocket {
  static OPEN = 1;
  constructor() { this.readyState = 1; room.ws = this; setTimeout(() => { this.onopen?.(); if (!room.names[0]) this.onmessage?.({ data: JSON.stringify({ ...msg(null) }) }); }); }
  send(data) { if (data === 'ping') return setTimeout(() => this.onmessage?.({ data: 'pong' })); handle(JSON.parse(data)); }
  close() {}
}
const proto = (params.get('room') ?? '').toUpperCase() === 'PROTO';
if (proto) {
  window.WebSocket = FakeSocket;
  extras.push(['Crash me', () => room.crash, () => { room.crash = !room.crash; }]);
  extras.push(['As guest', () => room.host !== 0, () => { room.host = room.host ? 0 : 1; push(); }]);
}

globalThis.JP = {
  variant, JETTISON_TIMER, extras, bar, ruleSwitch, roundExtra, topTag, jettisonView, waitingView, crashLine, jettisonReveal, jSuffix, jCell,
  endButton, end, endFirst, seedHauls, reset, s, proto,
  colour(c) { s.colour = c; if (variant === 'C') s.step = 2; JP.redraw(); },
  island(i) { s.island = i; JP.redraw(); },
  back() { s.step = 1; s.island = null; JP.redraw(); },
  extra(k) { extras[k][2](); bar(); },
  redraw() {}, onEnd() {}, // set by the page
};
})();
