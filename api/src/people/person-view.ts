import type { Person } from '../db/schema.js';
import type { Role } from '../auth/auth-user.js';
import { omit } from '../common/omit.js';

/** A person as the API returns them: sign-in role as `roles` (empty when none), no private sign-in data. */
export function personToApi(p: Person) {
  const rest = omit(p, 'role', 'lastLoginIp', 'lastUserAgent', 'legacyId');
  return { ...rest, roles: p.role ? [p.role] : ([] as Role[]) };
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
