import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService } from './auth.service'
import { REQUIRED_ROLES_KEY } from './roles.decorator'

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const req = context.switchToHttp().getRequest<any>()
    const cookieHeader = req.headers?.cookie as string | undefined
    const sessionId = this.authService.extractCookie(cookieHeader, this.authService.getSessionCookieName())
    const auth = await this.authService.getAuthenticatedUser(sessionId)
    if (!auth) {
      throw new UnauthorizedException('Authentication required')
    }

    req.authUser = auth.user
    req.authSessionExpiresAt = auth.expiresAt
    return true
  }
}
