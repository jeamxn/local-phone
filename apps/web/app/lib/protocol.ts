// Mirror of apps/api/src/signal/protocol.ts event names + payload shapes.

export interface PeerInfo {
  id: string;
  name: string;
  lang: string;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
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
  pcm: string;
}
export interface TranslatedText {
  from: string;
  text: string;
}
