import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Person, PersonDocument } from '../people/person.schema';
import { Session, SessionDocument } from './session.schema';
import { SignInLink, SignInLinkDocument } from './sign-in-link.schema';
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken } from './tokens';

export const SESSION_COOKIE_NAME = 'rigtracker_session';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

export const ROLES = ['admin', 'user', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Signed-in people are people records with a role; sessions and links point at the person. */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Person.name) private personModel: Model<PersonDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(SignInLink.name) private linkModel: Model<SignInLinkDocument>,
  ) {}

  getSessionDurationMs() {
    return SESSION_DURATION_MS;
  }

  getSessionCookieName() {
    return SESSION_COOKIE_NAME;
  }

  private canSignIn(
    p: { roles?: string[]; isActive?: boolean; email?: string } | null | undefined,
  ) {
    return !!p && !!p.roles?.length && p.isActive !== false && !!p.email;
  }

  /** Makes a single-use sign-in link token for someone with sign-in access. */
  async createSignInLink(personId: string, createdByEmail?: string) {
    const person = await this.personModel.findById(personId).lean();
    if (!person) throw new NotFoundException('Person not found');
    if (!this.canSignIn(person))
      throw new BadRequestException('Give this person sign-in access first');
    const token = newToken();
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS);
    await this.linkModel.create({
      tokenHash: hashToken(token),
      userId: person._id,
      expiresAt,
      createdByEmail,
    });
    return { token, expiresAt, user: this.mapUser(person) };
  }

  /** Who a link is for, without using it up (so a phone previewing the link can't spoil it). */
  async peekSignInLink(token: string) {
    const link = await this.linkModel
      .findOne({
        tokenHash: hashToken(token),
        usedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .lean();
    if (!link) return null;
    const person = await this.personModel.findById(link.userId).lean();
    if (!this.canSignIn(person)) return null;
    const user = this.mapUser(person);
    return { email: user.email, displayName: user.displayName };
  }

  /** Uses up a link and starts a session. Returns null for an unknown, used or expired link. */
  async redeemSignInLink(token: string, meta: { ip?: string; userAgent?: string }) {
    const link = await this.linkModel
      .findOneAndUpdate(
        { tokenHash: hashToken(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true },
      )
      .lean();
    if (!link) return null;
    const person = await this.personModel
      .findByIdAndUpdate(
        link.userId,
        {
          $set: { lastLoginAt: new Date(), lastLoginIp: meta.ip, lastUserAgent: meta.userAgent },
          $inc: { loginCount: 1 },
        },
        { new: true },
      )
      .lean();
    if (!this.canSignIn(person)) return null;

    const sessionToken = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.sessionModel.create({
      sessionId: hashToken(sessionToken),
      userId: person!._id as Types.ObjectId,
      expiresAt,
      csrfToken,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { sessionToken, csrfToken, expiresAt, user: this.mapUser(person) };
  }

  async getAuthenticatedUser(sessionToken?: string) {
    if (!sessionToken) return null;
    const now = new Date();
    const session = await this.sessionModel
      .findOne({
        sessionId: hashToken(sessionToken),
        revokedAt: { $exists: false },
        expiresAt: { $gt: now },
      })
      .lean();
    if (!session?.userId) return null;

    const person = await this.personModel.findById(session.userId).lean();
    if (!this.canSignIn(person)) return null;

    let csrfToken = session.csrfToken;
    if (!csrfToken) {
      // Sessions made before CSRF tokens existed get one on first use.
      csrfToken = newToken();
      await this.sessionModel.updateOne({ _id: session._id }, { $set: { csrfToken } });
    }

    return {
      user: this.mapUser(person),
      expiresAt: session.expiresAt,
      csrfToken,
    };
  }

  async logout(sessionToken?: string) {
    if (!sessionToken) return { ok: true };
    await this.sessionModel.updateOne(
      { sessionId: hashToken(sessionToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    return { ok: true };
  }

  /** Signs someone out on every device. */
  async revokeAllSessions(personId: string) {
    if (!/^[a-f0-9]{24}$/i.test(personId)) throw new BadRequestException('Invalid id');
    await this.sessionModel.updateMany(
      { userId: new Types.ObjectId(personId), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }

  /**
   * Gives a person sign-in access with a role, or takes it away (null), which also signs them
   * out everywhere. They need an email address that no one else who signs in uses.
   */
  async setAccess(personId: string, role: Role | null) {
    const person = await this.personModel.findById(personId).lean();
    if (!person) throw new NotFoundException('Person not found');
    if (role) {
      if (!person.email)
        throw new BadRequestException('Add an email address before giving sign-in access');
      const other = await this.personModel
        .findOne({ _id: { $ne: person._id }, email: person.email, 'roles.0': { $exists: true } })
        .lean();
      if (other) throw new ConflictException('Another person who signs in already uses that email');
    }
    const updated = await this.personModel
      .findByIdAndUpdate(
        personId,
        { $set: { roles: role ? [role] : [], isActive: true } },
        { new: true },
      )
      .lean();
    if (!role) await this.revokeAllSessions(personId);
    return updated;
  }

  extractCookie(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader || !name) return undefined;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key === name) {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      }
    }
    return undefined;
  }

  private mapUser(person: any) {
    return {
      id: String(person._id || person.id || ''),
      email: person.email || '',
      displayName: [person.firstName, person.lastName].filter(Boolean).join(' '),
      roles: Array.isArray(person.roles) ? person.roles : [],
      isActive: person.isActive !== false,
      lastLoginAt: person.lastLoginAt || null,
      loginCount: person.loginCount || 0,
    };
  }
}
