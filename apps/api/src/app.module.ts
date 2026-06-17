import { Module } from '@nestjs/common';
import { SignalModule } from './signal/signal.module';

@Module({
  imports: [SignalModule],
})
export class AppModule {}
