import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  // In the combined container nginx is the only client, so HOST=127.0.0.1 keeps the API off the network.
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, host);
  console.log(`API listening on http://${host}:${port}`);
}

bootstrap();
