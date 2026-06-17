import { Module } from '@nestjs/common';
import { SignalGateway } from './signal.gateway';
import { TranslationService } from './translation.service';
import { Rooms } from './rooms';

@Module({
  providers: [
    SignalGateway,
    TranslationService,
    { provide: Rooms, useValue: new Rooms() },
  ],
})
export class SignalModule {}
