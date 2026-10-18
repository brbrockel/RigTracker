import type { Person } from '../db/schema.js';
import type { Role } from '../auth/auth-user.js';
import { omit } from '../common/omit.js';

/**
 * A person as the API returns them: sign-in role as `roles` (empty when none), and whether
 * they have a password and authenticator codes and are locked out; never the password hash,
 * the authenticator key, recovery codes or other private sign-in data.
 */
export function personToApi(p: Person) {
  const rest = omit(
    p,
    'role',
    'lastLoginIp',
    'lastUserAgent',
    'legacyId',
    'passwordHash',
    'failedAttempts',
    'lockedUntil',
    'lockoutCount',
    'totpSecretEnc',
    'totpEnabledAt',
    'totpLastStep',
    'recoveryCodeHashes',
  );
  return {
    ...rest,
    roles: p.role ? [p.role] : ([] as Role[]),
    hasPassword: !!p.passwordHash,
    totpEnabled: !!p.totpEnabledAt,
    lockedUntil: p.lockedUntil && p.lockedUntil > new Date() ? p.lockedUntil : null,
  };
}
export type PersonView = ReturnType<typeof personToApi>;

/** "First Last". */
export function shortName(p: { firstName?: string | null; lastName?: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

/** "First Middle Last", trimmed. */
export function fullName(p: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [p.firstName, p.middleName, p.lastName]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .join(' ')
    .trim();
}

/** How guests see a person: "First L." (or just the first name, or "L."); nothing else. */
export function guestName(p: { firstName?: string | null; lastName?: string | null }): string {
  const first = p.firstName?.trim() ?? '';
  const initial = p.lastName?.trim().charAt(0).toUpperCase() ?? '';
  return [first, initial ? `${initial}.` : ''].filter(Boolean).join(' ');
}
