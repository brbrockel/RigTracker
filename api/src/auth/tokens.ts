import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens (sessions, password links, code steps) are stored only as SHA-256 hashes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Password links (set or reset a password) last 72 hours and work once. */
export const SIGN_IN_LINK_TTL_MS = 1000 * 60 * 60 * 72;
/** The step between a right password and the authenticator code. */
export const CODE_STEP_TTL_MS = 1000 * 60 * 5;

/**
 * The token goes in the URL fragment, which browsers never send to servers or in Referer
 * headers. /sign-in#token= is kept from the 2.0 alphas so links already sent still open.
 */
export function signInLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/sign-in#token=${token}`;
}
