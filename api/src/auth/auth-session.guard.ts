import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { AuthService } from './auth.service.js';
import type { AuthedRequest } from './auth-user.js';
import { GUEST_OK_KEY, IS_PUBLIC_KEY } from './public.decorator.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Runs on every route: a session is required unless the route is @Public(); a guest session
 * only gets @GuestOk() routes, and only to read; every change needs the session's CSRF token.
 */
@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  private flag(key: string, context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) ??
      false
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.flag(IS_PUBLIC_KEY, context)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const sessionId = this.authService.extractCookie(
      req.headers?.cookie,
      this.authService.getSessionCookieName(),
    );
    const auth = await this.authService.getAuthenticatedUser(sessionId);
    if (!auth) {
      throw new UnauthorizedException('Authentication required');
    }

    if (auth.user.isGuest && (!this.flag(GUEST_OK_KEY, context) || !SAFE_METHODS.has(req.method)))
      throw new ForbiddenException('Sign in to do that. Guests can only look.');

    // Every change needs the session's CSRF token (from /api/auth/me) in the x-csrf-token header.
    if (!SAFE_METHODS.has(req.method)) {
      const sent = Buffer.from(String(req.headers?.['x-csrf-token'] || ''));
      const expected = Buffer.from(auth.csrfToken);
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
        throw new ForbiddenException(
          'Missing or invalid CSRF token. Reload the page and try again.',
        );
      }
    }

    req.authUser = auth.user;
    req.authSessionExpiresAt = auth.expiresAt;
    req.authSessionId = auth.sessionId;
    return true;
  }
}
