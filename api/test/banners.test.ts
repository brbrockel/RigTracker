import { describe, expect, it } from 'vitest';
import { bannerState, passwordToDo, repackBanners, shortDay } from '../src/notices/banners.js';

const created = new Date('2027-05-05T12:00:00Z');
const at = (days: number) => new Date(created.getTime() + days * 86_400_000);
const notice = (over: Partial<Parameters<typeof bannerState>[0]> = {}) => ({
  audience: 'everyone' as const,
  pinned: false,
  bannerUntil: null,
  createdAt: created,
  updatedAt: null,
  ...over,
});

describe('notice banners', () => {
  it('a week for everyone, two days for one person, from the last edit', () => {
    expect(bannerState(notice(), false, at(6.9)).banner).toBe(true);
    expect(bannerState(notice(), false, at(7.1)).banner).toBe(false);
    expect(bannerState(notice({ audience: 'person' }), false, at(1.9)).banner).toBe(true);
    expect(bannerState(notice({ audience: 'person' }), false, at(2.1)).banner).toBe(false);
    expect(bannerState(notice({ updatedAt: at(5) }), false, at(10)).banner).toBe(true);
  });

  it('pinned until dismissed; a chosen end wins; dismissing always clears it', () => {
    expect(bannerState(notice({ pinned: true }), false, at(90))).toMatchObject({
      banner: true,
      urgent: true,
      bannerUntil: null,
    });
    expect(bannerState(notice({ pinned: true }), true, at(1)).banner).toBe(false);
    expect(bannerState(notice({ bannerUntil: at(1) }), false, at(1.5)).banner).toBe(false);
    expect(bannerState(notice({ bannerUntil: at(30) }), false, at(20)).banner).toBe(true);
  });
});

describe('repack banners', () => {
  const today = '2027-06-01';
  const rig = (id: string, repackDue: string | null, primaryUserId: string | null = 'me') => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    number: id,
    name: null,
    repackDue,
    primaryUserId,
  });

  it('due within 14 days or overdue, never the pre-1950 blanks', () => {
    const out = repackBanners(
      [
        rig('1', '2027-06-15'),
        rig('2', '2027-06-16'),
        rig('3', '2027-05-20'),
        rig('4', '1900-01-01'),
        rig('5', null),
        rig('6', '2027-06-02', 'someone'),
      ],
      { id: 'me', isAdmin: false },
      today,
    );
    expect(out.map((b) => b.title)).toEqual([
      'Rig #3 repack overdue since May 20',
      'Rig #1 repack due Jun 15',
    ]);
  });

  it('admins get a summary that changes key when the list does', () => {
    const rigs = [rig('1', '2027-05-01', null), rig('2', '2027-06-03', null)];
    const [a] = repackBanners(rigs, { id: 'me', isAdmin: true }, today);
    expect(a).toMatchObject({ title: '1 rig overdue, 1 due within 14 days', urgent: true });
    const [b] = repackBanners(rigs.slice(1), { id: 'me', isAdmin: true }, today);
    expect(b).toMatchObject({ title: '1 rig due within 14 days', urgent: false });
    expect(b!.key).not.toBe(a!.key);
    expect(repackBanners([], { id: 'me', isAdmin: true }, today)).toEqual([]);
  });

  it('shows the year only when it is not this year', () => {
    expect(shortDay('2027-06-08', today)).toBe('Jun 8');
    expect(shortDay('2026-12-30', today)).toBe('Dec 30, 2026');
  });
});

describe('the password to-do', () => {
  const p = (firstName: string, email: string | null = `${firstName}@example.com`) => ({
    firstName,
    lastName: null,
    email,
  });
  it('lists who needs a password, and who needs an email first', () => {
    expect(passwordToDo([])).toBeNull();
    expect(passwordToDo([p('Dana')])).toMatchObject({ title: 'Dana needs a password' });
    const todo = passwordToDo([p('Ann'), p('Bo', null), p('Cy', null)]);
    expect(todo?.title).toBe('Ann, Bo and Cy need a password');
    expect(todo?.body).toContain('Bo and Cy need an email address first.');
  });
});
