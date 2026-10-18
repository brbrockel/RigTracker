import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  anon,
  as,
  createTestApp,
  resetDb,
  signInAs,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let user: SignedIn;
let viewer: SignedIn;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  user = await signInAs(t, 'user');
  viewer = await signInAs(t, 'viewer');
});

const uploads = () => path.resolve(process.env.UPLOADS_DIR!);

/** A small photo carrying EXIF data (as a phone photo with GPS would). */
async function photoWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'Someone' } })
    .toBuffer();
}

function upload(who: SignedIn, file: Buffer, filename: string, contentType: string, query = '') {
  return who.agent
    .post(`/api/uploads/image${query}`)
    .set('x-csrf-token', who.csrf)
    .attach('file', file, { filename, contentType });
}

/** The stored file a returned /uploads URL points at. */
function fileFor(url: string): string {
  return path.join(uploads(), decodeURIComponent(url.slice('/uploads/'.length)));
}

describe('uploads', () => {
  it('re-encodes a photo to .jpg without EXIF and serves it only to signed-in people', async () => {
    const input = await photoWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const res = await upload(
      user,
      input,
      'IMG_0001.JPG',
      'image/jpeg',
      '?folder=gear/altimeters',
    ).expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/gear\/altimeters\/[0-9a-f-]{36}\.jpg$/);
    const stored = fileFor(res.body.url);
    expect(fs.existsSync(stored)).toBe(true);
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(fs.readFileSync(stored).includes('secret-owner')).toBe(false);

    const served = await as(viewer).get(res.body.url).buffer(true).expect(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['content-security-policy']).toMatch(/sandbox/);
    expect(served.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body, fs.readFileSync(stored))).toBe(0);

    await anon(t).get(res.body.url).expect(401);
  });

  it('a PNG is stored as .jpg too', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#00ff00' } })
      .png()
      .toBuffer();
    const res = await upload(user, png, 'a.png', 'image/png', '?folder=rigs').expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/rigs\/[0-9a-f-]{36}\.jpg$/);
  });

  it('without a folder, files go in the uploads root', async () => {
    const res = await upload(user, await photoWithExif(), 'a.jpg', 'image/jpeg').expect(201);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.jpg$/);
  });

  it('an HTML file claiming to be a PNG is refused', async () => {
    const html = Buffer.from('<!doctype html><html><script>alert(document.cookie)</script></html>');
    const res = await upload(user, html, 'evil.png', 'image/png').expect(400);
    expect(res.body.message).toMatch(/JPEG|image/i);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await upload(user, svg, 'evil.svg', 'image/svg+xml').expect(400);
  });

  it('a file that looks like an image but cannot be decoded is refused', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
    await upload(user, fake, 'broken.jpg', 'image/jpeg').expect(400);
  });

  it('a request without a file is refused', async () => {
    await as(user).post('/api/uploads/image').expect(400);
  });

  it.each(['../../x', '..', 'gear/../../../etc', '/etc/passwd', 'unknown/place', 'gear/a/b/c'])(
    'the folder %j cannot escape the uploads folder',
    async (folder) => {
      const res = await upload(
        user,
        await photoWithExif(),
        'a.jpg',
        'image/jpeg',
        `?folder=${encodeURIComponent(folder)}`,
      ).expect(201);
      expect(res.body.url).toMatch(/^\/uploads\//);
      expect(res.body.url).not.toContain('..');
      const stored = path.resolve(fileFor(res.body.url));
      expect(stored.startsWith(uploads() + path.sep)).toBe(true);
      expect(fs.existsSync(stored)).toBe(true);
      expect(res.body.url.split('/').length).toBeLessThanOrEqual(5);
    },
  );

  it('does not leave temporary files behind', async () => {
    await upload(user, await photoWithExif(), 'a.jpg', 'image/jpeg').expect(201);
    await upload(user, Buffer.from('<html></html>'), 'a.png', 'image/png').expect(400);
    const incoming = path.join(uploads(), '.incoming');
    expect(fs.existsSync(incoming) ? fs.readdirSync(incoming) : []).toEqual([]);
  });

  it('only known media types are served from /uploads', async () => {
    fs.writeFileSync(path.join(uploads(), 'planted.html'), '<script>alert(1)</script>');
    fs.writeFileSync(path.join(uploads(), 'planted.svg'), '<svg/>');
    fs.writeFileSync(path.join(uploads(), 'planted'), 'no extension');
    fs.mkdirSync(path.join(uploads(), '.incoming'), { recursive: true });
    fs.writeFileSync(path.join(uploads(), '.incoming', 'hidden.jpg'), 'x');
    for (const url of [
      '/uploads/planted.html',
      '/uploads/planted.svg',
      '/uploads/planted',
      '/uploads/.incoming/hidden.jpg',
    ]) {
      await as(user).get(url).expect(404);
    }
    await as(user).get('/uploads/nope.jpg').expect(404);
  });

  it('viewers cannot upload', async () => {
    await upload(viewer, await photoWithExif(), 'a.jpg', 'image/jpeg').expect(403);
  });
});
