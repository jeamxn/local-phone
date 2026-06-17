import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { Rooms, peerInfo, type Peer } from './rooms';
import { TranslationService } from './translation.service';
import {
  EV,
  type JoinPayload,
  type RenamePayload,
  type SetLangPayload,
  type MediaStatePayload,
  type SignalPayload,
  type ChatPayload,
  type AudioPayload,
} from './protocol';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  // audio frames can be a few KB; keep buffer generous
  maxHttpBufferSize: 5e6,
})
export class SignalGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('SignalGateway');
  @WebSocketServer() server!: Server;

  constructor(
    private readonly rooms: Rooms,
    private readonly translation: TranslationService,
  ) {}

  afterInit(server: Server): void {
    this.translation.setServer(server);
    this.logger.log('gateway initialized');
  }

  handleConnection(): void {
    // peer is created on `join`, not on raw connect
  }

  handleDisconnect(@ConnectedSocket() socket: Socket): void {
    const self = this.peerOf(socket);
    if (!self) return;
    this.translation.unregister(self.id);
    this.rooms.remove(self.roomId, self.id);
    socket.to(self.roomId).emit(EV.peerLeft, { id: self.id });
  }

  // ---- helpers ----
  private peerOf(socket: Socket): Peer | undefined {
    const id = socket.data?.peerId as string | undefined;
    const roomId = socket.data?.roomId as string | undefined;
    if (!id || !roomId) return undefined;
    return this.rooms.get(roomId, id);
  }

  // ---- events ----
  @SubscribeMessage(EV.join)
  onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: JoinPayload,
  ): void {
    const roomId = (body?.roomId ?? '').trim();
    if (!roomId) {
      socket.emit(EV.errored, { message: 'roomId required' });
      return;
    }
    const self: Peer = {
      id: socket.id,
      socket,
      name: (body.name || 'Guest').slice(0, 40),
      lang: body.lang || 'en',
      camOn: false,
      screenOn: false,
      roomId,
    };
    socket.data.peerId = self.id;
    socket.data.roomId = roomId;
    socket.join(roomId);
    this.rooms.add(self);
    this.translation.register(self.id, roomId);

    const peers = this.rooms.others(roomId, self.id).map(peerInfo);
    socket.emit(EV.joined, { selfId: self.id, roomId, peers });
    socket.to(roomId).emit(EV.peerJoined, { peer: peerInfo(self) });
  }

  @SubscribeMessage(EV.rename)
  onRename(@ConnectedSocket() socket: Socket, @MessageBody() body: RenamePayload): void {
    const self = this.peerOf(socket);
    if (!self) return;
    self.name = (body?.name || self.name).slice(0, 40);
    this.server.to(self.roomId).emit(EV.peerUpdated, { peer: peerInfo(self) });
  }

  @SubscribeMessage(EV.setLang)
  onSetLang(@ConnectedSocket() socket: Socket, @MessageBody() body: SetLangPayload): void {
    const self = this.peerOf(socket);
    if (!self) return;
    self.lang = body?.lang || self.lang;
    this.server.to(self.roomId).emit(EV.peerUpdated, { peer: peerInfo(self) });
  }

  @SubscribeMessage(EV.mediaState)
  onMediaState(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: MediaStatePayload,
  ): void {
    const self = this.peerOf(socket);
    if (!self) return;
    self.camOn = !!body?.camOn;
    self.screenOn = !!body?.screenOn;
    this.server.to(self.roomId).emit(EV.peerUpdated, { peer: peerInfo(self) });
  }

  @SubscribeMessage(EV.signal)
  onSignal(@ConnectedSocket() socket: Socket, @MessageBody() body: SignalPayload): void {
    const self = this.peerOf(socket);
    if (!self || !body?.to) return;
    const target = this.rooms.get(self.roomId, body.to);
    if (target) target.socket.emit(EV.signalRelay, { from: self.id, data: body.data });
  }

  @SubscribeMessage(EV.chat)
  onChat(@ConnectedSocket() socket: Socket, @MessageBody() body: ChatPayload): void {
    const self = this.peerOf(socket);
    if (!self) return;
    const text = String(body?.text ?? '').slice(0, 2000);
    if (!text) return;
    const payload = { from: self.id, name: self.name, text, ts: Date.now() };
    this.server.to(self.roomId).emit(EV.chatRelay, payload);
  }

  @SubscribeMessage(EV.audio)
  onAudio(@ConnectedSocket() socket: Socket, @MessageBody() body: AudioPayload): void {
    const self = this.peerOf(socket);
    if (!self) return;
    this.translation.pushAudio(self.id, self.lang, self.roomId, body?.pcm ?? '');
  }
}
