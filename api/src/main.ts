import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as path from 'path'
import * as express from 'express'
import * as fs from 'fs'

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS using runtime env `RIGTRACKER_CORS_ORIGIN`.
  // Accepts a comma-separated list of origins, exact origins (https://host) or wildcard patterns like *.example.com
  const corsEnv = (process.env.RIGTRACKER_CORS_ORIGIN || '').trim();
  if (corsEnv) {
    const parts = corsEnv.split(',').map(s => s.trim()).filter(Boolean);
    // build matchers: strings (exact) or RegExp (for patterns containing '*')
    const matchers: Array<string | RegExp> = parts.map(p => {
      if (p.includes('*')) {
        // allow entries like *.example.com or https://*.example.com
        // remove protocol if present
        const withoutProto = p.replace(/^https?:\/\//, '');
        const regexStr = '^https?://'+ withoutProto.replace(/\./g, '\\.') .replace(/\*/g, '[^.]+') + '(?::[0-9]+)?$';
        return new RegExp(regexStr);
      }
      return p;
    });

    // origin function callback for CORS
    const originValidator = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        // allow non-browser requests like curl/postman
        return callback(null, true);
      }
      for (const m of matchers) {
        if (typeof m === 'string') {
          if (m === origin) return callback(null, true);
        } else if (m instanceof RegExp) {
          if (m.test(origin)) return callback(null, true);
        }
      }
      // Do not throw an error here — deny the origin without causing a 500.
      // Returning `callback(null, false)` will cause CORS to not set allow headers
      // for the request but won't raise an exception handled as a server error.
      return callback(null, false);
    };

    app.enableCors({ origin: originValidator, credentials: true });
    console.log('CORS enabled with matcher(s):', parts);
  } else {
    app.enableCors();
    console.log('CORS enabled (default permissive)');
  }

  // Serve built frontend from ./public inside the compiled api folder (if present)
  const server = app.getHttpAdapter().getInstance() as express.Express
  const staticPath = path.join(__dirname, 'public')
  if (fs.existsSync(staticPath)) {
    server.use(express.static(staticPath))

    // Ensure API routes are namespaced so SPA fallback doesn't intercept them
    app.setGlobalPrefix('api')

    // SPA fallback: serve index.html for unmatched GET requests
    server.get('*', (req: any, res: any) => {
      const indexHtml = path.join(staticPath, 'index.html')
      res.sendFile(indexHtml)
    })
  } else {
    // No static assets to serve; still namespace API routes
    app.setGlobalPrefix('api')
  }

  await app.listen(4000, '0.0.0.0');
  console.log('API listening on http://0.0.0.0:4000');
}

bootstrap();
