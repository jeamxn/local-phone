import type { Socket } from 'socket.io';
import type { PeerInfo } from './protocol';

export interface Peer {
  id: string;
  socket: Socket;
  name: string;
  lang: string;
  camOn: boolean;
  screenOn: boolean;
  roomId: string;
}

export function peerInfo(p: Peer): PeerInfo {
  return {
    id: p.id,
    name: p.name,
    lang: p.lang,
    camOn: p.camOn,
    screenOn: p.screenOn,
  };
}

/** In-memory room registry. Rooms are created on demand and dropped when empty. */
export class Rooms {
  private rooms = new Map<string, Map<string, Peer>>();

  add(peer: Peer): void {
    let room = this.rooms.get(peer.roomId);
    if (!room) {
      room = new Map();
      this.rooms.set(peer.roomId, room);
    }
    room.set(peer.id, peer);
  }

  remove(roomId: string, peerId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.delete(peerId);
    if (room.size === 0) this.rooms.delete(roomId);
  }

  get(roomId: string, peerId: string): Peer | undefined {
    return this.rooms.get(roomId)?.get(peerId);
  }

  /** Everyone in the room except `exceptId`. */
  others(roomId: string, exceptId: string): Peer[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.values()].filter((p) => p.id !== exceptId);
  }

  all(roomId: string): Peer[] {
    const room = this.rooms.get(roomId);
    return room ? [...room.values()] : [];
  }

  /** Distinct languages among peers other than `exceptId`. */
  distinctLangs(roomId: string, exceptId: string): string[] {
    const langs = new Set<string>();
    for (const p of this.others(roomId, exceptId)) langs.add(p.lang);
    return [...langs];
  }
}
