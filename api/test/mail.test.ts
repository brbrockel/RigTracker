import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { guardedMailer, isAllowed, maskEmail, type Mail } from '../src/mail/mailer.js';

const mail: Mail = { to: 'jerry@example.com', subject: 'Your password link', text: 'x' };
const quiet = { warn: vi.fn() } as never;

describe('the mail guard', () => {
  it('is off unless configured otherwise', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).MAIL_MODE).toBe('off');
  });

  it('off sends nothing', async () => {
    const send = vi.fn();
    await guardedMailer(
      { send },
      { MAIL_MODE: 'off', MAIL_ALLOWLIST: 'jerry@example.com' },
      quiet,
    ).send(mail);
    expect(send).not.toHaveBeenCalled();
  });

  it('allowlist sends only to listed addresses and *@domain patterns', async () => {
    const send = vi.fn();
    const m = guardedMailer(
      { send },
      { MAIL_MODE: 'allowlist', MAIL_ALLOWLIST: '*@club.example, Jerry@Example.com' },
      quiet,
    );
    await m.send(mail);
    await m.send({ ...mail, to: 'anyone@club.example' });
    await m.send({ ...mail, to: 'stranger@example.com' });
    expect(send.mock.calls.map(([m]) => (m as Mail).to)).toEqual([
      'jerry@example.com',
      'anyone@club.example',
    ]);
    expect(isAllowed('x@notclub.example', '*@club.example')).toBe(false);
  });

  it('all sends to anyone', async () => {
    const send = vi.fn();
    await guardedMailer({ send }, { MAIL_MODE: 'all', MAIL_ALLOWLIST: '' }, quiet).send(mail);
    expect(send).toHaveBeenCalledOnce();
  });

  it('masks addresses in logs', () => {
    expect(maskEmail('jerry@example.com')).toBe('j***@example.com');
  });
});

describe('APP_SECRET', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://x@y/z',
    APP_URL: 'https://rigtracker.example',
  };
  it('is required in production', () => {
    expect(() => loadConfig(base)).toThrow(/APP_SECRET: required in production/);
  });
  it('must be 32+ bytes as hex or base64', () => {
    expect(() => loadConfig({ ...base, APP_SECRET: 'too-short' })).toThrow(/APP_SECRET/);
    expect(() => loadConfig({ ...base, APP_SECRET: 'ab'.repeat(31) })).toThrow(/APP_SECRET/);
    expect(loadConfig({ ...base, APP_SECRET: 'ab'.repeat(32) }).APP_SECRET).toBeTruthy();
    expect(
      loadConfig({ ...base, APP_SECRET: Buffer.alloc(32, 7).toString('base64') }).APP_SECRET,
    ).toBeTruthy();
  });
});
