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

describe('events', () => {
  it('create, read, update and delete', async () => {
    const ev = (
      await as(user)
        .post('/api/events', { name: 'Boogie', eventDate: '2025-07-04', description: 'Fun' })
        .expect(201)
    ).body;
    expect(ev).toMatchObject({ name: 'Boogie', description: 'Fun', media: [], coverUrl: null });
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

  it('photos are media: the 1.x photo fields are refused and not returned', async () => {
    for (const body of [
      { name: 'A', eventPhotoUrl: '/uploads/events/main.jpg' },
      { name: 'A', photoUrls: ['/uploads/events/1.jpg'] },
    ])
      await as(user).post('/api/events', body).expect(400);
    const ev = (await as(user).post('/api/events', { name: 'A' }).expect(201)).body;
    await as(user).put(`/api/events/${ev.id}`, { photoUrls: [] }).expect(400);
    const read = (await as(user).get(`/api/events/${ev.id}`).expect(200)).body;
    expect(read).not.toHaveProperty('photoUrls');
    expect(read).not.toHaveProperty('eventPhotoUrl');
    expect(read).toMatchObject({ media: [], coverUrl: null });
    const updated = (await as(user).put(`/api/events/${ev.id}`, { name: 'B' }).expect(200)).body;
    expect(updated).toMatchObject({ name: 'B', media: [], coverUrl: null });
  });
});
