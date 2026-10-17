import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { Public } from './public.decorator'
import { RequireRoles } from './roles.decorator'
import { signInLinkUrl } from './tokens'
import { clientIp } from '../common/client-ip'
import { AuditService } from '../audit/audit.service'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  private sessionToken(req: Request) {
    return this.authService.extractCookie(req.headers.cookie, this.authService.getSessionCookieName())
  }

  private tokenFrom(body: { token?: unknown }): string {
    const token = typeof body?.token === 'string' ? body.token : ''
    if (!TOKEN_PATTERN.test(token)) throw new BadRequestException('That sign-in link is not valid')
    return token
  }

  /** The base URL for links: APP_URL in production, else the site the admin is using. */
  private appUrl(req: Request) {
    const configured = process.env.APP_URL?.trim()
    if (configured) return configured
    const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http'
    return `${proto}://${req.headers.host}`
  }

  /** Who a sign-in link is for. Doesn't use it up. */
  @Public()
  @Post('link/check')
  async checkLink(@Body() body: { token?: unknown }) {
    const info = await this.authService.peekSignInLink(this.tokenFrom(body))
    if (!info) throw new NotFoundException('This sign-in link has expired or was already used. Ask an admin for a new one.')
    return info
  }

  /** Uses up a sign-in link and signs in. */
  @Public()
  @Post('link/redeem')
  async redeemLink(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: { token?: unknown }) {
    const result = await this.authService.redeemSignInLink(this.tokenFrom(body), {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || undefined,
    })
    if (!result) throw new UnauthorizedException('This sign-in link has expired or was already used. Ask an admin for a new one.')

    res.cookie(this.authService.getSessionCookieName(), result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: this.authService.getSessionDurationMs(),
      path: '/',
    })
    await this.auditService.log({
      action: 'SIGN_IN',
      resource: 'user',
      resourceId: result.user.id,
      resourceName: result.user.email,
      actor: result.user,
      details: { method: 'link', ip: clientIp(req) },
    })
    return { authenticated: true, user: result.user, sessionExpiresAt: result.expiresAt }
  }

  @Public()
  @Get('me')
  async getMe(@Req() req: Request) {
    const auth = await this.authService.getAuthenticatedUser(this.sessionToken(req))
    if (!auth) return { authenticated: false }
    return {
      authenticated: true,
      user: auth.user,
      sessionExpiresAt: auth.expiresAt,
    }
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.sessionToken(req)
    const auth = await this.authService.getAuthenticatedUser(token)
    await this.authService.logout(token)
    res.clearCookie(this.authService.getSessionCookieName(), { path: '/' })
    if (auth) {
      await this.auditService.log({
        action: 'SIGN_OUT',
        resource: 'user',
        resourceId: auth.user.id,
        resourceName: auth.user.email,
        actor: auth.user,
      })
    }
    return { ok: true }
  }

  // ── Admin-only user management ────────────────────────────────────────────

  @Get('users')
  @RequireRoles('admin')
  listUsers() {
    return this.authService.listUsers()
  }

  /** Adds someone who can be sent a sign-in link. */
  @Post('users')
  @RequireRoles('admin')
  async addUser(@Req() req: any, @Body() body: { email?: unknown; role?: unknown; displayName?: unknown }) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException('A valid email address is required')
    }
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 100) : undefined
    const role = body?.role === 'admin' ? 'admin' : 'user'
    const user = await this.authService.addUser(email, role, displayName || undefined)
    await this.auditService.log({
      action: 'CREATE',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.email,
      actor: req.authUser,
      details: { role },
    })
    return user
  }

  /** A single-use sign-in link (72 hours) for the admin to text or email to the person. */
  @Post('users/:id/link')
  @RequireRoles('admin')
  async createLink(@Req() req: any, @Param('id') id: string) {
    const { token, expiresAt, user } = await this.authService.createSignInLink(id, req.authUser?.email)
    await this.auditService.log({
      action: 'SIGN_IN_LINK',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.email,
      actor: req.authUser,
    })
    return { link: signInLinkUrl(this.appUrl(req), token), expiresAt, email: user.email }
  }

  /** Signs the person out on every device. */
  @Post('users/:id/sign-out')
  @RequireRoles('admin')
  async signOutEverywhere(@Req() req: any, @Param('id') id: string) {
    await this.authService.revokeAllSessions(id)
    await this.auditService.log({
      action: 'SIGN_OUT',
      resource: 'user',
      resourceId: id,
      actor: req.authUser,
      details: { everywhere: true },
    })
    return { ok: true }
  }

  @Patch('users/:id/role')
  @RequireRoles('admin')
  async updateUserRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { role: string },
  ) {
    const role = body?.role
    if (role !== 'user' && role !== 'admin') {
      throw new BadRequestException('Role must be "user" or "admin"')
    }
    // Prevent an admin from demoting themselves
    if (req.authUser?.id === id && role !== 'admin') {
      throw new ForbiddenException('You cannot remove your own admin role')
    }
    const user = await this.authService.setUserRole(id, role)
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'user',
      resourceId: user.id,
      resourceName: user.email,
      actor: req.authUser,
      details: { role },
    })
    return user
  }
}
