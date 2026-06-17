// Socket.IO event payloads shared between web client and Nest gateway.
// Audio is 16-bit little-endian PCM, base64-encoded.
//   - mic uplink (client -> server): 16 kHz mono
//   - translated downlink (server -> client): 24 kHz mono

export interface PeerInfo {
  id: string;
  name: string;
  /** Language the peer SPEAKS / wants to HEAR (BCP-47, e.g. "ko", "en"). */
  lang: string;
  camOn: boolean;
  screenOn: boolean;
}

// ---- Client -> Server events ----
export interface JoinPayload {
  roomId: string;
  name: string;
  lang: string;
}
export interface RenamePayload {
  name: string;
}
export interface SetLangPayload {
  lang: string;
}
export interface MediaStatePayload {
  camOn: boolean;
  screenOn: boolean;
}
export interface SignalPayload {
  to: string;
  data: unknown;
}
export interface ChatPayload {
  text: string;
}
export interface AudioPayload {
  pcm: string; // base64 PCM16 16 kHz mono
}

// ---- Server -> Client events ----
export interface JoinedPayload {
  selfId: string;
  roomId: string;
  peers: PeerInfo[];
}
export interface SignalRelay {
  from: string;
  data: unknown;
}
export interface ChatRelay {
  from: string;
  name: string;
  text: string;
  ts: number;
}
export interface TranslatedAudio {
  from: string;
  pcm: string; // base64 PCM16 24 kHz mono
}
export interface TranslatedText {
  from: string;
  text: string;
}

export const EV = {
  // client -> server
  join: "join",
  rename: "rename",
  setLang: "setLang",
  mediaState: "mediaState",
  signal: "signal",
  chat: "chat",
  audio: "audio",
  // server -> client
  joined: "joined",
  peerJoined: "peer-joined",
  peerLeft: "peer-left",
  peerUpdated: "peer-updated",
  signalRelay: "signal",
  chatRelay: "chat",
  translatedAudio: "translated-audio",
  translatedText: "translated-text",
  errored: "errored",
} as const;
