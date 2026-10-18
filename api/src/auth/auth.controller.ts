import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, ROLES, type NeedsCode, type Role, type SignedIn } from './auth.service.js';
import type { AuthedRequest, AuthUser } from './auth-user.js';
import { Public } from './public.decorator.js';
import { Throttle } from '@nestjs/throttler';
import { SIGN_IN_LIMIT } from '../common/throttle.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { RequireRoles } from './roles.decorator.js';
import { signInLinkUrl } from './tokens.js';
import { clientIp } from '../common/client-ip.js';
import { AuditService } from '../audit/audit.service.js';
import { shortName } from '../people/person-view.js';

const Token = z
  .string({ error: 'That link is not valid' })
  .regex(/^[A-Za-z0-9_-]{43}$/, 'That link is not valid');
/** Long enough for any real password; the rules (10–128 characters) are checked when setting one. */
const Password = z.string().max(200);

const TokenBody = z.object({ token: Token });
const SignInBody = z.object({
  email: z.string().trim().min(1).max(200),
  password: Password.min(1),
});
const CodeStepBody = z.object({ token: Token, code: z.string().trim().min(6).max(20) });
const SetPasswordBody = z.object({ token: Token, password: Password });
const ChangePasswordBody = z.object({ current: Password.default(''), password: Password });
const CodeBody = z.object({ code: z.string().trim().min(6).max(20) });
const PasswordBody = z.object({ password: Password.min(1) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  private sessionToken(req: Request) {
    return this.authService.extractCookie(
      req.headers.cookie,
      this.authService.getSessionCookieName(),
    );
  }

  private meta(req: Request) {
    return { ip: clientIp(req), userAgent: req.headers['user-agent'] || undefined };
  }

  /** The base URL for links: APP_URL in production, else the site the admin is using. */
  private appUrl(req: Request) {
    const configured = process.env.APP_URL?.trim();
    if (configured) return configured;
    const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
    return `${proto}://${req.headers.host}`;
  }

  private setCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(this.authService.getSessionCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
      path: '/',
    });
  }

  /** Sets the cookie for a new session and answers like /me; passes { needsCode } through. */
  private respond(res: Response, result: SignedIn | NeedsCode) {
    if ('needsCode' in result) return result;
    this.setCookie(res, result.sessionToken, result.expiresAt);
    return {
      authenticated: true,
      user: result.user,
      sessionExpiresAt: result.expiresAt,
      csrfToken: result.csrfToken,
    };
  }

  /**
   * Email and password. Answers { needsCode: true, token } when the account also uses an
   * authenticator app; the token (5 minutes) goes to POST /auth/sign-in/code with the code.
   */
  @Public()
  @Post('sign-in')
  async signIn(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(SignInBody)) body: z.infer<typeof SignInBody>,
  ) {
    const result = await this.authService.signInWithPassword(
      body.email,
      body.password,
      this.meta(req),
    );
    return this.respond(res, result);
  }

  /** The authenticator step: a 6-digit code or a recovery code. */
  @Public()
  @Post('sign-in/code')
  async signInCode(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(CodeStepBody)) body: z.infer<typeof CodeStepBody>,
  ) {
    return this.respond(
      res,
      await this.authService.signInWithCode(body.token, body.code, this.meta(req)),
    );
  }

  /** "Look around as a guest": read-only rigs, gear and events for 12 hours. */
  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('guest')
  async guest(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.startGuestSession(this.meta(req));
    this.setCookie(res, result.sessionToken, result.expiresAt);
    return {
      authenticated: true,
      user: guestView(result.user),
      sessionExpiresAt: result.expiresAt,
      csrfToken: result.csrfToken,
    };
  }

  /** Who a password link is for, and whether they have a password yet. Doesn't use it up. */
  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('link/check')
  async checkLink(@Body(new ZodPipe(TokenBody)) body: z.infer<typeof TokenBody>) {
    const info = await this.authService.peekSignInLink(body.token);
    if (!info)
      throw new NotFoundException(
        'This password link has expired or was already used. Ask an admin for a new one.',
      );
    return info;
  }

  /**
   * Sets the password from a password link, uses the link up and signs in, or answers
   * { needsCode: true, token } when the account also uses an authenticator app.
   */
  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post('link/redeem')
  async redeemLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(SetPasswordBody)) body: z.infer<typeof SetPasswordBody>,
  ) {
    return this.respond(
      res,
      await this.authService.setPasswordWithLink(body.token, body.password, this.meta(req)),
    );
  }

  @Public()
  @Get('me')
  async getMe(@Req() req: Request) {
    const auth = await this.authService.getAuthenticatedUser(this.sessionToken(req));
    if (!auth) return { authenticated: false };
    return {
      authenticated: true,
      user: auth.user.isGuest ? guestView(auth.user) : auth.user,
      sessionExpiresAt: auth.expiresAt,
      csrfToken: auth.csrfToken,
    };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.sessionToken(req);
    const auth = await this.authService.getAuthenticatedUser(token);
    await this.authService.logout(token);
    res.clearCookie(this.authService.getSessionCookieName(), { path: '/' });
    if (auth && !auth.user.isGuest) {
      await this.auditService.log({
        action: 'SIGN_OUT',
        resource: 'people',
        resourceId: auth.user.id,
        resourceName: auth.user.email,
        actor: auth.user,
      });
    }
    return { ok: true };
  }

  // ── Your own security (Account → Security) ─────────────────────────────

  @Get('security')
  security(@Req() req: AuthedRequest) {
    return this.authService.security(req.authUser!);
  }

  /** Changes (or first sets) your password; your other sessions are signed out. */
  @Post('password')
  changePassword(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(ChangePasswordBody)) body: z.infer<typeof ChangePasswordBody>,
  ) {
    return this.authService.changePassword(
      req.authUser!,
      req.authSessionId!,
      body.current,
      body.password,
    );
  }

  @Post('totp/start')
  totpStart(@Req() req: AuthedRequest) {
    return this.authService.totpStart(req.authUser!);
  }

  @Post('totp/enable')
  totpEnable(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(CodeBody)) body: z.infer<typeof CodeBody>,
  ) {
    return this.authService.totpEnable(req.authUser!, body.code);
  }

  @Post('totp/disable')
  totpDisable(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(PasswordBody)) body: z.infer<typeof PasswordBody>,
  ) {
    return this.authService.totpDisable(req.authUser!, body.password);
  }

  @Post('totp/recovery-codes')
  recoveryCodes(
    @Req() req: AuthedRequest,
    @Body(new ZodPipe(PasswordBody)) body: z.infer<typeof PasswordBody>,
  ) {
    return this.authService.regenerateRecoveryCodes(req.authUser!, body.password);
  }

  // ── Sign-in access for people (admins) ─────────────────────────────────

  /** Gives a person sign-in access with a role, or removes it (role: null). */
  @Patch('people/:id/access')
  @RequireRoles('admin')
  async setAccess(
    @Req() req: AuthedRequest,
    @Param('id', IdPipe) id: string,
    @Body() body: { role?: unknown },
  ) {
    const role =
      body?.role === null
        ? null
        : (ROLES as readonly unknown[]).includes(body?.role)
          ? (body.role as Role)
          : undefined;
    if (role === undefined)
      throw new BadRequestException('Role must be "admin", "user", "viewer" or null');
    if (req.authUser?.id === id && role !== 'admin') {
      throw new ForbiddenException('You cannot remove your own admin role');
    }
    const { before, after } = await this.authService.setAccess(id, role);
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'people',
      resourceId: id,
      resourceName: shortName(after),
      actor: req.authUser,
      details: { signInAccess: role ?? 'none' },
      before,
      after,
    });
    return after;
  }

  /** A single-use password link (72 hours) for the admin to text or email to the person. */
  @Post('people/:id/link')
  @RequireRoles('admin')
  async createLink(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    const { token, expiresAt, user } = await this.authService.createSignInLink(
      id,
      req.authUser?.email,
    );
    await this.auditService.log({
      action: 'SIGN_IN_LINK',
      resource: 'people',
      resourceId: user.id,
      resourceName: user.displayName || user.email,
      actor: req.authUser,
      details: { email: user.email },
    });
    return { link: signInLinkUrl(this.appUrl(req), token), expiresAt, email: user.email };
  }

  /** Signs the person out on every device. */
  @Post('people/:id/sign-out')
  @RequireRoles('admin')
  async signOutEverywhere(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    await this.authService.revokeAllSessions(id);
    await this.auditService.log({
      action: 'SIGN_OUT',
      resource: 'people',
      resourceId: id,
      actor: req.authUser,
      details: { everywhere: true },
    });
    return { ok: true };
  }

  /** Ends a cooldown after too many wrong passwords or codes. */
  @Post('people/:id/unlock')
  @RequireRoles('admin')
  unlock(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    return this.authService.unlock(id, req.authUser);
  }

  /** Turns off someone's authenticator codes (a lost phone); signs them out everywhere. */
  @Post('people/:id/reset-authenticator')
  @RequireRoles('admin')
  resetAuthenticator(@Req() req: AuthedRequest, @Param('id', IdPipe) id: string) {
    return this.authService.resetTotp(id, req.authUser);
  }
}

/** What /me shows a guest. */
function guestView(user: AuthUser) {
  return { id: user.id, displayName: user.displayName, roles: user.roles, isGuest: true };
}
