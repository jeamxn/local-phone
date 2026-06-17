import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "./protocol.js";
import { Rooms, peerInfo, type Peer } from "./rooms.js";

const PORT = Number(process.env.SIGNAL_PORT ?? 8080);

const rooms = new Rooms();
const wss = new WebSocketServer({ port: PORT });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(roomId: string, exceptId: string, msg: ServerMessage): void {
  for (const p of rooms.others(roomId, exceptId)) send(p.ws, msg);
}

wss.on("connection", (ws) => {
  let self: Peer | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "invalid json" });
      return;
    }

    // join must come first
    if (!self) {
      if (msg.type !== "join") {
        send(ws, { type: "error", message: "must join first" });
        return;
      }
      const roomId = msg.roomId.trim();
      if (!roomId) {
        send(ws, { type: "error", message: "roomId required" });
        return;
      }
      self = {
        id: randomUUID(),
        ws,
        name: (msg.name || "Guest").slice(0, 40),
        lang: msg.lang || "en",
        camOn: false,
        screenOn: false,
        roomId,
      };
      rooms.add(self);

      const peers = rooms.others(roomId, self.id).map(peerInfo);
      send(ws, { type: "joined", selfId: self.id, roomId, peers });
      broadcast(roomId, self.id, { type: "peer-joined", peer: peerInfo(self) });
      return;
    }

    switch (msg.type) {
      case "rename": {
        self.name = (msg.name || self.name).slice(0, 40);
        broadcast(self.roomId, self.id, { type: "peer-updated", peer: peerInfo(self) });
        break;
      }
      case "setLang": {
        self.lang = msg.lang || self.lang;
        broadcast(self.roomId, self.id, { type: "peer-updated", peer: peerInfo(self) });
        break;
      }
      case "mediaState": {
        self.camOn = !!msg.camOn;
        self.screenOn = !!msg.screenOn;
        broadcast(self.roomId, self.id, { type: "peer-updated", peer: peerInfo(self) });
        break;
      }
      case "signal": {
        const target = rooms.get(self.roomId, msg.to);
        if (target) send(target.ws, { type: "signal", from: self.id, data: msg.data });
        break;
      }
      case "chat": {
        const text = String(msg.text ?? "").slice(0, 2000);
        if (!text) break;
        const payload: ServerMessage = {
          type: "chat",
          from: self.id,
          name: self.name,
          text,
          ts: Date.now(),
        };
        // echo to self too so sender sees ordering consistent with server
        send(ws, payload);
        broadcast(self.roomId, self.id, payload);
        break;
      }
      case "audio": {
        // translation handled in a later module; ignored for now
        break;
      }
      default:
        break;
    }
  });

  const cleanup = () => {
    if (!self) return;
    rooms.remove(self.roomId, self.id);
    broadcast(self.roomId, self.id, { type: "peer-left", id: self.id });
    self = null;
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

console.log(`[signal] listening on :${PORT}`);
