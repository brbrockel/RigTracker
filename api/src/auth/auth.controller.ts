import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { Public } from './public.decorator'
import { clientIp } from '../common/client-ip'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('google')
  startGoogleAuth(@Res() res: Response) {
    const { url, state } = this.authService.createGoogleAuthRequest()
    const secureCookie = process.env.NODE_ENV === 'production'
    res.cookie(this.authService.getOAuthStateCookieName(), state, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: this.authService.getOAuthStateDurationMs(),
      path: '/',
    })
    return res.redirect(url)
  }

  @Public()
  @Get('google/callback')
  async handleGoogleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const secureCookie = process.env.NODE_ENV === 'production'
    const expectedState = this.authService.extractCookie(req.headers.cookie, this.authService.getOAuthStateCookieName())

    const ip = clientIp(req)
    const userAgent = req.headers['user-agent'] || undefined

    try {
      const result = await this.authService.exchangeGoogleCodeForSession({
        code,
        state,
        expectedState,
        ip,
        userAgent,
      })

      res.clearCookie(this.authService.getOAuthStateCookieName(), { path: '/' })
      res.cookie(this.authService.getSessionCookieName(), result.sessionId, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
        maxAge: this.authService.getSessionDurationMs(),
        path: '/',
      })

      const redirectTarget = process.env.AUTH_SUCCESS_REDIRECT?.trim() || '/'
      return res.redirect(redirectTarget)
    } catch (err) {
      res.clearCookie(this.authService.getOAuthStateCookieName(), { path: '/' })
      const redirectTarget = process.env.AUTH_FAILURE_REDIRECT?.trim() || '/?auth=failed'
      return res.redirect(redirectTarget)
    }
  }

  @Public()
  @Get('me')
  async getMe(@Req() req: Request) {
    const sessionId = this.authService.extractCookie(req.headers.cookie, this.authService.getSessionCookieName())
    const auth = await this.authService.getAuthenticatedUser(sessionId)
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
    const sessionId = this.authService.extractCookie(req.headers.cookie, this.authService.getSessionCookieName())
    await this.authService.logout(sessionId)
    res.clearCookie(this.authService.getSessionCookieName(), { path: '/' })
    return { ok: true }
  }

  // ── Admin-only user management ────────────────────────────────────────────

  private async requireAdmin(req: Request) {
    const sessionId = this.authService.extractCookie(req.headers.cookie, this.authService.getSessionCookieName())
    const auth = await this.authService.getAuthenticatedUser(sessionId)
    if (!auth) throw new UnauthorizedException('Not authenticated')
    if (!auth.user.roles.includes('admin')) throw new ForbiddenException('Admin only')
    return auth.user
  }

  @Get('users')
  async listUsers(@Req() req: Request) {
    await this.requireAdmin(req)
    return this.authService.listUsers()
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { role: string },
  ) {
    const caller = await this.requireAdmin(req)
    const role = body?.role
    if (role !== 'user' && role !== 'admin') {
      throw new ForbiddenException('Role must be "user" or "admin"')
    }
    // Prevent an admin from demoting themselves
    if (caller.id === id && role !== 'admin') {
      throw new ForbiddenException('You cannot remove your own admin role')
    }
    return this.authService.setUserRole(id, role)
  }

  /** Adds someone who may sign in with Google. Without an env allowlist, this is the only way in. */
  @Post('users')
  async addUser(@Req() req: Request, @Body() body: { email?: unknown; role?: unknown }) {
    await this.requireAdmin(req)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException('A valid email address is required')
    }
    const role = body?.role === 'admin' ? 'admin' : 'user'
    return this.authService.addUser(email, role)
  }
}
