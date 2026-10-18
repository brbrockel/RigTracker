import { Global, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config, type Config } from '../config.js';

/**
 * Outbound email, behind TeeMate's mail guard. RigTracker sends no email yet: MAIL_MODE is
 * 'off' unless the owner approves otherwise, and no SMTP server is configured. A future
 * "Email the link" injects MAILER and calls send(); the guard decides whether it goes out.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const MAILER = Symbol('MAILER');

type Guard = Pick<Config, 'MAIL_MODE' | 'MAIL_ALLOWLIST'>;

/** True if `email` matches an allowlist entry: an exact address or `*@domain`. */
export function isAllowed(email: string, allowlist: string): boolean {
  const address = email.trim().toLowerCase();
  return allowlist
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) =>
      entry.startsWith('*@') ? address.endsWith(entry.slice(1)) : address === entry,
    );
}

/** Whether the guard lets an email to `to` through (see guardedMailer). */
export function mailAllowed(to: string, c: Guard): boolean {
  return c.MAIL_MODE === 'all' || (c.MAIL_MODE === 'allowlist' && isAllowed(to, c.MAIL_ALLOWLIST));
}

/** Masks an address for logs: jerry@example.com -> j***@example.com. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

/**
 * Wraps a mailer so nothing reaches members without the owner's consent: 'off' sends nothing,
 * 'allowlist' only sends to listed addresses, and only 'all' sends freely. Blocked emails are
 * logged (masked), never sent.
 */
export function guardedMailer(inner: Mailer, c: Guard, log = new Logger('Mail')): Mailer {
  return {
    async send(mail) {
      if (!mailAllowed(mail.to, c)) {
        log.warn(
          `Blocked email to ${maskEmail(mail.to)} ("${mail.subject}"): MAIL_MODE=${c.MAIL_MODE}`,
        );
        return;
      }
      await inner.send(mail);
    },
  };
}

/** Sends through the configured SMTP server; without one, refuses (nothing is configured yet). */
export function smtpMailer(c: Config): Mailer {
  let transport: Transporter | undefined;
  return {
    async send(mail) {
      if (!c.SMTP_HOST) throw new Error('Email is not set up on this server (no SMTP_HOST).');
      transport ??= nodemailer.createTransport({
        host: c.SMTP_HOST,
        port: c.SMTP_PORT,
        secure: c.SMTP_SECURE,
        // A wrong host or port fails in seconds instead of hanging the request.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        ...(c.SMTP_USER ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD ?? '' } } : {}),
      });
      await transport.sendMail({ from: c.MAIL_FROM, ...mail });
    },
  };
}

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: (): Mailer => {
        const c = config();
        return guardedMailer(smtpMailer(c), c);
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
