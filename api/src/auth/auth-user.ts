import type { Request } from 'express';

export const ROLES = ['admin', 'user', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** The signed-in person, as the API returns them (GET /api/auth/me). */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  isActive: boolean;
  lastLoginAt: Date | null;
  loginCount: number;
  /** "Look around as a guest": no person, read-only rigs, gear and events. */
  isGuest?: boolean;
}

/**
 * The stand-in user of a guest session. No roles, so nothing that needs one is allowed, and
 * only @GuestOk() routes are open (see AuthSessionGuard).
 */
export const GUEST_USER: AuthUser = {
  id: 'guest',
  email: '',
  displayName: 'Guest',
  roles: [],
  isActive: true,
  lastLoginAt: null,
  loginCount: 0,
  isGuest: true,
};

/** A request that passed AuthSessionGuard. */
export interface AuthedRequest extends Request {
  authUser?: AuthUser;
  authSessionExpiresAt?: Date;
  /** The session's row id (changing your password keeps this one and ends the others). */
  authSessionId?: string;
}

/** Guests see people as "First L." only. */
export const isGuest = (req: { authUser?: AuthUser | undefined }) => !!req.authUser?.isGuest;
