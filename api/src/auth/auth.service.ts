import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from './user.schema'
import { Session, SessionDocument } from './session.schema'
import { SignInLink, SignInLinkDocument } from './sign-in-link.schema'
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken } from './tokens'

export const SESSION_COOKIE_NAME = 'rigtracker_session'

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(SignInLink.name) private linkModel: Model<SignInLinkDocument>,
  ) {}

  getSessionDurationMs() {
    return SESSION_DURATION_MS
  }

  getSessionCookieName() {
    return SESSION_COOKIE_NAME
  }

  /** Makes a single-use sign-in link token for an active user. */
  async createSignInLink(userId: string, createdByEmail?: string) {
    const user = await this.userModel.findById(userId).lean()
    if (!user || user.isActive === false) throw new NotFoundException('User not found')
    const token = newToken()
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS)
    await this.linkModel.create({ tokenHash: hashToken(token), userId: user._id, expiresAt, createdByEmail })
    return { token, expiresAt, user: this.mapUser(user) }
  }

  /** Who a link is for, without using it up (so a phone previewing the link can't spoil it). */
  async peekSignInLink(token: string) {
    const link = await this.linkModel.findOne({
      tokenHash: hashToken(token),
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    }).lean()
    if (!link) return null
    const user = await this.userModel.findById(link.userId).lean()
    if (!user || user.isActive === false) return null
    return { email: user.email || '', displayName: user.displayName || '' }
  }

  /** Uses up a link and starts a session. Returns null for an unknown, used or expired link. */
  async redeemSignInLink(token: string, meta: { ip?: string; userAgent?: string }) {
    const link = await this.linkModel.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true },
    ).lean()
    if (!link) return null
    const user = await this.userModel.findById(link.userId)
    if (!user || user.isActive === false) return null

    user.lastLoginAt = new Date()
    user.loginCount = (user.loginCount || 0) + 1
    user.lastLoginIp = meta.ip
    user.lastUserAgent = meta.userAgent
    await user.save()

    const sessionToken = newToken()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await this.sessionModel.create({
      sessionId: hashToken(sessionToken),
      userId: user._id as Types.ObjectId,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    return { sessionToken, expiresAt, user: this.mapUser(user) }
  }

  async getAuthenticatedUser(sessionToken?: string) {
    if (!sessionToken) return null
    const now = new Date()
    const session = await this.sessionModel.findOne({
      sessionId: hashToken(sessionToken),
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

  async logout(sessionToken?: string) {
    if (!sessionToken) return { ok: true }
    await this.sessionModel.updateOne(
      { sessionId: hashToken(sessionToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    )
    return { ok: true }
  }

  /** Signs someone out on every device. */
  async revokeAllSessions(userId: string) {
    await this.sessionModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    )
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

  async addUser(email: string, role: 'user' | 'admin', displayName?: string) {
    const existing = await this.userModel.findOne({ email }).lean()
    if (existing) throw new ConflictException('That email address has already been added')
    const user = await this.userModel.create({ provider: 'link', email, displayName, roles: [role], isActive: true })
    return this.mapUser(user)
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

  private mapUser(user: any) {
    return {
      id: String(user._id || user.id || ''),
      email: user.email || '',
      displayName: user.displayName || '',
      roles: Array.isArray(user.roles) ? user.roles : [],
      isActive: user.isActive !== false,
      lastLoginAt: user.lastLoginAt || null,
      loginCount: user.loginCount || 0,
    }
  }
}
