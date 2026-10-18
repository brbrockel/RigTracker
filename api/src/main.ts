import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  console.log(`RigTracker ${config.APP_VERSION} (${config.NODE_ENV})`);
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // In the combined container nginx is the only client, so HOST=127.0.0.1 keeps the API off the network.
  const host = config.HOST;
  const port = config.PORT;
  await app.listen(port, host);
  console.log(`API listening on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
