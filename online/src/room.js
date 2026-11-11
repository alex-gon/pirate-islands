// Rooms by code: each is a Durable Object that holds one game on rules.js and sends each connection
// only its own view. Its messages are decided in PIO2 02, PIO3 02, PIO4 03, PIO5 03 and PI3 08 (the vault). Words: CONTEXT.md.
import { DurableObject } from "cloudflare:workers";
import "../../rules.js"; // a classic script: sets globalThis.Rules
const { Rules } = globalThis;

const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes: 0/O, 1/I/L
const TYPES = ["join", "seats", "free", "rule", "start", "pick", "jettison", "end", "new"], HOST = ["seats", "free", "rule", "start", "end", "new"];
const BOT = Rules.BOTS.personalities.map(p => p.name), { minPlayers, maxPlayers, pickTimer, nextTimer, jettisonTimer } = Rules.RULES;
const CRASH_RULES = ["jettison", "freeze"]; // the host's choice in the lobby, passed to newGame at Start
const ALIVE = 15000, LATE = 2000; // ms: connected = a ping answered this recently; an alarm this late restarts its phase
const HOUR = 3600000, IDLE = 2 * HOUR, CAP = 10; // a room unused this long expires; rooms one address may create an hour
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newToken = () => crypto.getRandomValues(new Uint8Array(16)).toBase64({ alphabet: "base64url", omitPadding: true });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // null until POST /create. bots[seat]: null for a person, or a personality ('Greedy', 'Sneaky' or
    // 'Wild'). names[seat] is null until a person joins it; a bot seat's '' becomes "Player N" in the game.
    // tokens[seat]: the seat token its person holds, or null. host: a seat. timer: the one pending alarm.
    // rule: the crash rule the next Start plays, 'jettison' or 'freeze'.
    this.room = ctx.storage.kv.get("room") ?? null;
    if (this.room && !this.room.tokens) this.room = null; // saved before seat tokens: treated as never made
    if (this.room) this.room.usedAt ??= Date.now(); // saved before expiry: counts from now
    if (this.room) this.room.rule ??= "jettison"; // saved before the crash rule
    if (this.room?.game) this.room.game.crashRule ??= "freeze"; // a game begun before it plays v0.2, as before
    this.idle = Number(env.IDLE) || IDLE; // `wrangler dev --var IDLE:3000` shortens it, for check-online.mjs --expiry
    // The page pings every 5 s; the answer doesn't wake the room, and its time says the phone is there.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // Called by the Worker with a fresh code: 3 open seats, the host's name and a token on seat 0.
  // Returns that token, or null if the code is taken.
  create(name) {
    if (this.room) return null;
    const token = newToken();
    this.room = { names: [name || "Player 1", null, null], bots: [null, null, null], tokens: [token, null, null], host: 0, rule: "jettison", game: null, timer: null, usedAt: Date.now() };
    this.ctx.storage.kv.put("room", this.room); this.wake(); // a room nobody ever joins expires too
    return token;
  }

  fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    if (!this.room) { // nothing saved: no POST /create made this code, or the room closed
      server.accept(); server.send(JSON.stringify({ error: "no such room" })); server.close(1008, "no such room");
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null }); // the room gives the seat; a tab never names it
    this.send(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    const error = this.handle(ws, data);
    if (error) return this.send(ws, error); // refused: only the sender hears, and nothing is saved
    this.room.usedAt = Date.now(); // a real message; pings never reach here
    this.save();
  }

  // The others hear that the seat is free. A plain close: 1005 and 1006 can't be sent back.
  webSocketClose(ws) { ws.close(); if (this.room) for (const other of this.open()) this.send(other); }

  // The room expired, or the pick timer, the jettison timer or the reveal pause ran out. It acts only on the timer it saved,
  // and never throws: a throwing alarm is retried, which could resolve a round twice (PIO4 02).
  async alarm() {
    if (!this.room) return;
    if (Date.now() >= this.room.usedAt + this.idle) return await this.close("room expired");
    const t = this.room.timer, game = this.room.game;
    if (!game) return this.lobbyAlarm();
    if (!t || t.round !== game.round || Date.now() < t.endsAt) return this.wake(); // woken for an expiry a later message put off
    try {
      if (Date.now() > t.endsAt + LATE) this.arm(t.kind); // the server was down: start the phase again, so phones can return
      else if (t.kind === "next") {
        this.room.standIns = this.room.standIns.map((s, q) => s && !this.connected(q)); // a returned person plays again
        Rules.nextRound(game); this.standInsPick(); this.arm("pick");
      } else {
        // No pick (or jettison) yet: connected is skipped (or gets Sneaky's jettison, 🤖), gone is dropped and gets a
        // stand-in. If every person is gone, the room closes.
        const { standIns } = this.room, people = game.players.flatMap((p, q) => (p.bot ? [] : [q]));
        const owes = t.kind === "pick" ? game.picks : game.jettisons;
        for (const q of people) if (owes[q] === null && !this.connected(q)) standIns[q] = true;
        if (people.every(q => standIns[q] && !this.connected(q))) return await this.close();
        if (t.kind === "pick") { this.standInsPick(); this.resolve(); }
        else { game.jettisons.forEach((j, q) => j === null && this.botJettison(q)); this.refill(); }
      }
      this.save();
    } catch (e) { console.error(e); this.room = this.ctx.storage.kv.get("room") ?? null; }
  }

  // The lobby has no timer, so its alarm looks every 15 s while anyone is here: a phone that goes silent
  // without closing (locked, frozen) shows as away once it stops being connected. Only a change is sent,
  // so the host's open dropdown isn't redrawn.
  lobbyAlarm() {
    const { bots, tokens } = this.room, away = bots.map((bot, q) => !bot && !!tokens[q] && !this.connected(q)).join();
    if (away !== this.away) for (const ws of this.open()) this.send(ws);
    this.away = away;
    this.wake();
  }

  // Applies one message from ws, or returns a short reason to refuse it.
  handle(ws, data) {
    let msg; try { msg = JSON.parse(data); } catch {}
    if (typeof data !== "string" || data.length > 1024) return "message too long";
    if (!TYPES.includes(msg?.type)) return "unknown message";
    const { seat } = ws.deserializeAttachment(), { names, tokens, game } = this.room;
    if (msg.type === "join") { // { name, token? }
      if (seat !== null) return "already seated";
      if (typeof msg.name !== "string") return "name must be text";
      // The token's seat, its older connection now watching; else a spectator, whom save() seats in the lobby if it can.
      const name = msg.name.trim().slice(0, 20), q = typeof msg.token === "string" ? tokens.indexOf(msg.token) : -1;
      if (q >= 0) this.open().filter(o => o.deserializeAttachment().seat === q).forEach(o => o.serializeAttachment({ seat: null, displaced: true }));
      ws.serializeAttachment({ seat: q >= 0 ? q : null, at: Date.now(), name });
      if (q >= 0 && !game) names[q] = name || `Player ${q + 1}`; // during a game the seat keeps its saved name
      if (q >= 0 && game?.winners) this.room.standIns[q] = false; // back at game over: no next round would clear it
      return;
    }
    if (seat === null) return "you have no seat";
    if (HOST.includes(msg.type)) { // the host's, or anyone seated while the host is away, who becomes the host
      const { host } = this.room;
      if (seat !== host && this.connected(host)) return `${names[host]} is still here`;
      const error = this.hostMessage(msg, seat);
      if (!error) this.room.host = seat;
      return error;
    }
    if (!Number.isInteger(msg.island)) return "island must be a whole number"; // pick or jettison
    if (msg.type === "jettison") { // { colour, island }, from a seat that owes one
      if (!Number.isInteger(msg.colour)) return "colour must be a whole number";
      if (!game || !Rules.jettison(game, seat, msg.colour, msg.island)) return "can't jettison that now";
      if (Rules.allJettisoned(game)) this.refill();
      return;
    }
    if (!game || !Rules.pick(game, seat, msg.island)) return "can't pick that now";
    if (Rules.allPicked(game)) this.resolve();
  }

  hostMessage(msg, seat) {
    const { names, bots, tokens, game, standIns } = this.room;
    if (msg.type === "seats") { // the whole array, as bots; lobby only
      if (game) return "the game has started";
      const b = msg.bots;
      if (!Array.isArray(b) || b.length < minPlayers || b.length > maxPlayers || b[seat] !== null
        || !b.every(x => x === null || BOT.includes(x))) return "seats must be 3 to 5, open or a bot, the host's open";
      if (bots.some((_, q) => b[q] !== null && this.connected(q))) return "someone is sitting there"; // b[q] is undefined if removed
      // A freed seat loses its token, and a stale connection in it watches.
      this.open().filter(o => { const { seat: q } = o.deserializeAttachment(); return q !== null && b[q] !== null; })
        .forEach(o => o.serializeAttachment({ seat: null }));
      Object.assign(this.room, { bots: b, names: b.map((bot, q) => (bot ? "" : names[q] || null)), tokens: b.map((bot, q) => (bot ? null : tokens[q] ?? null)) });
      return;
    }
    if (msg.type === "free") { // { seat }: an away seat's token stops working, and the seat is open
      const q = msg.seat;
      if (game) return "the game has started";
      if (!Number.isInteger(q) || !tokens[q]) return "that seat isn't held";
      if (this.connected(q)) return "someone is sitting there";
      this.unseat(q);
      return;
    }
    if (msg.type === "start") {
      if (game) return "the game has started";
      const empty = bots.findIndex((bot, q) => !bot && !this.connected(q)); // neither a bot nor a connected person
      if (empty >= 0) return tokens[empty] ? `${names[empty]} is away` : `Seat ${empty + 1} is empty`;
      Object.assign(this.room, { game: Rules.newGame(names, bots, seed(), this.room.rule), standIns: bots.map(() => false),
                                 timers: { pick: pickTimer, next: nextTimer, jettison: jettisonTimer } });
      this.arm("pick");
      return;
    }
    if (msg.type === "rule") { // { rule }: 'jettison' or 'freeze'; lobby only
      if (game) return "the game has started";
      if (!CRASH_RULES.includes(msg.rule)) return "the rule must be jettison or freeze";
      this.room.rule = msg.rule;
      return;
    }
    if (msg.type === "end") { // ends the game early, unfinished, nobody wins; "new" then returns to the lobby
      if (!game || game.winners) return "no game is in play";
      Rules.endEarly(game); this.arm(null);
      return;
    }
    if (!game?.winners) return "the game isn't over"; // "new": back to the lobby
    standIns.forEach((s, q) => s && !this.connected(q) && this.unseat(q)); // a stand-in's seat is open again
    this.room.game = null;
  }

  // Seat q is open: its token stops working, and a silent connection still in it watches.
  unseat(q) {
    this.open().filter(o => o.deserializeAttachment().seat === q).forEach(o => o.serializeAttachment({ seat: null }));
    this.room.tokens[q] = this.room.names[q] = null;
  }

  // Ends the round and marks which seats a stand-in played (for the reveal and the game-over table). If
  // jettisons are owed, a stand-in seat jettisons at once and the jettison timer runs; else the reveal pause,
  // or none once the game is over.
  resolve() {
    const { game, standIns } = this.room;
    Rules.resolve(game); Object.assign(game.history.at(-1), { standIns: [...standIns], botJettisons: standIns.map(() => false) });
    if (!game.jettisons) return this.arm(game.winners ? null : "next");
    standIns.forEach((s, q) => s && game.jettisons[q] === null && this.botJettison(q));
    if (Rules.allJettisoned(game)) this.refill(); else this.arm("jettison");
  }

  // Sneaky's jettison for a slow crasher or a stand-in, marked 🤖 on the round's history entry.
  botJettison(q) {
    const { game } = this.room, { colour, island } = Rules.botJettison(game, q);
    Rules.jettison(game, q, colour, island); game.history.at(-1).botJettisons[q] = true;
  }

  // Every jettison is in: reveal them together, refill, and set the reveal pause (none if the bag ran out).
  refill() {
    const { game } = this.room;
    Rules.refill(game); this.arm(game.winners ? null : "next");
  }

  standInsPick() {
    const { game, standIns } = this.room;
    standIns.forEach((s, q) => s && game.picks[q] === null && Rules.pick(game, q, Rules.botPick(game, q, "Sneaky")));
  }

  // Saves the one pending timer, so alarm() can check it; null clears it. save() sets the alarm. The seconds
  // were copied in at Start.
  arm(kind) {
    const { game, timers } = this.room;
    this.room.timer = kind && { kind, round: game.round, endsAt: Date.now() + timers[kind] * 1000 };
  }

  // The one alarm: the earlier of the phase's own time (the timer, or the lobby's next look while anyone is
  // here) and the expiry. At game over, the expiry alone.
  wake() {
    const { game, timer, usedAt } = this.room;
    const phase = game ? timer?.endsAt : this.open().length ? Date.now() + ALIVE : undefined;
    this.ctx.storage.setAlarm(Math.min(phase ?? Infinity, usedAt + this.idle));
  }

  // Every person has dropped ("room closed") or nobody used the room for 2 hours ("room expired"): the game
  // ends with no winner, and the code names no room any more.
  async close(error = "room closed") {
    this.room = null;
    await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll();
    for (const ws of this.open()) { ws.send(JSON.stringify({ error })); ws.close(1000, error); }
  }

  save() {
    if (!this.room.game) this.seatSpectators();
    this.wake();
    this.ctx.storage.kv.put("room", this.room);
    for (const ws of this.open()) this.send(ws);
  }

  // In the lobby, each open seat no token holds goes to the spectator who sent join earliest. A spectator
  // that never sent join (or was displaced or freed) has no name, and stays watching.
  seatSpectators() {
    const { names, bots, tokens } = this.room;
    const joined = this.open().map(ws => [ws, ws.deserializeAttachment()]).filter(([, a]) => a.seat === null && a.name !== undefined);
    for (const [ws, a] of joined.sort(([, a], [, b]) => a.at - b.at)) {
      const q = bots.findIndex((bot, i) => !bot && !tokens[i]);
      if (q < 0) return;
      tokens[q] = newToken(); names[q] = a.name || `Player ${q + 1}`;
      ws.serializeAttachment({ ...a, seat: q });
    }
  }

  // { seat, view, standIns, hostAway } once the game exists, else { seat, waiting }: each seat's name once a
  // token holds it, and away if its holder isn't connected. Always host, rule (the lobby's crash rule) and
  // timer ({ kind, msLeft } or null); token to the seat's own connection only; error for a refusal.
  send(ws, error) {
    const { seat, displaced } = ws.deserializeAttachment(), { names, bots, tokens, host, rule, game, standIns, timer } = this.room;
    const out = game ? { seat, view: Rules.viewFor(game, seat), standIns, hostAway: !this.connected(host) }
      : { seat, waiting: bots.map((bot, q) => ({ name: bot || tokens[q] ? names[q] : null, bot, away: !bot && !!tokens[q] && !this.connected(q) })) };
    Object.assign(out, { host, rule, timer: timer && { kind: timer.kind, msLeft: Math.max(0, timer.endsAt - Date.now()) } });
    if (seat !== null) out.token = tokens[seat];
    error ??= displaced && "your seat is on another tab or phone";
    ws.send(JSON.stringify(error ? { ...out, error } : out));
  }

  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }

  // A connection in seat q joined or answered a ping in the last ALIVE ms. An open socket alone isn't
  // proof: a frozen phone keeps one open (PIO4 01).
  connected(q) {
    return this.open().some(ws => { const { seat, at } = ws.deserializeAttachment();
      return seat === q && Math.max(at, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0) > Date.now() - ALIVE; });
  }
}

// One per address, by CF-Connecting-IP: at most CAP rooms in any hour. An hour after its latest room it
// forgets the address. Refused, POST /create gets 429 (PIO5 03).
export class Limiter extends DurableObject {
  // True, and counted, if this address may make another room now.
  take() {
    const now = Date.now(), times = (this.ctx.storage.kv.get("times") ?? []).filter(t => t > now - HOUR);
    if (times.length >= CAP) return false;
    this.ctx.storage.kv.put("times", [...times, now]); this.ctx.storage.setAlarm(now + HOUR);
    return true;
  }

  async alarm() { await this.ctx.storage.deleteAll(); }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/room/")) return env.ROOM.getByName(pathname.slice(6)).fetch(request);
    if (pathname !== "/create" || request.method !== "POST") return new Response("Not found", { status: 404 });
    const { name } = await request.json().catch(() => ({})); // { name }: the host's, trimmed as join's
    if (typeof name !== "string") return Response.json({ error: "name must be text" }, { status: 400 });
    const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await env.LIMITER.getByName(address).take())) return Response.json({ error: "too many rooms" }, { status: 429 });
    let code, token; // drawn again while a room already has it
    do code = Array.from(crypto.getRandomValues(new Uint32Array(5)), n => CODE[n % CODE.length]).join("");
    while (!(token = await env.ROOM.getByName(code).create(name.trim().slice(0, 20))));
    return Response.json({ code, token });
  },
};
