import { and, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, media } from '../src/db/schema.js';
import {
  MISSING_ID,
  anon,
  as,
  createTestApp,
  resetDb,
  signInAs,
  type SignedIn,
  type TestApp,
} from './helpers.js';

let t: TestApp;
let admin: SignedIn;
let user: SignedIn;
let viewer: SignedIn;
let photo: Buffer;
beforeAll(async () => {
  t = await createTestApp();
  photo = await photoWithExif();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  admin = await signInAs(t, 'admin');
  user = await signInAs(t, 'user');
  viewer = await signInAs(t, 'viewer');
});

const uploads = () => path.resolve(process.env.UPLOADS_DIR!);
type OwnerType = 'rig' | 'gear' | 'event';
const RESOURCE = { rig: 'rigs', gear: 'gear', event: 'events' } as const;

/** A small photo carrying EXIF data (as a phone photo with GPS would). */
async function photoWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-owner', Artist: 'Someone' } })
    .toBuffer();
}

/** The start of an MP4 file (an ftyp box), enough for the content check. */
const mp4 = () =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypisom', 'latin1'),
    Buffer.alloc(200, 0),
  ]);

interface UploadOpts {
  file?: Buffer;
  filename?: string;
  contentType?: string;
  caption?: string;
  fields?: Record<string, string>;
}

/** POST /api/media as a multipart form. */
function upload(who: SignedIn, ownerType: string, ownerId: string, opts: UploadOpts = {}) {
  const req = who.agent.post('/api/media').set('x-csrf-token', who.csrf);
  const fields = { ownerType, ownerId, ...(opts.caption ? { caption: opts.caption } : {}) };
  for (const [k, v] of Object.entries({ ...fields, ...opts.fields })) req.field(k, v);
  return req.attach('file', opts.file ?? photo, {
    filename: opts.filename ?? 'IMG_0001.JPG',
    contentType: opts.contentType ?? 'image/jpeg',
  });
}

/** The stored file a returned /uploads URL points at. */
function fileFor(url: string): string {
  return path.join(uploads(), decodeURIComponent(url.slice('/uploads/'.length)));
}

function plant(rel: string): string {
  const file = path.join(uploads(), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  return file;
}

const noIncoming = () => {
  const incoming = path.join(uploads(), '.incoming');
  expect(fs.existsSync(incoming) ? fs.readdirSync(incoming) : []).toEqual([]);
};

async function createOwner(type: OwnerType, name = 'Owner'): Promise<string> {
  const res = await as(user).post(`/api/${RESOURCE[type]}`, { name }).expect(201);
  expect(res.body).toMatchObject({ media: [], coverUrl: null });
  return res.body.id;
}

const record = async (type: OwnerType, id: string) =>
  (await as(viewer).get(`/api/${RESOURCE[type]}/${id}`).expect(200)).body;
const list = async (type: OwnerType, id: string) =>
  (await as(viewer).get(`/api/media?ownerType=${type}&ownerId=${id}`).expect(200)).body;

describe('uploading (POST /api/media)', () => {
  it('re-encodes a photo to .jpg without EXIF, under uploads/<type>/<id>/, served only to signed-in people', async () => {
    const rigId = await createOwner('rig');
    const input = await photoWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const res = await upload(user, 'rig', rigId, { file: input, caption: ' Packed ' }).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      url: expect.stringMatching(new RegExp(`^/uploads/rig/${rigId}/[0-9a-f-]{36}\\.jpg$`)),
      kind: 'photo',
      caption: 'Packed',
      position: 0,
    });
    const stored = fileFor(res.body.url);
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(fs.readFileSync(stored).includes('secret-owner')).toBe(false);

    const [row] = await t.db.select().from(media).where(eq(media.id, res.body.id));
    expect(row).toMatchObject({ ownerType: 'rig', ownerId: rigId, uploadedBy: user.id });

    const served = await as(viewer).get(res.body.url).buffer(true).expect(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['content-security-policy']).toMatch(/sandbox/);
    expect(served.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body, fs.readFileSync(stored))).toBe(0);
    await anon(t).get(res.body.url).expect(401);
    noIncoming();
  });

  it('a PNG is stored as .jpg; an MP4 video is kept as .mp4', async () => {
    const gearId = await createOwner('gear');
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#0f0' } })
      .png()
      .toBuffer();
    const photo = await upload(user, 'gear', gearId, {
      file: png,
      filename: 'a.png',
      contentType: 'image/png',
    }).expect(201);
    expect(photo.body.url).toMatch(/\.jpg$/);
    const video = await upload(user, 'gear', gearId, {
      file: mp4(),
      filename: 'clip.mov',
      contentType: 'video/quicktime',
    }).expect(201);
    expect(video.body).toMatchObject({ kind: 'video', position: 1 });
    expect(video.body.url).toMatch(new RegExp(`^/uploads/gear/${gearId}/[0-9a-f-]{36}\\.mp4$`));
    expect(fs.existsSync(fileFor(video.body.url))).toBe(true);
  });

  it('refuses files that are not images or videos, and images that cannot be read', async () => {
    const eventId = await createOwner('event');
    const html = Buffer.from('<!doctype html><html><script>alert(document.cookie)</script></html>');
    const res = await upload(user, 'event', eventId, {
      file: html,
      filename: 'evil.png',
      contentType: 'image/png',
    }).expect(400);
    expect(res.body.message).toMatch(/JPEG|image/i);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    await upload(user, 'event', eventId, {
      file: svg,
      filename: 'evil.svg',
      contentType: 'image/svg+xml',
    }).expect(400);
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
    await upload(user, 'event', eventId, { file: fake, filename: 'broken.jpg' }).expect(400);

    expect(await list('event', eventId)).toEqual([]);
    const folder = path.join(uploads(), 'event', eventId);
    expect(fs.existsSync(folder) ? fs.readdirSync(folder) : []).toEqual([]);
    noIncoming();
  });

  it('checks the form: a file, a known owner type, an id, a short caption, nothing else', async () => {
    const rigId = await createOwner('rig');
    const noFile = await user.agent
      .post('/api/media')
      .set('x-csrf-token', user.csrf)
      .field('ownerType', 'rig')
      .field('ownerId', rigId);
    expect(noFile.status).toBe(400);
    await upload(user, 'person', rigId).expect(400);
    await upload(user, 'rig', 'not-an-id').expect(400);
    await upload(user, 'rig', rigId, { caption: 'x'.repeat(201) }).expect(400);
    await upload(user, 'rig', rigId, { fields: { folder: '../../etc' } }).expect(400);
    expect(await list('rig', rigId)).toEqual([]);
    noIncoming();
  });

  it.each(['rig', 'gear', 'event'] as const)(
    'a %s that does not exist is 404, and nothing is kept',
    async (type) => {
      const res = await upload(user, type, MISSING_ID).expect(404);
      expect(res.body.message).toMatch(/not found/i);
      expect(fs.existsSync(path.join(uploads(), type, MISSING_ID))).toBe(false);
      expect(await t.db.select().from(media)).toEqual([]);
      noIncoming();
      await as(viewer).get(`/api/media?ownerType=${type}&ownerId=${MISSING_ID}`).expect(404);
    },
  );

  it('viewers can look but not add, change or delete', async () => {
    const rigId = await createOwner('rig');
    await upload(viewer, 'rig', rigId).expect(403);
    const item = (await upload(user, 'rig', rigId).expect(201)).body;
    await as(viewer).patch(`/api/media/${item.id}`, { caption: 'x' }).expect(403);
    await as(viewer).delete(`/api/media/${item.id}`).expect(403);
    expect(await list('rig', rigId)).toEqual([item]);
    noIncoming();
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
    fs.rmSync(path.join(uploads(), '.incoming', 'hidden.jpg'));
  });

  it('the old upload route is gone', async () => {
    await as(user).post('/api/uploads/image').expect(404);
  });
});

describe('order, cover, captions and deleting', () => {
  it('adds at the end; records list their media in order with the first as coverUrl', async () => {
    const rigId = await createOwner('rig');
    const a = (await upload(user, 'rig', rigId).expect(201)).body;
    const b = (await upload(user, 'rig', rigId).expect(201)).body;
    const c = (await upload(admin, 'rig', rigId, { file: mp4(), filename: 'c.mp4' }).expect(201))
      .body;
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);
    expect(await list('rig', rigId)).toEqual([a, b, c]);

    const rig = await record('rig', rigId);
    expect(rig.media).toEqual([a, b, c]);
    expect(rig.coverUrl).toBe(a.url);
    expect(rig).not.toHaveProperty('imageUrl');
    const all = (await as(viewer).get('/api/rigs').expect(200)).body;
    expect(all[0]).toMatchObject({ media: [a, b, c], coverUrl: a.url });
  });

  it('makeCover moves an item to the front and shifts the others; position moves it', async () => {
    const eventId = await createOwner('event');
    const [a, b, c] = [
      (await upload(user, 'event', eventId).expect(201)).body,
      (await upload(user, 'event', eventId).expect(201)).body,
      (await upload(user, 'event', eventId).expect(201)).body,
    ];
    const cover = (await as(user).patch(`/api/media/${c.id}`, { makeCover: true }).expect(200))
      .body;
    expect(cover).toMatchObject({ id: c.id, position: 0 });
    const ids = async () => (await list('event', eventId)).map((m: { id: string }) => m.id);
    expect(await ids()).toEqual([c.id, a.id, b.id]);
    expect((await record('event', eventId)).coverUrl).toBe(c.url);
    expect((await list('event', eventId)).map((m: { position: number }) => m.position)).toEqual([
      0, 1, 2,
    ]);

    await as(user).patch(`/api/media/${c.id}`, { position: 99 }).expect(200);
    expect(await ids()).toEqual([a.id, b.id, c.id]);
    await as(user).patch(`/api/media/${c.id}`, { position: 1 }).expect(200);
    expect(await ids()).toEqual([a.id, c.id, b.id]);

    const captioned = (
      await as(user).patch(`/api/media/${b.id}`, { caption: 'Landing' }).expect(200)
    ).body;
    expect(captioned).toMatchObject({ caption: 'Landing', position: 2 });
    const cleared = (await as(user).patch(`/api/media/${b.id}`, { caption: '' }).expect(200)).body;
    expect(cleared.caption).toBeNull();

    for (const bad of [
      { caption: 'x'.repeat(201) },
      { makeCover: false },
      { position: -1 },
      { position: 1.5 },
      { url: '/uploads/x.jpg' },
      { ownerId: MISSING_ID },
    ])
      await as(user).patch(`/api/media/${a.id}`, bad).expect(400);
    await as(user).patch(`/api/media/${MISSING_ID}`, { caption: 'x' }).expect(404);
    await as(user).patch('/api/media/not-an-id', { caption: 'x' }).expect(400);
  });

  it('deleting removes the row and its file; the next one becomes the cover', async () => {
    const gearId = await createOwner('gear');
    const a = (await upload(user, 'gear', gearId).expect(201)).body;
    const b = (await upload(user, 'gear', gearId).expect(201)).body;
    expect(fs.existsSync(fileFor(a.url))).toBe(true);
    expect((await as(user).delete(`/api/media/${a.id}`).expect(200)).body).toEqual({
      deleted: true,
    });
    expect(fs.existsSync(fileFor(a.url))).toBe(false);
    expect(await list('gear', gearId)).toEqual([{ ...b, position: 0 }]);
    expect((await record('gear', gearId)).coverUrl).toBe(b.url);
    await as(user).delete(`/api/media/${a.id}`).expect(404);

    await as(user).delete(`/api/media/${b.id}`).expect(200);
    expect(await record('gear', gearId)).toMatchObject({ media: [], coverUrl: null });
    // The owner's emptied folder goes too, but not the uploads folder.
    expect(fs.existsSync(path.join(uploads(), 'gear', gearId))).toBe(false);
    expect(fs.existsSync(uploads())).toBe(true);
  });

  it('a file another record also uses is kept until its last row goes', async () => {
    const rigA = await createOwner('rig', 'A');
    const rigB = await createOwner('rig', 'B');
    const a = (await upload(user, 'rig', rigA).expect(201)).body;
    const other = (await upload(user, 'rig', rigB).expect(201)).body;
    // 1.x shared one URL between records sometimes (the migration copies it to both).
    const [shared] = await t.db
      .insert(media)
      .values({ ownerType: 'rig', ownerId: rigB, url: a.url, kind: 'photo', position: 1 })
      .returning();
    await as(user).delete(`/api/media/${a.id}`).expect(200);
    expect(fs.existsSync(fileFor(a.url))).toBe(true);
    expect(fs.existsSync(fileFor(other.url))).toBe(true);
    await as(user).delete(`/api/media/${shared!.id}`).expect(200);
    expect(fs.existsSync(fileFor(a.url))).toBe(false);
    expect(fs.existsSync(fileFor(other.url))).toBe(true);
  });

  it('adding, removing and changing the cover are logged as updates of the owner', async () => {
    const rigId = (await as(user).post('/api/rigs', { name: 'Javelin' }).expect(201)).body.id;
    const a = (await upload(user, 'rig', rigId).expect(201)).body;
    const b = (await upload(user, 'rig', rigId).expect(201)).body;
    await as(user).patch(`/api/media/${b.id}`, { makeCover: true }).expect(200);
    // Already the cover: nothing changes, nothing is logged.
    await as(user).patch(`/api/media/${b.id}`, { makeCover: true }).expect(200);
    await as(user).delete(`/api/media/${a.id}`).expect(200);
    const entries = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.resource, 'rigs'), eq(auditLog.action, 'UPDATE')))
      .orderBy(auditLog.createdAt);
    expect(
      entries.map((e) => ({ id: e.resourceId, name: e.resourceName, details: e.details })),
    ).toEqual([
      { id: rigId, name: 'Javelin', details: { media: 'added', url: a.url } },
      { id: rigId, name: 'Javelin', details: { media: 'added', url: b.url } },
      { id: rigId, name: 'Javelin', details: { media: 'cover', url: b.url } },
      { id: rigId, name: 'Javelin', details: { media: 'removed', url: a.url } },
    ]);
    expect(entries.every((e) => e.userId === user.id)).toBe(true);
  });
});

describe('deleting a record deletes its media', () => {
  it.each(['rig', 'gear', 'event'] as const)(
    'deleting a %s deletes its rows and files, not other records’',
    async (type) => {
      const id = await createOwner(type, 'Going');
      const keepId = await createOwner(type, 'Staying');
      const a = (await upload(user, type, id).expect(201)).body;
      const b = (await upload(user, type, id, { file: mp4(), filename: 'b.mp4' }).expect(201)).body;
      const keep = (await upload(user, type, keepId).expect(201)).body;
      // purgeMedia (1.x) is accepted and ignored: the media goes either way.
      const query = type === 'event' ? '?purgeMedia=false' : '';
      await as(admin).delete(`/api/${RESOURCE[type]}/${id}${query}`).expect(200);
      expect(fs.existsSync(fileFor(a.url))).toBe(false);
      expect(fs.existsSync(fileFor(b.url))).toBe(false);
      expect(fs.existsSync(path.join(uploads(), type, id))).toBe(false);
      expect(fs.existsSync(fileFor(keep.url))).toBe(true);
      const rows = await t.db.select().from(media);
      expect(rows.map((r) => r.id)).toEqual([keep.id]);
    },
  );

  it('only files inside the uploads folder are ever deleted', async () => {
    const eventId = await createOwner('event');
    const inside = plant('events/old/a.jpg');
    const outsideDir = `${uploads()}-outside`;
    fs.mkdirSync(outsideDir, { recursive: true });
    const outside = path.join(outsideDir, 'secret.jpg');
    fs.writeFileSync(outside, 'secret');
    await t.db.insert(media).values(
      [
        '/uploads/events/old/a.jpg',
        `/uploads/../${path.basename(outsideDir)}/secret.jpg`,
        'https://example.com/x.jpg',
        '/uploads/events/old/missing.jpg',
      ].map((url, position) => ({
        ownerType: 'event' as const,
        ownerId: eventId,
        url,
        kind: 'photo' as const,
        position,
      })),
    );
    await as(admin).delete(`/api/events/${eventId}`).expect(200);
    expect(fs.existsSync(inside)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
    expect(await t.db.select().from(media)).toEqual([]);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('users cannot delete records (their media stays)', async () => {
    const rigId = await createOwner('rig');
    const a = (await upload(user, 'rig', rigId).expect(201)).body;
    await as(user).delete(`/api/rigs/${rigId}`).expect(403);
    expect(fs.existsSync(fileFor(a.url))).toBe(true);
  });
});

describe('rig components', () => {
  it('each component has its gear’s coverUrl', async () => {
    const rigId = await createOwner('rig');
    const main = (
      await as(user).post('/api/gear', { name: 'Storm', assignedRigId: rigId, slot: 'main' })
    ).body;
    let rig = await record('rig', rigId);
    expect(rig.components.main).toMatchObject({ id: main.id, coverUrl: null });
    expect(rig.components.main).not.toHaveProperty('imageUrl');
    const photo = (await upload(user, 'gear', main.id).expect(201)).body;
    rig = await record('rig', rigId);
    expect(rig.components.main.coverUrl).toBe(photo.url);
    // The rig's own media are separate.
    expect(rig.media).toEqual([]);
  });
});
