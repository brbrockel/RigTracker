import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from './client-ip.js';

/** Requests per minute per visitor IP for most routes (RATE_LIMIT_PER_MINUTE, default 300). */
export const DEFAULT_LIMIT = {
  ttl: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 300,
};
/** Sign-in link checks and uses: tokens are unguessable, but there's no reason to allow many tries. */
export const SIGN_IN_LIMIT = { default: { ttl: 60_000, limit: 10 } };
/** Uploads (up to 200 MB each). */
export const UPLOAD_LIMIT = { default: { ttl: 60_000, limit: 30 } };

/** Rate-limits by the real visitor IP (CF-Connecting-IP behind Cloudflare). */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientIp(req as Parameters<typeof clientIp>[0]) ?? 'unknown');
  }
}
