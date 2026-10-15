// Rooms by code: each is a Durable Object that holds one game on rules.js and sends each connection
// only its own view. Its messages are decided in PIO2 02, PIO3 02 and PIO4 03 (the vault). Words: CONTEXT.md.
import { DurableObject } from "cloudflare:workers";
import "../../rules.js"; // a classic script: sets globalThis.Rules
const { Rules } = globalThis;

const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes: 0/O, 1/I/L
const TYPES = ["join", "seats", "start", "pick", "new"], HOST = ["seats", "start", "new"];
const BOT = Rules.BOTS.personalities.map(p => p.name), { minPlayers, maxPlayers, pickTimer, nextTimer } = Rules.RULES;
const ALIVE = 15000, LATE = 2000; // ms: connected = a ping answered this recently; an alarm this late restarts its phase
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const newToken = () => crypto.getRandomValues(new Uint8Array(16)).toBase64({ alphabet: "base64url", omitPadding: true });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // null until POST /create. bots[seat]: null for a person, or a personality ('Greedy', 'Sneaky' or
    // 'Wild'). names[seat] is null until a person joins it; a bot seat's '' becomes "Player N" in the game.
    // tokens[seat]: the seat token its person holds, or null. host: a seat. timer: the one pending alarm.
    this.room = ctx.storage.kv.get("room") ?? null;
    if (this.room && !this.room.tokens) this.room = null; // saved before seat tokens: treated as never made
    // The page pings every 5 s; the answer doesn't wake the room, and its time says the phone is there.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // Called by the Worker with a fresh code: 3 open seats, the host's name and a token on seat 0.
  // Returns that token, or null if the code is taken.
  create(name) {
    if (this.room) return null;
    const token = newToken();
    this.room = { names: [name || "Player 1", null, null], bots: [null, null, null], tokens: [token, null, null], host: 0, game: null, timer: null };
    this.ctx.storage.kv.put("room", this.room);
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
    this.save();
  }

  // The others hear that the seat is free. A plain close: 1005 and 1006 can't be sent back.
  webSocketClose(ws) { ws.close(); if (this.room) for (const other of this.open()) this.send(other); }

  // The pick timer or the countdown ran out. It acts only on the timer it saved, and never throws:
  // a throwing alarm is retried, which could resolve a round twice (PIO4 02).
  async alarm() {
    const t = this.room?.timer, game = this.room?.game;
    if (!t || t.round !== game?.round) return;
    try {
      if (Date.now() > t.endsAt + LATE) this.arm(t.kind); // the server was down: start the phase again, so phones can return
      else if (t.kind === "next") {
        this.room.standIns = this.room.standIns.map((s, q) => s && !this.connected(q)); // a returned person plays again
        Rules.nextRound(game); this.standInsPick(); this.arm("pick");
      } else {
        // No pick yet: connected is skipped, gone is dropped and gets a stand-in. If every person is gone, the room closes.
        const { standIns } = this.room, people = game.players.flatMap((p, q) => (p.bot ? [] : [q]));
        for (const q of people) if (game.picks[q] === null && !this.connected(q)) standIns[q] = true;
        if (people.every(q => standIns[q] && !this.connected(q))) return await this.close();
        this.standInsPick(); this.resolve();
      }
      this.save();
    } catch (e) { console.error(e); this.room = this.ctx.storage.kv.get("room") ?? null; }
  }

  // Applies one message from ws, or returns a short reason to refuse it.
  handle(ws, data) {
    let msg; try { msg = JSON.parse(data); } catch {}
    if (typeof data !== "string" || data.length > 1024) return "message too long";
    if (!TYPES.includes(msg?.type)) return "unknown message";
    const { seat } = ws.deserializeAttachment(), { names, bots, tokens, game } = this.room;
    if (msg.type === "join") { // { name, token? }
      if (seat !== null) return "already seated";
      if (typeof msg.name !== "string") return "name must be text";
      // The token's seat, its older connection now watching; else the lowest open seat no token holds; else a spectator.
      const name = msg.name.trim().slice(0, 20);
      let q = typeof msg.token === "string" ? tokens.indexOf(msg.token) : -1;
      if (q >= 0) this.open().filter(o => o.deserializeAttachment().seat === q).forEach(o => o.serializeAttachment({ seat: null, displaced: true }));
      else if ((q = bots.findIndex((bot, i) => !bot && !tokens[i])) >= 0) tokens[q] = newToken();
      ws.serializeAttachment({ seat: q >= 0 ? q : null, at: Date.now() });
      if (q >= 0 && !game) names[q] = name || `Player ${q + 1}`; // during a game the seat keeps its saved name
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
    if (!Number.isInteger(msg.island)) return "island must be a whole number"; // pick
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
    if (msg.type === "start") {
      if (game) return "the game has started";
      const empty = bots.findIndex((bot, q) => !bot && !this.taken().has(q)); // neither a bot nor a connected person
      if (empty >= 0) return `Seat ${empty + 1} is empty`;
      Object.assign(this.room, { game: Rules.newGame(names, bots, seed()), timers: { pick: pickTimer, next: nextTimer }, standIns: bots.map(() => false) });
      this.arm("pick");
      return;
    }
    if (!game?.winners) return "the game isn't over"; // "new": back to the lobby
    const taken = this.taken();
    standIns.forEach((s, q) => { if (s && !taken.has(q)) tokens[q] = names[q] = null; }); // a stand-in's seat is open again
    this.room.game = null;
  }

  // Ends the round, marks which seats a stand-in played (for the reveal and the game-over table), and sets
  // the countdown, or none once the game is over.
  resolve() {
    const { game, standIns } = this.room;
    Rules.resolve(game); game.history.at(-1).standIns = [...standIns];
    this.arm(game.winners ? null : "next");
  }

  standInsPick() {
    const { game, standIns } = this.room;
    standIns.forEach((s, q) => s && game.picks[q] === null && Rules.pick(game, q, Rules.botPick(game, q, "Sneaky")));
  }

  // Saves the one pending timer, so alarm() can check it; null clears it. The seconds were copied in at Start.
  arm(kind) {
    const { game, timers } = this.room;
    this.room.timer = kind && { kind, round: game.round, endsAt: Date.now() + timers[kind] * 1000 };
    if (kind) this.ctx.storage.setAlarm(this.room.timer.endsAt); else this.ctx.storage.deleteAlarm();
  }

  // Every person has dropped: the game ends with no winner, and the code names no room any more.
  async close() {
    this.room = null;
    await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll();
    for (const ws of this.open()) { ws.send(JSON.stringify({ error: "room closed" })); ws.close(1000, "room closed"); }
  }

  save() {
    this.ctx.storage.kv.put("room", this.room);
    for (const ws of this.open()) this.send(ws);
  }

  // { seat, view, standIns } once the game exists, else { seat, waiting }; always host and timer
  // ({ kind, msLeft } or null); token to the seat's own connection only; error for a refusal.
  send(ws, error) {
    const { seat, displaced } = ws.deserializeAttachment(), { names, bots, tokens, host, game, standIns, timer } = this.room, taken = this.taken();
    const out = game ? { seat, view: Rules.viewFor(game, seat), standIns }
      : { seat, waiting: bots.map((bot, q) => ({ name: bot || taken.has(q) ? names[q] : null, bot })) };
    Object.assign(out, { host, timer: timer && { kind: timer.kind, msLeft: Math.max(0, timer.endsAt - Date.now()) } });
    if (seat !== null) out.token = tokens[seat];
    error ??= displaced && "your seat is on another tab or phone";
    ws.send(JSON.stringify(error ? { ...out, error } : out));
  }

  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }
  taken() { return new Set(this.open().map(ws => ws.deserializeAttachment().seat)); }

  // A connection in seat q joined or answered a ping in the last ALIVE ms. An open socket alone isn't
  // proof: a frozen phone keeps one open (PIO4 01).
  connected(q) {
    return this.open().some(ws => { const { seat, at } = ws.deserializeAttachment();
      return seat === q && Math.max(at, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0) > Date.now() - ALIVE; });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/room/")) return env.ROOM.getByName(pathname.slice(6)).fetch(request);
    if (pathname !== "/create" || request.method !== "POST") return new Response("Not found", { status: 404 });
    const { name } = await request.json().catch(() => ({})); // { name }: the host's, trimmed as join's
    if (typeof name !== "string") return Response.json({ error: "name must be text" }, { status: 400 });
    let code, token; // drawn again while a room already has it
    do code = Array.from(crypto.getRandomValues(new Uint32Array(5)), n => CODE[n % CODE.length]).join("");
    while (!(token = await env.ROOM.getByName(code).create(name.trim().slice(0, 20))));
    return Response.json({ code, token });
  },
};
