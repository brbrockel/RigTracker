import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/** Marks a route as reachable without signing in. Every other route needs a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
