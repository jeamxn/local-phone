import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });

  // simple health endpoint for PaaS probes
  const http = app.getHttpAdapter();
  http.get('/health', (_req: unknown, res: { send: (b: string) => void }) =>
    res.send('ok'),
  );

  const port = Number(process.env.SIGNAL_PORT ?? process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`api listening on :${port}`);
}
void bootstrap();
