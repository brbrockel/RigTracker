import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService } from './auth.service'
import { IS_PUBLIC_KEY } from './public.decorator'
import { timingSafeEqual } from 'crypto'

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const req = context.switchToHttp().getRequest<any>()
    const cookieHeader = req.headers?.cookie as string | undefined
    const sessionId = this.authService.extractCookie(cookieHeader, this.authService.getSessionCookieName())
    const auth = await this.authService.getAuthenticatedUser(sessionId)
    if (!auth) {
      throw new UnauthorizedException('Authentication required')
    }

    // Every change needs the session's CSRF token (from /api/auth/me) in the x-csrf-token header.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const sent = Buffer.from(String(req.headers?.['x-csrf-token'] || ''))
      const expected = Buffer.from(auth.csrfToken)
      if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) {
        throw new ForbiddenException('Missing or invalid CSRF token. Reload the page and try again.')
      }
    }

    req.authUser = auth.user
    req.authSessionExpiresAt = auth.expiresAt
    return true
  }
}
