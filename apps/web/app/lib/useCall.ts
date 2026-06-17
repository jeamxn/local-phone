import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket, iceServers } from "~/lib/socket";
import { createMicCapturer, PcmPlayer } from "~/lib/audio";
import {
  EV,
  type PeerInfo,
  type JoinedPayload,
  type SignalRelay,
  type ChatRelay,
  type TranslatedAudio,
  type TranslatedText,
} from "~/lib/protocol";
import type { ListenMode } from "~/lib/languages";

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface RemotePeer extends PeerInfo {
  stream: MediaStream | null;
}

interface PeerConn {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  polite: boolean;
}

export interface UseCall {
  selfId: string;
  connected: boolean;
  peers: RemotePeer[];
  localStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  chat: ChatMsg[];
  listenMode: ListenMode;
  transcripts: Record<string, string>;
  toggleMic: () => void;
  toggleCam: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  sendChat: (text: string) => void;
  rename: (name: string) => void;
  setLang: (lang: string) => void;
  setListenMode: (m: ListenMode) => void;
}

/**
 * Owns the entire call lifecycle for one room:
 *  - Socket.IO signaling (perfect-negotiation WebRTC mesh)
 *  - local media (mic / cam / screen) and renegotiation
 *  - mic PCM uplink for server-side translation
 *  - translated-audio downlink playback gated by listen mode
 *  - chat + presence
 */
export function useCall(roomId: string, name: string, lang: string): UseCall {
  const [selfId, setSelfId] = useState("");
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [listenMode, setListenModeState] = useState<ListenMode>("translated");
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});

  const socketRef = useRef<Socket | null>(null);
  const conns = useRef<Map<string, PeerConn>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStopRef = useRef<(() => void) | null>(null);
  const players = useRef<Map<string, PcmPlayer>>(new Map());
  const selfIdRef = useRef("");
  const listenModeRef = useRef<ListenMode>("translated");

  // keep refs in sync
  useEffect(() => {
    listenModeRef.current = listenMode;
    // Original peer audio is muted at the <video> element level (see room.tsx),
    // NOT by toggling remote track.enabled (that fights element muting and can
    // wedge audio when video toggles). Here we only gate translated playback.
    const translated = listenMode === "translated" || listenMode === "both";
    for (const pl of players.current.values()) pl.setVolume(translated ? 1 : 0);
  }, [listenMode]);

  // ---- per-peer connection ----
  const ensureConn = useCallback((peerId: string, polite: boolean): PeerConn => {
    let conn = conns.current.get(peerId);
    if (conn) return conn;

    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    conn = { pc, makingOffer: false, polite };
    conns.current.set(peerId, conn);

    // push our current local tracks
    const ls = localStreamRef.current;
    if (ls) for (const track of ls.getTracks()) pc.addTrack(track, ls);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current?.emit(EV.signal, { to: peerId, data: { candidate } });
      }
    };

    pc.ontrack = (e) => {
      const [stream] = e.streams;
      setPeers((prev) =>
        prev.map((p) => (p.id === peerId ? { ...p, stream: stream ?? p.stream } : p)),
      );
    };

    pc.onnegotiationneeded = async () => {
      try {
        conn!.makingOffer = true;
        await pc.setLocalDescription();
        socketRef.current?.emit(EV.signal, {
          to: peerId,
          data: { description: pc.localDescription },
        });
      } catch (err) {
        console.error("negotiation error", err);
      } finally {
        conn!.makingOffer = false;
      }
    };

    return conn;
  }, []);

  const closeConn = useCallback((peerId: string) => {
    const conn = conns.current.get(peerId);
    if (conn) {
      try {
        conn.pc.close();
      } catch {
        /* ignore */
      }
      conns.current.delete(peerId);
    }
    const pl = players.current.get(peerId);
    if (pl) {
      pl.close();
      players.current.delete(peerId);
    }
  }, []);

  // ---- handle inbound signaling (perfect negotiation) ----
  const handleSignal = useCallback(
    async (from: string, data: any) => {
      // we are polite if our id sorts higher than theirs (stable tie-break)
      const polite = selfIdRef.current > from;
      const conn = ensureConn(from, polite);
      const pc = conn.pc;

      try {
        if (data.description) {
          const desc = data.description as RTCSessionDescriptionInit;
          const offerCollision =
            desc.type === "offer" &&
            (conn.makingOffer || pc.signalingState !== "stable");
          if (offerCollision && !conn.polite) return; // impolite peer ignores
          await pc.setRemoteDescription(desc);
          if (desc.type === "offer") {
            await pc.setLocalDescription();
            socketRef.current?.emit(EV.signal, {
              to: from,
              data: { description: pc.localDescription },
            });
          }
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data.candidate);
          } catch {
            /* ignore late candidates */
          }
        }
      } catch (err) {
        console.error("signal handling error", err);
      }
    },
    [ensureConn],
  );

  // ---- main socket lifecycle ----
  useEffect(() => {
    if (!roomId || !name) return;
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(EV.join, { roomId, name, lang });
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on(EV.joined, (p: JoinedPayload) => {
      setSelfId(p.selfId);
      selfIdRef.current = p.selfId;
      setPeers(p.peers.map((pi) => ({ ...pi, stream: null })));
      // initiate offers to existing peers (we are the newcomer -> impolite caller)
      for (const peer of p.peers) {
        const conn = ensureConn(peer.id, selfIdRef.current > peer.id);
        // trigger negotiation by adding a transceiver if no tracks yet
        if (!localStreamRef.current) {
          conn.pc.addTransceiver("audio", { direction: "recvonly" });
          conn.pc.addTransceiver("video", { direction: "recvonly" });
        }
      }
    });

    socket.on(EV.peerJoined, ({ peer }: { peer: PeerInfo }) => {
      setPeers((prev) =>
        prev.some((p) => p.id === peer.id) ? prev : [...prev, { ...peer, stream: null }],
      );
    });

    socket.on(EV.peerLeft, ({ id }: { id: string }) => {
      closeConn(id);
      setPeers((prev) => prev.filter((p) => p.id !== id));
      setTranscripts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    socket.on(EV.peerUpdated, ({ peer }: { peer: PeerInfo }) => {
      setPeers((prev) => prev.map((p) => (p.id === peer.id ? { ...p, ...peer } : p)));
    });

    socket.on(EV.signalRelay, ({ from, data }: SignalRelay) => {
      void handleSignal(from, data as any);
    });

    socket.on(EV.chatRelay, (m: ChatRelay) => {
      setChat((prev) => [
        ...prev,
        {
          id: `${m.from}-${m.ts}-${Math.random().toString(36).slice(2, 6)}`,
          from: m.from,
          name: m.name,
          text: m.text,
          ts: m.ts,
          mine: m.from === selfIdRef.current,
        },
      ]);
    });

    socket.on(EV.translatedAudio, ({ from, pcm }: TranslatedAudio) => {
      const mode = listenModeRef.current;
      if (mode !== "translated" && mode !== "both") return;
      let pl = players.current.get(from);
      if (!pl) {
        pl = new PcmPlayer();
        players.current.set(from, pl);
      }
      pl.push(pcm);
    });

    socket.on(EV.translatedText, ({ from, text }: TranslatedText) => {
      setTranscripts((prev) => ({ ...prev, [from]: text }));
    });

    return () => {
      micStopRef.current?.();
      for (const id of [...conns.current.keys()]) closeConn(id);
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name, lang]);

  // ---- local media bootstrap (mic) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        // add mic track to any existing connections
        for (const { pc } of conns.current.values()) {
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
        }
        // start PCM uplink for translation
        startMicCapture(stream);
      } catch (err) {
        console.error("getUserMedia(audio) failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMicCapture = useCallback((stream: MediaStream) => {
    micStopRef.current?.();
    micStopRef.current = createMicCapturer(stream, (pcm) => {
      if (!micOnRef.current) return;
      socketRef.current?.emit(EV.audio, { pcm });
    });
  }, []);

  const micOnRef = useRef(true);
  useEffect(() => {
    micOnRef.current = micOn;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);

  // ---- controls ----
  const toggleMic = useCallback(() => setMicOn((v) => !v), []);

  const addOrReplaceVideoTrack = useCallback((track: MediaStreamTrack, stream: MediaStream) => {
    for (const { pc } of conns.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) void sender.replaceTrack(track);
      else pc.addTrack(track, stream);
    }
  }, []);

  const removeVideoTracks = useCallback(() => {
    for (const { pc } of conns.current.values()) {
      pc.getSenders()
        .filter((s) => s.track?.kind === "video")
        .forEach((s) => void s.replaceTrack(null));
    }
  }, []);

  const toggleCam = useCallback(async () => {
    if (camOn) {
      camTrackRef.current?.stop();
      camTrackRef.current = null;
      if (!screenOn) removeVideoTracks();
      setCamOn(false);
      socketRef.current?.emit(EV.mediaState, { camOn: false, screenOn });
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      camTrackRef.current = track;
      const ls = localStreamRef.current!;
      ls.addTrack(track);
      setLocalStream(new MediaStream(ls.getTracks()));
      addOrReplaceVideoTrack(track, ls);
      setCamOn(true);
      socketRef.current?.emit(EV.mediaState, { camOn: true, screenOn });
    } catch (err) {
      console.error("getUserMedia(video) failed", err);
    }
  }, [camOn, screenOn, addOrReplaceVideoTrack, removeVideoTracks]);

  const toggleScreen = useCallback(async () => {
    if (screenOn) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      // fall back to cam track if camera is on, else remove video
      if (camOn && camTrackRef.current) {
        addOrReplaceVideoTrack(camTrackRef.current, localStreamRef.current!);
      } else {
        removeVideoTracks();
      }
      setScreenOn(false);
      socketRef.current?.emit(EV.mediaState, { camOn, screenOn: false });
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screen;
      const track = screen.getVideoTracks()[0];
      track.onended = () => {
        // user stopped sharing via browser UI
        void toggleScreen();
      };
      addOrReplaceVideoTrack(track, localStreamRef.current!);
      setScreenOn(true);
      socketRef.current?.emit(EV.mediaState, { camOn, screenOn: true });
    } catch (err) {
      console.error("getDisplayMedia failed", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenOn, camOn, addOrReplaceVideoTrack, removeVideoTracks]);

  const sendChat = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    socketRef.current?.emit(EV.chat, { text: t });
  }, []);

  const rename = useCallback((newName: string) => {
    const n = newName.trim();
    if (!n) return;
    socketRef.current?.emit(EV.rename, { name: n });
  }, []);

  const setLang = useCallback((newLang: string) => {
    socketRef.current?.emit(EV.setLang, { lang: newLang });
  }, []);

  const setListenMode = useCallback((m: ListenMode) => {
    setListenModeState(m);
  }, []);

  return {
    selfId,
    connected,
    peers,
    localStream,
    micOn,
    camOn,
    screenOn,
    chat,
    listenMode,
    transcripts,
    toggleMic,
    toggleCam,
    toggleScreen,
    sendChat,
    rename,
    setLang,
    setListenMode,
  };
}
