import { io, type Socket } from "socket.io-client";

export function signalUrl(): string {
  // Browser-visible URL of the Nest Socket.IO gateway.
  const fromEnv =
    typeof window !== "undefined"
      ? (window as unknown as { __SIGNAL_URL__?: string }).__SIGNAL_URL__
      : undefined;
  if (fromEnv) return fromEnv;
  // import.meta.env is inlined by Vite at build time
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_SIGNAL_URL || "http://localhost:8080";
}

export function iceServers(): RTCIceServer[] {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const extra = env?.VITE_ICE_SERVERS || "";
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  for (const item of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
    // format: turn:host:port|user|credential  OR  stun:host:port
    const [urls, username, credential] = item.split("|");
    if (username && credential) {
      servers.push({ urls, username, credential });
    } else {
      servers.push({ urls });
    }
  }
  return servers;
}

export function createSocket(): Socket {
  return io(signalUrl(), {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
