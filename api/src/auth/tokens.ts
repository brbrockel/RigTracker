import { createHash, randomBytes } from 'crypto'

/** 256-bit random token, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tokens (sessions, sign-in links) are stored only as SHA-256 hashes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const SIGN_IN_LINK_TTL_MS = 1000 * 60 * 60 * 72

/** The token goes in the URL fragment, which browsers never send to servers or in Referer headers. */
export function signInLinkUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/sign-in#token=${token}`
}
