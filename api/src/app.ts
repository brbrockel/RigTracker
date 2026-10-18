import type { INestApplication } from '@nestjs/common';
import * as path from 'node:path';
import * as fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import { AuthService } from './auth/auth.service.js';
import { SERVED_UPLOAD_EXTENSIONS } from './uploads/uploads.service.js';
import { PgErrorsFilter } from './common/pg-errors.filter.js';
import { uploadsDir } from './common/uploads-dir.js';

/** Settings shared by the real server and the tests. */
export function configureApp(app: INestApplication) {
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.disable('x-powered-by');
  // Express 5 parses query strings "simple" by default; the extended (qs) parser keeps
  // ?rigId[$ne]=x an object, which the zod query schemas then refuse with a 400 (as in 1.x)
  // instead of silently ignoring the parameter.
  server.set('query parser', 'extended');
  app.useGlobalFilters(new PgErrorsFilter(app.getHttpAdapter()));
  // Security headers for every response. The web app's CSP: everything from this site;
  // antd-era inline styles are gone, but Radix sets style attributes, hence 'unsafe-inline' for styles.
  server.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          mediaSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  server.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
    next();
  });

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

  app.setGlobalPrefix('api');
  const webDist = process.env.WEB_DIST;
  if (webDist) serveWebApp(server, webDist);
  app.enableShutdownHooks();
}

/**
 * Serves the built web app from the same origin as the API (as TeeMate does). Hashed assets
 * are cached for a year; index.html, the service worker and the manifest are always
 * revalidated so updates reach phones promptly. Other GETs outside /api and /uploads get
 * index.html so client-side routes work on reload.
 */
function serveWebApp(server: express.Express, dir: string) {
  const index = path.join(dir, 'index.html');
  server.use(
    express.static(dir, {
      index: false,
      setHeaders(res, file) {
        res.setHeader(
          'Cache-Control',
          file.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    }),
  );
  server.use((req, res, next) => {
    const ours =
      req.path.startsWith('/api/') || req.path === '/api' || req.path.startsWith('/uploads/');
    if ((req.method === 'GET' || req.method === 'HEAD') && !ours) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(index);
    } else next();
  });
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
