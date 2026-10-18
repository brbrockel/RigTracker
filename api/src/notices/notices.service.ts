import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/auth-user.js';
import { AuditService } from '../audit/audit.service.js';
import { DB, type Database } from '../db/db.js';
import { noticeDismissals, noticeReads, notices, people, rigs, type Notice } from '../db/schema.js';
import { shortName } from '../people/person-view.js';
import { bannerState, passwordToDo, repackBanners } from './banners.js';
import type { EditNotice, NewNotice } from './notice.dto.js';

const recipient = alias(people, 'recipient');
const isAdmin = (u: AuthUser) => u.roles.includes('admin');

/** A notice's one line: its title, or the start of its text. */
export const noticeHeadline = (n: Pick<Notice, 'title' | 'body'>) =>
  n.title || (n.body.split('\n')[0] ?? '').slice(0, 100);

/** What the audit log keeps of a notice. */
const auditView = (n: Notice) => ({
  title: n.title,
  body: n.body,
  audience: n.audience,
  recipientId: n.recipientId,
  pinned: n.pinned,
  bannerUntil: n.bannerUntil,
});

/**
 * Notices from admins to everyone who signs in, one person, or the public (guests too), and
 * the app's own repack reminders. Each person's read and dismissed state is kept (guests
 * keep theirs in the browser); the ones still showing as banners sit at the top of every page.
 */
@Injectable()
export class NoticesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** The notices this person may see: guests the public ones, admins all of them. */
  private visible(user: AuthUser): SQL | undefined {
    if (user.isGuest) return eq(notices.audience, 'public');
    if (isAdmin(user)) return undefined;
    return or(inArray(notices.audience, ['everyone', 'public']), eq(notices.recipientId, user.id));
  }

  async list(user: AuthUser, limit: number) {
    const guest = !!user.isGuest;
    const rows = await this.db
      .select({
        n: notices,
        recipientFirst: recipient.firstName,
        recipientLast: recipient.lastName,
        readAt: noticeReads.readAt,
        dismissedAt: noticeReads.dismissedAt,
      })
      .from(notices)
      .leftJoin(recipient, eq(recipient.id, notices.recipientId))
      .leftJoin(
        noticeReads,
        and(
          eq(noticeReads.noticeId, notices.id),
          // A guest has no person: nothing matches.
          eq(noticeReads.personId, guest ? sql`null` : user.id),
        ),
      )
      .where(this.visible(user))
      .orderBy(desc(notices.pinned), desc(notices.createdAt))
      .limit(limit);
    const now = new Date();
    return rows.map((r) => {
      const n = r.n;
      const changed = n.updatedAt ?? n.createdAt;
      const dismissed = Boolean(r.dismissedAt && r.dismissedAt >= changed);
      const forMe = n.audience !== 'person' || n.recipientId === user.id;
      const to =
        n.audience === 'everyone'
          ? 'Everyone'
          : n.audience === 'public'
            ? guest
              ? 'RigTracker'
              : 'Everyone and guests'
            : n.recipientId === user.id
              ? 'You'
              : shortName({ firstName: r.recipientFirst, lastName: r.recipientLast }) ||
                'One person';
      const state = bannerState(n, dismissed, now);
      return {
        id: n.id,
        title: n.title,
        body: n.body,
        audience: n.audience,
        // Guests never see who a notice is for or who wrote it beyond "RigTracker".
        recipientId: guest ? null : n.recipientId,
        pinned: n.pinned,
        to,
        author: guest ? null : n.authorName,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        read: Boolean(r.readAt && r.readAt >= changed),
        dismissed,
        ...state,
        // Admins see notices to others, but they're no banner for them.
        banner: forMe && state.banner,
      };
    });
  }

  /**
   * Stored notices showing as banners, the automatic repack reminders, and the admins'
   * "needs a password" to-do, most urgent first.
   */
  async banners(user: AuthUser) {
    const listed = (await this.list(user, 100)).filter((n) => n.banner);
    const stored = listed.map((n) => ({
      id: n.id,
      automatic: false,
      title: noticeHeadline(n),
      body: n.title ? n.body : n.body.split('\n').slice(1).join('\n').trim(),
      label: n.to,
      urgent: n.urgent,
      dismissible: true,
      read: n.read,
      link: null as string | null,
      createdAt: (n.updatedAt ?? n.createdAt).toISOString(),
      rank: n.pinned ? 0 : n.audience === 'person' ? 2 : 3,
    }));
    let automatic: typeof stored = [];
    if (!user.isGuest) {
      const admin = isAdmin(user);
      const candidates = await this.db
        .select({
          id: rigs.id,
          number: rigs.number,
          name: rigs.name,
          repackDue: rigs.repackDue,
          primaryUserId: rigs.primaryUserId,
        })
        .from(rigs)
        .where(
          and(
            isNotNull(rigs.repackDue),
            sql`${rigs.repackDue} <= (now() at time zone 'utc')::date + 14`,
            admin ? undefined : eq(rigs.primaryUserId, user.id),
          ),
        );
      const auto = repackBanners(candidates, { id: user.id, isAdmin: admin });
      const gone = auto.length
        ? new Set(
            (
              await this.db
                .select({ key: noticeDismissals.key })
                .from(noticeDismissals)
                .where(
                  and(
                    eq(noticeDismissals.personId, user.id),
                    inArray(
                      noticeDismissals.key,
                      auto.map((a) => a.key),
                    ),
                  ),
                )
            ).map((d) => d.key),
          )
        : new Set<string>();
      automatic = auto
        .filter((a) => !gone.has(a.key))
        .map((a) => ({
          id: a.key,
          automatic: true,
          title: a.title,
          body: '',
          label: a.label,
          urgent: a.urgent,
          dismissible: true,
          read: true,
          link: a.link,
          createdAt: a.createdAt,
          rank: a.urgent ? 1 : a.kind === 'repack' ? 2 : 3,
        }));
      if (admin) {
        const todo = passwordToDo(
          await this.db
            .select({ firstName: people.firstName, lastName: people.lastName, email: people.email })
            .from(people)
            .where(
              and(isNotNull(people.role), eq(people.isActive, true), isNull(people.passwordHash)),
            )
            .orderBy(asc(people.firstName)),
        );
        if (todo)
          automatic.unshift({
            id: todo.key,
            automatic: true,
            title: todo.title,
            body: todo.body,
            label: todo.label,
            urgent: true,
            dismissible: false,
            read: true,
            link: todo.link,
            createdAt: new Date().toISOString(),
            rank: 0,
          });
      }
    }
    return [...stored, ...automatic]
      .sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt))
      .map(({ rank: _rank, ...b }) => b);
  }

  /** Marks notices read (opened) or dismissed (banner cleared away) for this person. */
  async mark(user: AuthUser, ids: string[], how: 'read' | 'dismissed') {
    if (!ids.length) return;
    const mine = await this.db
      .select({ id: notices.id })
      .from(notices)
      .where(and(this.visible(user), inArray(notices.id, ids)));
    if (!mine.length) return;
    const now = new Date();
    await this.db
      .insert(noticeReads)
      .values(
        mine.map((m) => ({
          noticeId: m.id,
          personId: user.id,
          readAt: now,
          dismissedAt: how === 'dismissed' ? now : null,
        })),
      )
      .onConflictDoUpdate({
        target: [noticeReads.noticeId, noticeReads.personId],
        set: how === 'dismissed' ? { readAt: now, dismissedAt: now } : { readAt: now },
      });
  }

  /** Clears automatic banners (repack reminders) for this person. */
  async dismissKeys(user: AuthUser, keys: string[]) {
    if (!keys.length) return;
    await this.db
      .insert(noticeDismissals)
      .values([...new Set(keys)].map((key) => ({ personId: user.id, key })))
      .onConflictDoNothing();
  }

  private async find(id: string): Promise<Notice> {
    const [n] = await this.db.select().from(notices).where(eq(notices.id, id)).limit(1);
    if (!n) throw new NotFoundException('Notice not found');
    return n;
  }

  /**
   * The mobile numbers of the people a notice is for, to text it from the admin's own phone,
   * and how many of them have none. Everyone (and public): people with sign-in access that's
   * on. Never the admin themselves.
   */
  async phones(actor: AuthUser, n: Pick<Notice, 'audience' | 'recipientId'>) {
    const who =
      n.audience === 'person'
        ? eq(people.id, n.recipientId!)
        : and(isNotNull(people.role), eq(people.isActive, true));
    const rows = await this.db
      .select({ phone: people.phone })
      .from(people)
      .where(and(who, ne(people.id, actor.id)));
    const phones = rows.map((r) => r.phone).filter((p): p is string => Boolean(p));
    return { phones: [...new Set(phones)], skipped: rows.length - phones.length };
  }

  async phonesFor(actor: AuthUser, id: string) {
    return this.phones(actor, await this.find(id));
  }

  async create(actor: AuthUser, input: NewNotice) {
    if (input.audience === 'person') {
      const [p] = await this.db
        .select({ id: people.id })
        .from(people)
        .where(eq(people.id, input.recipientId!));
      if (!p) throw new BadRequestException('Person not found');
    }
    const [n] = await this.db
      .insert(notices)
      .values({
        title: input.title ?? null,
        body: input.body,
        audience: input.audience,
        recipientId: input.audience === 'person' ? input.recipientId! : null,
        pinned: input.pinned,
        bannerUntil: input.bannerUntil ?? null,
        authorId: actor.id,
        authorName: actor.displayName || actor.email,
      })
      .returning();
    await this.audit.log({
      action: 'CREATE',
      resource: 'notices',
      resourceId: n!.id,
      resourceName: noticeHeadline(n!),
      actor,
      after: auditView(n!),
    });
    return { ...n!, ...(await this.phones(actor, n!)) };
  }

  async update(actor: AuthUser, id: string, input: EditNotice) {
    const before = await this.find(id);
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as Partial<Notice>;
    const [after] = await this.db
      .update(notices)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(notices.id, id))
      .returning();
    await this.audit.log({
      action: 'UPDATE',
      resource: 'notices',
      resourceId: id,
      resourceName: noticeHeadline(after!),
      actor,
      before: auditView(before),
      after: auditView(after!),
    });
    return after!;
  }

  async remove(actor: AuthUser, id: string) {
    const before = await this.find(id);
    await this.db.delete(notices).where(eq(notices.id, id));
    await this.audit.log({
      action: 'DELETE',
      resource: 'notices',
      resourceId: id,
      resourceName: noticeHeadline(before),
      actor,
      before: auditView(before),
    });
    return { ok: true };
  }
}
