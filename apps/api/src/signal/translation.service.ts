import { Injectable, Logger } from '@nestjs/common';
import { TranslationHub } from './translate';
import { Rooms } from './rooms';
import type { Server } from 'socket.io';
import { EV } from './protocol';

/**
 * Owns the TranslationHub and routes translated audio/text back to listeners
 * by language. The gateway delegates audio frames here.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger('Translation');
  private hub: TranslationHub;
  private server: Server | null = null;
  // speakerId -> roomId, so translated output can be routed.
  private speakerRoom = new Map<string, string>();

  constructor(private readonly rooms: Rooms) {
    this.hub = new TranslationHub(
      (speakerId, targetLang, pcm) => this.routeAudio(speakerId, targetLang, pcm),
      (speakerId, targetLang, text) => this.routeText(speakerId, targetLang, text),
    );
    this.logger.log(
      `translation ${this.hub.enabled ? 'ENABLED' : 'DISABLED (no Vertex creds)'}`,
    );
  }

  get enabled(): boolean {
    return this.hub.enabled;
  }

  setServer(server: Server): void {
    this.server = server;
  }

  register(speakerId: string, roomId: string): void {
    this.speakerRoom.set(speakerId, roomId);
  }

  unregister(speakerId: string): void {
    this.hub.closeSpeaker(speakerId);
    this.speakerRoom.delete(speakerId);
  }

  pushAudio(speakerId: string, speakerLang: string, roomId: string, pcm: string): void {
    if (!this.hub.enabled || !pcm) return;
    const targetLangs = this.rooms.distinctLangs(roomId, speakerId);
    if (targetLangs.length === 0) return;
    void this.hub.pushAudio(speakerId, targetLangs, speakerLang, pcm);
  }

  private routeAudio(speakerId: string, targetLang: string, pcm: string): void {
    const roomId = this.speakerRoom.get(speakerId);
    if (!roomId || !this.server) return;
    for (const p of this.rooms.others(roomId, speakerId)) {
      if (p.lang === targetLang) {
        p.socket.emit(EV.translatedAudio, { from: speakerId, pcm });
      }
    }
  }

  private routeText(speakerId: string, targetLang: string, text: string): void {
    const roomId = this.speakerRoom.get(speakerId);
    if (!roomId || !this.server) return;
    for (const p of this.rooms.others(roomId, speakerId)) {
      if (p.lang === targetLang) {
        p.socket.emit(EV.translatedText, { from: speakerId, text });
      }
    }
  }
}
