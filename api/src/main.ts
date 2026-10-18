import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.js';
import { loadConfig } from './config.js';
import { runMigrations } from './db/migrate.js';

async function bootstrap() {
  const config = loadConfig();
  console.log(`RigTracker ${config.APP_VERSION} (${config.NODE_ENV})`);
  // The database schema is brought up to date before the API starts answering (as TeeMate does,
  // but in-process: one command starts the container, and a failed migration stops it).
  await runMigrations(config.DATABASE_URL);
  console.log('Database migrations applied');
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  await app.listen(config.PORT, config.HOST);
  console.log(`API listening on http://${config.HOST}:${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
