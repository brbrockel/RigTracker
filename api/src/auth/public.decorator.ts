import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/** Marks a route as reachable without signing in. Every other route needs a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const GUEST_OK_KEY = 'guest_ok';

/**
 * Guests may GET this route. Everything else is closed to them (401 for a write, 403 for a
 * read), so a new route never shows guests anything by accident. Routes marked here must
 * leave out people's details for guests (see people/person-view.ts guestName).
 */
export const GuestOk = () => SetMetadata(GUEST_OK_KEY, true);
