import { BadRequestException, ConflictException, Injectable, NotFoundException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { randomBytes } from 'crypto'
import { User, UserDocument } from './user.schema'
import { Session, SessionDocument } from './session.schema'
import { readSecret } from '../common/secrets'

export const SESSION_COOKIE_NAME = 'rigtracker_session'
export const OAUTH_STATE_COOKIE_NAME = 'rigtracker_oauth_state'

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30
const OAUTH_STATE_DURATION_MS = 1000 * 60 * 10

interface GoogleTokenResponse {
  access_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

interface GoogleUserInfo {
  sub?: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
  ) {}

  getSessionDurationMs() {
    return SESSION_DURATION_MS
  }

  getOAuthStateDurationMs() {
    return OAUTH_STATE_DURATION_MS
  }

  getSessionCookieName() {
    return SESSION_COOKIE_NAME
  }

  getOAuthStateCookieName() {
    return OAUTH_STATE_COOKIE_NAME
  }

  createGoogleAuthRequest() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const callbackUrl = process.env.AUTH_GOOGLE_CALLBACK_URL?.trim()
    if (!clientId || !callbackUrl) {
      throw new InternalServerErrorException('Google auth is not configured')
    }

    const state = this.randomToken(24)
    const scope = encodeURIComponent('openid email profile')
    const redirectUri = encodeURIComponent(callbackUrl)
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${encodeURIComponent(state)}` +
      '&prompt=select_account'

    return { url, state }
  }

  async exchangeGoogleCodeForSession(params: {
    code?: string
    state?: string
    expectedState?: string
    ip?: string
    userAgent?: string
  }) {
    const code = params.code?.trim()
    const state = params.state?.trim()
    const expectedState = params.expectedState?.trim()
    if (!code) {
      throw new BadRequestException('Missing OAuth code')
    }
    if (!state || !expectedState || state !== expectedState) {
      throw new UnauthorizedException('Invalid OAuth state')
    }

    const token = await this.fetchGoogleToken(code)
    const accessToken = token.access_token?.trim()
    if (!accessToken) {
      throw new UnauthorizedException('Failed to obtain Google access token')
    }

    const profile = await this.fetchGoogleUserInfo(accessToken)
    const googleId = profile.sub?.trim()
    const email = profile.email?.trim().toLowerCase()
    if (!googleId || !email) {
      throw new UnauthorizedException('Google profile data incomplete')
    }
    if (profile.email_verified !== true) {
      throw new UnauthorizedException('Google email address is not verified')
    }
    const known = await this.findKnownUser(googleId, email)
    if (known?.isActive === false) {
      throw new UnauthorizedException('This account is disabled')
    }
    if (!known && !this.isEmailAllowed(email)) {
      throw new UnauthorizedException('This account is not allowed to access RigTracker')
    }

    const user = await this.upsertUser({
      googleId,
      email,
      displayName: profile.name?.trim(),
      pictureUrl: profile.picture?.trim(),
      ip: params.ip,
      userAgent: params.userAgent,
    })

    const sessionId = this.randomToken(48)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

    await this.sessionModel.create({
      sessionId,
      userId: user._id as Types.ObjectId,
      expiresAt,
      ip: params.ip,
      userAgent: params.userAgent,
    })

    return {
      sessionId,
      expiresAt,
      user: this.mapUser(user),
    }
  }

  async getAuthenticatedUser(sessionId?: string) {
    if (!sessionId) return null
    const now = new Date()
    const session = await this.sessionModel.findOne({
      sessionId,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    }).lean()
    if (!session?.userId) return null

    const user = await this.userModel.findById(session.userId).lean()
    if (!user || user.isActive === false) return null

    return {
      user: this.mapUser(user),
      expiresAt: session.expiresAt,
    }
  }

  async logout(sessionId?: string) {
    if (!sessionId) return { ok: true }
    await this.sessionModel.updateOne(
      { sessionId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    )
    return { ok: true }
  }

  async listUsers() {
    const users = await this.userModel.find({}).lean()
    return users.map((u) => this.mapUser(u))
  }

  async setUserRole(userId: string, role: string) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: { roles: [role] } },
      { new: true },
    ).lean()
    if (!user) throw new NotFoundException('User not found')
    return this.mapUser(user)
  }

  async addUser(email: string, role: 'user' | 'admin') {
    const existing = await this.userModel.findOne({ email }).lean()
    if (existing) throw new ConflictException('That email address has already been added')
    const user = await this.userModel.create({ provider: 'google', email, roles: [role], isActive: true })
    return this.mapUser(user)
  }

  /** A user already on file: by Google account, or by email for someone an admin added who hasn't signed in yet. */
  private async findKnownUser(googleId: string, email: string) {
    const byGoogleId = await this.userModel.findOne({ googleId })
    if (byGoogleId) return byGoogleId
    return this.userModel.findOne({ email, googleId: { $exists: false } })
  }

  extractCookie(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader || !name) return undefined
    const parts = cookieHeader.split(';')
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (key === name) {
        try {
          return decodeURIComponent(val)
        } catch {
          return val
        }
      }
    }
    return undefined
  }

  private randomToken(bytes: number) {
    return randomBytes(bytes).toString('hex')
  }

  private async fetchGoogleToken(code: string): Promise<GoogleTokenResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
    const clientSecret = readSecret('GOOGLE_CLIENT_SECRET')
    const callbackUrl = process.env.AUTH_GOOGLE_CALLBACK_URL?.trim()
    if (!clientId || !clientSecret || !callbackUrl) {
      throw new InternalServerErrorException('Google auth is not configured')
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code',
    })

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!response.ok) {
      throw new UnauthorizedException('Google token exchange failed')
    }
    return (await response.json()) as GoogleTokenResponse
  }

  private async fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      throw new UnauthorizedException('Google profile lookup failed')
    }
    return (await response.json()) as GoogleUserInfo
  }

  private async upsertUser(params: {
    googleId: string
    email: string
    displayName?: string
    pictureUrl?: string
    ip?: string
    userAgent?: string
  }) {
    const existing = await this.findKnownUser(params.googleId, params.email)

    if (existing) {
      existing.provider = 'google'
      existing.googleId = params.googleId
      existing.email = params.email
      existing.displayName = params.displayName || existing.displayName
      existing.pictureUrl = params.pictureUrl || existing.pictureUrl
      existing.lastLoginAt = new Date()
      existing.loginCount = (existing.loginCount || 0) + 1
      existing.lastLoginIp = params.ip
      existing.lastUserAgent = params.userAgent
      if (existing.isActive === undefined) existing.isActive = true
      if (!existing.roles || !existing.roles.length) existing.roles = ['user']
      return existing.save()
    }

    const existingUsers = await this.userModel.countDocuments({})
    const roles = existingUsers === 0 ? ['admin'] : ['user']

    return this.userModel.create({
      provider: 'google',
      googleId: params.googleId,
      email: params.email,
      displayName: params.displayName,
      pictureUrl: params.pictureUrl,
      roles,
      isActive: true,
      lastLoginAt: new Date(),
      loginCount: 1,
      lastLoginIp: params.ip,
      lastUserAgent: params.userAgent,
    })
  }

  private mapUser(user: any) {
    return {
      id: String(user._id || user.id || ''),
      email: user.email || '',
      displayName: user.displayName || '',
      pictureUrl: user.pictureUrl || '',
      roles: Array.isArray(user.roles) ? user.roles : [],
      isActive: user.isActive !== false,
      lastLoginAt: user.lastLoginAt || null,
      loginCount: user.loginCount || 0,
    }
  }

  private isEmailAllowed(email: string): boolean {
    const allowlistRaw = (process.env.AUTH_ALLOWED_EMAILS || '').trim()
    const domainRaw = (process.env.AUTH_ALLOWED_EMAIL_DOMAIN || '').trim()
    // Fail closed: with no allowlist, only people already added (by an admin) can sign in.
    if (!allowlistRaw && !domainRaw) return false

    const allowlist = new Set(
      allowlistRaw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    )

    const allowedDomains = domainRaw
      .split(',')
      .map((item) => item.trim().toLowerCase().replace(/^@+/, ''))
      .filter(Boolean)

    if (allowlist.has(email)) return true

    const emailDomain = email.split('@')[1] || ''
    if (allowedDomains.includes(emailDomain)) return true

    return false
  }
}
