// Shared WebSocket message protocol between web client and signal server.
// Audio is 16-bit little-endian PCM, base64-encoded.
//   - mic uplink (client -> server): 16 kHz mono
//   - translated downlink (server -> client): 24 kHz mono

export interface PeerInfo {
  id: string;
  name: string;
  /** Language the peer SPEAKS / wants to HEAR (BCP-47, e.g. "ko", "en", "ja"). */
  lang: string;
  camOn: boolean;
  screenOn: boolean;
}

// ---- Client -> Server ----
export type ClientMessage =
  | { type: "join"; roomId: string; name: string; lang: string }
  | { type: "rename"; name: string }
  | { type: "setLang"; lang: string }
  | { type: "mediaState"; camOn: boolean; screenOn: boolean }
  // WebRTC signaling, relayed verbatim to peer `to`
  | { type: "signal"; to: string; data: unknown }
  | { type: "chat"; text: string }
  // mic PCM frame for translation (16 kHz mono, base64 PCM16)
  | { type: "audio"; pcm: string };

// ---- Server -> Client ----
export type ServerMessage =
  | { type: "joined"; selfId: string; roomId: string; peers: PeerInfo[] }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-left"; id: string }
  | { type: "peer-updated"; peer: PeerInfo }
  | { type: "signal"; from: string; data: unknown }
  | { type: "chat"; from: string; name: string; text: string; ts: number }
  // translated audio of speaker `from`, rendered in THIS client's language
  | { type: "translated-audio"; from: string; pcm: string }
  // optional translated transcript text, if the model emits it
  | { type: "translated-text"; from: string; text: string }
  | { type: "error"; message: string };
