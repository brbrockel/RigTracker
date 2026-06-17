import { Controller, Get, Post, Query, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

  @Get('google/callback')
  async handleGoogleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const secureCookie = process.env.NODE_ENV === 'production'
    const expectedState = this.authService.extractCookie(req.headers.cookie, this.authService.getOAuthStateCookieName())

    const ip = this.extractIp(req)
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

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = this.authService.extractCookie(req.headers.cookie, this.authService.getSessionCookieName())
    await this.authService.logout(sessionId)
    res.clearCookie(this.authService.getSessionCookieName(), { path: '/' })
    return { ok: true }
  }

  private extractIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim()
    }
    return req.socket?.remoteAddress || undefined
  }
}
