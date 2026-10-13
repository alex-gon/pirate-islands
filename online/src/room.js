// Rooms by code: each is a Durable Object that holds one game on rules.js and sends each connection
// only its own view. Its messages are decided in PIO2 02 and PIO3 02 (the vault). Words: CONTEXT.md.
import { DurableObject } from "cloudflare:workers";
import "../../rules.js"; // a classic script: sets globalThis.Rules
const { Rules } = globalThis;

const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alikes: 0/O, 1/I/L
const TYPES = ["join", "seats", "start", "pick", "next", "new"], HOST = ["seats", "start", "new"];
const BOT = Rules.BOTS.personalities.map(p => p.name), { minPlayers, maxPlayers } = Rules.RULES;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // null until POST /create. bots[seat]: null for a person, or a personality ('Greedy', 'Sneaky' or
    // 'Wild'). names[seat] is null until a person joins it; a bot seat's '' becomes "Player N" in the game.
    this.room = ctx.storage.kv.get("room") ?? null;
  }

  // Called by the Worker with a fresh code: 3 open seats, the host's name on seat 0. False if taken.
  create(name) {
    if (this.room) return false;
    this.room = { names: [name || "Player 1", null, null], bots: [null, null, null], game: null };
    this.ctx.storage.kv.put("room", this.room);
    return true;
  }

  fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    if (!this.room) { // nothing saved: no POST /create made this code
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
    this.ctx.storage.kv.put("room", this.room);
    for (const other of this.open()) this.send(other);
  }

  // The others hear that the seat is free. A plain close: 1005 and 1006 can't be sent back.
  webSocketClose(ws) { ws.close(); for (const other of this.open()) this.send(other); }

  // Applies one message from ws, or returns a short reason to refuse it.
  handle(ws, data) {
    let msg; try { msg = JSON.parse(data); } catch {}
    if (typeof data !== "string" || data.length > 1024) return "message too long";
    if (!TYPES.includes(msg?.type)) return "unknown message";
    const { seat } = ws.deserializeAttachment(), { names, bots, game } = this.room, taken = this.taken();
    if (msg.type === "join") {
      if (seat !== null) return "already seated";
      if (typeof msg.name !== "string") return "name must be text";
      // Its own name's vacant seat, else the lowest vacant seat but the host's, else none: a spectator.
      const name = msg.name.trim().slice(0, 20), vacant = bots.flatMap((bot, q) => (bot || taken.has(q) ? [] : [q]));
      const mine = vacant.find(q => names[q] === (name || `Player ${q + 1}`)) ?? vacant.find(q => q > 0) ?? null;
      ws.serializeAttachment({ seat: mine });
      if (mine !== null && !game) names[mine] = name || `Player ${mine + 1}`; // during a game the seat keeps its saved name
      return;
    }
    if (HOST.includes(msg.type) && seat !== 0) return "only the host can do that"; // the host is whoever holds seat 0
    if (msg.type === "seats") { // the whole array, as bots; lobby only
      if (game) return "the game has started";
      const b = msg.bots;
      if (!Array.isArray(b) || b.length < minPlayers || b.length > maxPlayers || b[0] !== null
        || !b.every(x => x === null || BOT.includes(x))) return "seats must be 3 to 5, open or a bot, the host's open";
      if ([...taken].some(q => q !== null && b[q] !== null)) return "someone is sitting there"; // b[q] is undefined if removed
      this.room.bots = b;
      this.room.names = b.map((bot, q) => (bot ? "" : names[q] || null)); // a closed tab's name stays, so it can rejoin
      return;
    }
    if (msg.type === "start") {
      if (game) return "the game has started";
      const empty = bots.findIndex((bot, q) => !bot && !taken.has(q)); // neither a bot nor a connected person
      if (empty >= 0) return `Seat ${empty + 1} is empty`;
      this.room.game = Rules.newGame(names, bots, seed()); // the room no longer starts by itself
      return;
    }
    if (seat === null) return "you have no seat";
    if (msg.type === "pick") {
      if (!Number.isInteger(msg.island)) return "island must be a whole number";
      if (!game || !Rules.pick(game, seat, msg.island)) return "can't pick that now";
      if (Rules.allPicked(game)) Rules.resolve(game); // build scaffolding: Project 4's pick timer replaces it
      return;
    }
    if (msg.type === "next") return game && Rules.nextRound(game) ? undefined : "no round to start"; // build scaffolding, as above
    if (!game?.winners) return "the game isn't over";
    this.room.game = null; // "new": back to the lobby, seats and names kept
  }

  // { seat, view } once the game exists, else { seat, waiting }; plus error for a refusal.
  send(ws, error) {
    const { seat } = ws.deserializeAttachment(), { names, bots, game } = this.room, taken = this.taken();
    const out = game ? { seat, view: Rules.viewFor(game, seat) }
      : { seat, waiting: bots.map((bot, q) => ({ name: bot || taken.has(q) ? names[q] : null, bot })) };
    ws.send(JSON.stringify(error ? { ...out, error } : out));
  }

  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }
  taken() { return new Set(this.open().map(ws => ws.deserializeAttachment().seat)); }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/room/")) return env.ROOM.getByName(pathname.slice(6)).fetch(request);
    if (pathname !== "/create" || request.method !== "POST") return new Response("Not found", { status: 404 });
    const { name } = await request.json().catch(() => ({})); // { name }: the host's, trimmed as join's
    if (typeof name !== "string") return Response.json({ error: "name must be text" }, { status: 400 });
    let code; // drawn again while a room already has it
    do code = Array.from(crypto.getRandomValues(new Uint32Array(5)), n => CODE[n % CODE.length]).join("");
    while (!(await env.ROOM.getByName(code).create(name.trim().slice(0, 20))));
    return Response.json({ code });
  },
};
