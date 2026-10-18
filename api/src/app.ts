import type { INestApplication } from '@nestjs/common';
import * as path from 'path';
import * as express from 'express';
import * as fs from 'fs';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { AuthService } from './auth/auth.service';
import { SERVED_UPLOAD_EXTENSIONS } from './uploads/uploads.controller';
import { MongoErrorsFilter } from './common/mongo-errors.filter';
import { uploadsDir } from './common/uploads-dir';

// Filters only use fields in the schema. Request values reach filters only after the
// controllers' zod checks make them plain strings (so ?id[$ne]=x is refused, not run).
mongoose.set('strictQuery', true);

/** Settings shared by the real server and the tests. */
export function configureApp(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.disable('x-powered-by');
  app.useGlobalFilters(new MongoErrorsFilter(app.getHttpAdapter()));
  server.use(helmet());

  // Changes must come from this site. Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE,
  // so a page on another (sub)domain can't make changes with the visitor's session cookie.
  // CORS-allowed origins (below) are let through too.
  server.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      // Not a URL: treated as cross-site below.
    }
    if (originHost && originHost === req.headers.host) return next();
    if (isCorsAllowed(origin)) return next();
    res.status(403).json({ statusCode: 403, message: 'Cross-site request blocked' });
  });

  // Enable CORS using runtime env `RIGTRACKER_CORS_ORIGIN`.
  // Accepts a comma-separated list of origins, exact origins (https://host) or wildcard patterns like *.example.com
  if (corsParts.length) {
    const parts = corsParts;
    // origin function callback for CORS
    const originValidator = (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        // allow non-browser requests like curl/postman
        return callback(null, true);
      }
      // Deny without an error, so a refused origin isn't a 500.
      return callback(null, isCorsAllowed(origin));
    };

    app.enableCors({ origin: originValidator, credentials: true });
    console.log('CORS enabled with matcher(s):', parts);
  } else {
    // Same-origin only: the web app is served from this site, so no CORS headers are sent.
    console.log('CORS disabled (same-origin only)');
  }

  // Serve built frontend from ./public inside the compiled api folder (if present)
  const staticPath = path.join(__dirname, 'public');
  const uploadsPath = uploadsDir();
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }

  // Uploaded media is for signed-in users only, and only known media types are served.
  const authService = app.get(AuthService);
  server.use(
    '/uploads',
    async (req, res, next) => {
      try {
        const ext = path.extname(req.path).toLowerCase();
        if (!SERVED_UPLOAD_EXTENSIONS.has(ext) || req.path.includes('/.')) {
          res.status(404).end();
          return;
        }
        const sessionId = authService.extractCookie(
          req.headers.cookie,
          authService.getSessionCookieName(),
        );
        if (!(await authService.getAuthenticatedUser(sessionId))) {
          res.status(401).end();
          return;
        }
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Cache-Control', 'private, max-age=86400');
        next();
      } catch (err) {
        next(err);
      }
    },
    express.static(uploadsPath, { dotfiles: 'deny', index: false }),
  );

  if (fs.existsSync(staticPath)) {
    server.use(express.static(staticPath));

    // Ensure API routes are namespaced so SPA fallback doesn't intercept them
    app.setGlobalPrefix('api');

    // SPA fallback: serve index.html for unmatched GET requests
    server.get('*', (req: any, res: any) => {
      const indexHtml = path.join(staticPath, 'index.html');
      res.sendFile(indexHtml);
    });
  } else {
    // No static assets to serve; still namespace API routes
    app.setGlobalPrefix('api');
  }
}

// RIGTRACKER_CORS_ORIGIN: comma-separated exact origins (https://host) or patterns like *.example.com.
// Unset means same-origin only.
const corsParts = (process.env.RIGTRACKER_CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsMatchers: Array<string | RegExp> = corsParts.map((p) => {
  if (!p.includes('*')) return p;
  const withoutProto = p.replace(/^https?:\/\//, '');
  return new RegExp(
    '^https?://' + withoutProto.replace(/\./g, '\\.').replace(/\*/g, '[^.]+') + '(?::[0-9]+)?$',
  );
});

function isCorsAllowed(origin: string): boolean {
  return corsMatchers.some((m) => (typeof m === 'string' ? m === origin : m.test(origin)));
}
