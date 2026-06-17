import { CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUIRED_ROLES_KEY } from './roles.decorator'

export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const req = context.switchToHttp().getRequest<any>()
    const roles = Array.isArray(req?.authUser?.roles) ? req.authUser.roles : []
    const allowed = requiredRoles.some((role) => roles.includes(role))
    if (!allowed) {
      throw new ForbiddenException('Insufficient role permissions')
    }
    return true
  }
}
