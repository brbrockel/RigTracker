import * as fs from 'fs';
import * as path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MISSING_ID,
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
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => t.close());
beforeEach(async () => {
  await resetDb(t);
  admin = await signInAs(t, 'admin');
  user = await signInAs(t, 'user');
});

const uploads = () => process.env.UPLOADS_DIR!;
function plant(rel: string): string {
  const file = path.join(uploads(), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  return file;
}

describe('events', () => {
  it('create, read, update and delete', async () => {
    const ev = (
      await as(user)
        .post('/api/events', { name: 'Boogie', eventDate: '2025-07-04', description: 'Fun' })
        .expect(201)
    ).body;
    expect(ev).toMatchObject({ name: 'Boogie', description: 'Fun', photoUrls: [] });
    expect(ev.eventDate).toBe('2025-07-04');
    expect((await as(user).get(`/api/events/${ev.id}`).expect(200)).body.name).toBe('Boogie');
    const updated = (
      await as(user).put(`/api/events/${ev.id}`, { description: 'More fun' }).expect(200)
    ).body;
    expect(updated).toMatchObject({ name: 'Boogie', description: 'More fun' });
    expect((await as(admin).delete(`/api/events/${ev.id}`).expect(200)).body).toEqual({
      deleted: true,
    });
    await as(user).get(`/api/events/${ev.id}`).expect(404);
    await as(user).put(`/api/events/${ev.id}`, { name: 'x' }).expect(404);
    await as(admin).delete(`/api/events/${MISSING_ID}`).expect(404);
  });

  it('lists events by date', async () => {
    await as(user).post('/api/events', { name: 'Later', eventDate: '2025-09-01' }).expect(201);
    await as(user).post('/api/events', { name: 'Earlier', eventDate: '2025-01-01' }).expect(201);
    const names = (await as(user).get('/api/events').expect(200)).body.map(
      (e: { name: string }) => e.name,
    );
    expect(names).toEqual(['Earlier', 'Later']);
  });

  it('the main photo is always one of the event’s photos', async () => {
    const withList = (
      await as(user)
        .post('/api/events', {
          name: 'A',
          photoUrls: ['/uploads/events/1.jpg'],
          eventPhotoUrl: '/uploads/events/main.jpg',
        })
        .expect(201)
    ).body;
    expect(withList.photoUrls).toEqual(['/uploads/events/1.jpg', '/uploads/events/main.jpg']);

    const alone = (
      await as(user)
        .post('/api/events', { name: 'B', eventPhotoUrl: '/uploads/events/b.jpg' })
        .expect(201)
    ).body;
    expect(alone.photoUrls).toEqual(['/uploads/events/b.jpg']);

    const already = (
      await as(user)
        .post('/api/events', {
          name: 'C',
          photoUrls: ['/uploads/c.jpg'],
          eventPhotoUrl: '/uploads/c.jpg',
        })
        .expect(201)
    ).body;
    expect(already.photoUrls).toEqual(['/uploads/c.jpg']);

    // Changing just the main photo adds it to the existing photos.
    const changed = (
      await as(user)
        .put(`/api/events/${withList.id}`, { eventPhotoUrl: 'https://example.com/new.jpg' })
        .expect(200)
    ).body;
    expect(changed.eventPhotoUrl).toBe('https://example.com/new.jpg');
    expect(changed.photoUrls).toEqual([
      '/uploads/events/1.jpg',
      '/uploads/events/main.jpg',
      'https://example.com/new.jpg',
    ]);
  });

  it('deleting without purgeMedia keeps the files', async () => {
    const file = plant('events/keep/a.jpg');
    const ev = (
      await as(user)
        .post('/api/events', { name: 'Keep', photoUrls: ['/uploads/events/keep/a.jpg'] })
        .expect(201)
    ).body;
    await as(admin).delete(`/api/events/${ev.id}`).expect(200);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('deleting with purgeMedia=true deletes only files inside the uploads folder', async () => {
    const a = plant('events/purge/a.jpg');
    const main = plant('events/purge/main.jpg');
    const other = plant('events/other/keep.jpg');
    // A file next to (not inside) the uploads folder, reachable only by ../ tricks.
    const outsideDir = `${uploads()}-outside`;
    fs.mkdirSync(outsideDir, { recursive: true });
    const outside = path.join(outsideDir, 'secret.jpg');
    fs.writeFileSync(outside, 'secret');
    const outsideUrl = `/uploads/../${path.basename(outsideDir)}/secret.jpg`;

    const ev = (
      await as(user)
        .post('/api/events', {
          name: 'Purge',
          eventPhotoUrl: '/uploads/events/purge/main.jpg',
          photoUrls: [
            '/uploads/events/purge/a.jpg',
            outsideUrl,
            'https://example.com/x.jpg',
            '/uploads/events/purge/missing.jpg',
          ],
        })
        .expect(201)
    ).body;
    await as(admin).delete(`/api/events/${ev.id}?purgeMedia=true`).expect(200);
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(main)).toBe(false);
    // Its emptied folder is removed too, but not the uploads folder or other folders.
    expect(fs.existsSync(path.dirname(a))).toBe(false);
    expect(fs.existsSync(other)).toBe(true);
    expect(fs.existsSync(uploads())).toBe(true);
    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
