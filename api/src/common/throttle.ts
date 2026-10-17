import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { clientIp } from './client-ip'

/** Requests per minute per visitor IP for most routes. */
export const DEFAULT_LIMIT = { ttl: 60_000, limit: 300 }
/** Sign-in link checks and uses: tokens are unguessable, but there's no reason to allow many tries. */
export const SIGN_IN_LIMIT = { default: { ttl: 60_000, limit: 10 } }
/** Uploads (up to 200 MB each). */
export const UPLOAD_LIMIT = { default: { ttl: 60_000, limit: 30 } }

/** Rate-limits by the real visitor IP (CF-Connecting-IP behind Cloudflare). */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(clientIp(req) ?? 'unknown')
  }
}
