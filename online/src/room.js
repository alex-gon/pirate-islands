// The one online room: a Durable Object that holds one game on rules.js and sends each connection
// only its own view. Its messages are decided in PIO2 02 (the vault). Words: CONTEXT.md.
import { DurableObject } from "cloudflare:workers";
import "../../rules.js"; // a classic script: sets globalThis.Rules
const { Rules } = globalThis;

// One entry per seat: null for a person, or a bot personality ('Greedy', 'Sneaky' or 'Wild').
const SEATS = [null, null, null];
const TYPES = ["join", "pick", "next", "new"];
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // names[seat] is null until a person joins it; a bot seat's '' becomes "Player N" in the game.
    this.room = ctx.storage.kv.get("room") ?? { names: SEATS.map(bot => (bot ? "" : null)), game: null };
  }

  fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
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

  webSocketClose(ws, code) { ws.close(code); }

  // Applies one message from ws, or returns a short reason to refuse it.
  handle(ws, data) {
    let msg; try { msg = JSON.parse(data); } catch {}
    if (typeof data !== "string" || data.length > 1024) return "message too long";
    if (!TYPES.includes(msg?.type)) return "unknown message";
    const { seat } = ws.deserializeAttachment(), { names, game } = this.room;
    if (msg.type === "join") {
      if (seat !== null) return "already seated";
      if (typeof msg.name !== "string") return "name must be text";
      // Its own name's vacant seat, else the lowest vacant seat, else none: a spectator.
      const name = msg.name.trim().slice(0, 20), taken = this.taken();
      const vacant = SEATS.flatMap((bot, q) => (bot || taken.has(q) ? [] : [q]));
      const mine = vacant.find(q => names[q] === (name || `Player ${q + 1}`)) ?? vacant[0] ?? null;
      ws.serializeAttachment({ seat: mine });
      if (mine === null || game) return; // during a game the seat keeps its saved name
      names[mine] = name || `Player ${mine + 1}`;
      if (vacant.length === 1) this.room.game = Rules.newGame(names, SEATS, seed()); // every person is here
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
    this.room.game = Rules.newGame(names, SEATS, seed()); // "new": same seats and names, fresh seed
  }

  // { seat, view } once the game exists, else { seat, waiting }; plus error for a refusal.
  send(ws, error) {
    const { seat } = ws.deserializeAttachment(), { names, game } = this.room, taken = this.taken();
    const out = game ? { seat, view: Rules.viewFor(game, seat) }
      : { seat, waiting: SEATS.map((bot, q) => ({ name: bot || taken.has(q) ? names[q] : null, bot })) };
    ws.send(JSON.stringify(error ? { ...out, error } : out));
  }

  open() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }
  taken() { return new Set(this.open().map(ws => ws.deserializeAttachment().seat)); }
}

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname === "/room") return env.ROOM.getByName("one").fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
