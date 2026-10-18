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
}

/** A request that passed AuthSessionGuard. */
export interface AuthedRequest extends Request {
  authUser?: AuthUser;
  authSessionExpiresAt?: Date;
}
