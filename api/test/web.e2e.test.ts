import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anon, createTestApp, type TestApp } from './helpers.js';

// The container serves the built web app from WEB_DIST on the same origin as the API.
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'rigtracker-web-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>RigTracker</title>');
fs.writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{"name":"RigTracker"}');

let t: TestApp;
beforeAll(async () => {
  process.env.WEB_DIST = dist;
  process.env.APP_VERSION = '2.0.0-test+abc1234';
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
  delete process.env.WEB_DIST;
  delete process.env.APP_VERSION;
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('health', () => {
  it('reports ok and the running version without signing in', async () => {
    const res = await anon(t).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: '2.0.0-test+abc1234' });
  });
});

describe('web app', () => {
  it('serves index.html at / and for client-side routes, always revalidated', async () => {
    for (const p of ['/', '/rigs', '/people/00000000-0000-4000-8000-000000000000', '/sign-in']) {
      const res = await anon(t).get(p);
      expect(res.status, p).toBe(200);
      expect(res.text).toContain('<title>RigTracker</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches hashed assets for a year, and serves the manifest with its own type', async () => {
    const js = await anon(t).get('/assets/index-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const manifest = await anon(t).get('/manifest.webmanifest');
    expect(manifest.headers['content-type']).toMatch(/application\/manifest\+json/);
    expect(manifest.headers['cache-control']).toBe('no-cache');
  });

  it('never answers /api or /uploads with the web app', async () => {
    const api = await anon(t).get('/api/no-such-route');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toMatch(/json/);
    const upload = await anon(t).get('/uploads/gear/x.jpg');
    expect(upload.status).toBe(401);
    expect(upload.text).not.toContain('<title>');
  });

  it('sends the security headers nginx used to add', async () => {
    const res = await anon(t).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['permissions-policy']).toBe('geolocation=(), microphone=()');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
