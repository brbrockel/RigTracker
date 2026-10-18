import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import * as fs from 'node:fs';
import { DB, type Database, type Executor } from '../db/db.js';
import {
  events,
  gear,
  media,
  rigs,
  type Media,
  type MediaKind,
  type MediaOwnerType,
} from '../db/schema.js';
import { UploadsService } from '../uploads/uploads.service.js';
import type { MediaPatchBody } from './media.dto.js';

/** A photo or video as the API returns it, on its owner's `media` list. */
export interface MediaItem {
  id: string;
  url: string;
  kind: MediaKind;
  caption: string | null;
  position: number;
}

/** The owner's audit-log resource (the owner's own resource name). */
export const OWNER_RESOURCE: Record<MediaOwnerType, 'rigs' | 'gear' | 'events'> = {
  rig: 'rigs',
  gear: 'gear',
  event: 'events',
};
const OWNER_LABEL: Record<MediaOwnerType, string> = { rig: 'Rig', gear: 'Gear', event: 'Event' };

export interface MediaOwner {
  type: MediaOwnerType;
  id: string;
  name: string | null;
}

const itemColumns = {
  id: media.id,
  url: media.url,
  kind: media.kind,
  caption: media.caption,
  position: media.position,
};
const order = [asc(media.position), asc(media.createdAt), asc(media.id)];

export const toItem = (m: Media): MediaItem => ({
  id: m.id,
  url: m.url,
  kind: m.kind,
  caption: m.caption,
  position: m.position,
});

/**
 * Photos and videos of rigs, gear and events. Each owner's list is kept numbered 0, 1, 2, …
 * (0 is the cover); changes to one owner's list lock the owner's row, so they happen one at
 * a time. A file is deleted with the last row that uses it.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly uploads: UploadsService,
  ) {}

  /** The owner, or 404. `lock` holds its row until the transaction ends. */
  async owner(
    type: MediaOwnerType,
    id: string,
    tx: Executor = this.db,
    lock = false,
  ): Promise<MediaOwner> {
    const table = type === 'rig' ? rigs : type === 'gear' ? gear : events;
    const q = tx.select({ id: table.id, name: table.name }).from(table).where(eq(table.id, id));
    const [row] = lock ? await q.for('update') : await q;
    if (!row) throw new NotFoundException(`${OWNER_LABEL[type]} not found`);
    return { type, id: row.id, name: row.name };
  }

  /** Each owner's media in order, by owner id (an empty list for owners with none). */
  async forOwners(
    type: MediaOwnerType,
    ids: string[],
    tx: Executor = this.db,
  ): Promise<Map<string, MediaItem[]>> {
    const byOwner = new Map<string, MediaItem[]>(ids.map((id) => [id, []]));
    if (!ids.length) return byOwner;
    const rows = await tx
      .select({ ownerId: media.ownerId, ...itemColumns })
      .from(media)
      .where(and(eq(media.ownerType, type), inArray(media.ownerId, [...new Set(ids)])))
      .orderBy(...order);
    for (const { ownerId, ...item } of rows) byOwner.get(ownerId)?.push(item);
    return byOwner;
  }

  /** Records with their `media` (in order) and `coverUrl` (the first one's URL, or null). */
  async attach<T extends { id: string }>(
    type: MediaOwnerType,
    records: T[],
  ): Promise<Array<T & { media: MediaItem[]; coverUrl: string | null }>> {
    const byOwner = await this.forOwners(
      type,
      records.map((r) => r.id),
    );
    return records.map((r) => {
      const list = byOwner.get(r.id) ?? [];
      return { ...r, media: list, coverUrl: list[0]?.url ?? null };
    });
  }

  async attachOne<T extends { id: string }>(type: MediaOwnerType, record: T) {
    return (await this.attach(type, [record]))[0]!;
  }

  async list(type: MediaOwnerType, ownerId: string): Promise<MediaItem[]> {
    await this.owner(type, ownerId);
    return (await this.forOwners(type, [ownerId])).get(ownerId)!;
  }

  /**
   * Stores an uploaded file under uploads/<type>/<ownerId>/ and adds it at the end of the
   * owner's list (the cover if it's the first). 404, and nothing kept, if the owner is gone.
   */
  async add(params: {
    type: MediaOwnerType;
    ownerId: string;
    incoming: string;
    size: number;
    caption?: string | null | undefined;
    uploadedBy?: string | null | undefined;
  }): Promise<{ item: MediaItem; owner: MediaOwner }> {
    try {
      await this.owner(params.type, params.ownerId);
    } catch (err) {
      fs.rmSync(params.incoming, { force: true });
      throw err;
    }
    const stored = await this.uploads.store(
      params.incoming,
      params.size,
      `${params.type}/${params.ownerId}`,
    );
    try {
      return await this.db.transaction(async (tx) => {
        const owner = await this.owner(params.type, params.ownerId, tx, true);
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(media)
          .where(and(eq(media.ownerType, params.type), eq(media.ownerId, params.ownerId)));
        const [row] = await tx
          .insert(media)
          .values({
            ownerType: params.type,
            ownerId: params.ownerId,
            url: stored.url,
            kind: stored.kind,
            caption: params.caption ?? null,
            position: n,
            uploadedBy: params.uploadedBy ?? null,
          })
          .returning();
        return { item: toItem(row!), owner };
      });
    } catch (err) {
      this.uploads.removeFile(stored.url);
      throw err;
    }
  }

  private async get(id: string, tx: Executor): Promise<Media> {
    const [row] = await tx.select().from(media).where(eq(media.id, id));
    if (!row) throw new NotFoundException('Photo or video not found');
    return row;
  }

  /** Puts the owner's list in the given order, renumbering 0, 1, 2, … */
  private async renumber(tx: Executor, rows: Array<Pick<Media, 'id' | 'position'>>) {
    for (const [i, row] of rows.entries()) {
      if (row.position !== i)
        await tx.update(media).set({ position: i }).where(eq(media.id, row.id));
    }
  }

  private async siblings(tx: Executor, m: Pick<Media, 'ownerType' | 'ownerId'>) {
    return tx
      .select({ id: media.id, position: media.position })
      .from(media)
      .where(and(eq(media.ownerType, m.ownerType), eq(media.ownerId, m.ownerId)))
      .orderBy(...order);
  }

  /**
   * Changes the caption, and/or moves it: makeCover to the front, position to that place
   * (past the end means last). `coverChanged` says whether the owner's cover is now different.
   */
  async update(id: string, dto: MediaPatchBody) {
    return this.db.transaction(async (tx) => {
      const found = await this.get(id, tx);
      const owner = await this.owner(found.ownerType, found.ownerId, tx, true);
      const list = await this.siblings(tx, found);
      const coverBefore = list[0]?.id;
      const target = dto.makeCover ? 0 : dto.position;
      if (target !== undefined) {
        const rest = list.filter((m) => m.id !== id);
        rest.splice(Math.min(target, rest.length), 0, { id, position: found.position });
        await this.renumber(tx, rest);
      }
      if (dto.caption !== undefined)
        await tx.update(media).set({ caption: dto.caption }).where(eq(media.id, id));
      const after = await this.get(id, tx);
      const coverAfter = (await this.siblings(tx, found))[0]?.id;
      return {
        item: toItem(after),
        owner,
        coverChanged: coverBefore !== coverAfter,
        captionChanged: dto.caption !== undefined && dto.caption !== found.caption,
      };
    });
  }

  /** Deletes the row, and its file if no other row uses it. The next one becomes the cover. */
  async remove(id: string) {
    const result = await this.db.transaction(async (tx) => {
      const found = await this.get(id, tx);
      const owner = await this.owner(found.ownerType, found.ownerId, tx, true);
      await tx.delete(media).where(eq(media.id, id));
      await this.renumber(tx, await this.siblings(tx, found));
      return { removed: found, owner };
    });
    await this.removeUnusedFiles([result.removed.url]);
    return { item: toItem(result.removed), owner: result.owner };
  }

  /**
   * Deletes an owner's media rows (inside the owner's delete transaction) and returns their
   * URLs; call removeUnusedFiles with them once the transaction has committed.
   */
  async deleteForOwner(tx: Executor, type: MediaOwnerType, ownerId: string): Promise<string[]> {
    const rows = await tx
      .delete(media)
      .where(and(eq(media.ownerType, type), eq(media.ownerId, ownerId)))
      .returning({ url: media.url });
    return rows.map((r) => r.url);
  }

  /** Deletes the files of these URLs that no media row uses any more (uploads only). */
  async removeUnusedFiles(urls: string[]): Promise<void> {
    const unique = [...new Set(urls.filter((u) => u.startsWith('/uploads/')))];
    if (!unique.length) return;
    const used = new Set(
      (
        await this.db
          .selectDistinct({ url: media.url })
          .from(media)
          .where(inArray(media.url, unique))
      ).map((r) => r.url),
    );
    for (const url of unique) if (!used.has(url)) this.uploads.removeFile(url);
  }
}
