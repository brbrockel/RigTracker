import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.js';
import { events, type Event } from '../db/schema.js';
import { defined } from '../common/validation.js';
import { omit } from '../common/omit.js';
import { MediaService } from '../media/media.service.js';
import type { EventBody } from './event.dto.js';

/** An event's own fields as the API returns them (and the audit log records them). */
export function eventToApi(event: Event) {
  return omit(event, 'legacyId', 'eventPhotoUrl', 'photoUrls');
}

@Injectable()
export class EventsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mediaService: MediaService,
  ) {}

  /** An event with its `media` (the cover, its main photo, first) and `coverUrl`. */
  withMedia<T extends { id: string }>(event: T) {
    return this.mediaService.attachOne('event', event);
  }

  /** By date (undated first, as before), then by when they were added. */
  async findAll() {
    const rows = await this.db
      .select()
      .from(events)
      .orderBy(sql`${events.eventDate} asc nulls first`, asc(events.createdAt));
    return this.mediaService.attach('event', rows.map(eventToApi));
  }

  async findOne(id: string) {
    const [event] = await this.db.select().from(events).where(eq(events.id, id));
    if (!event) throw new NotFoundException('Event not found');
    return this.withMedia(eventToApi(event));
  }

  async create(dto: EventBody) {
    const [created] = await this.db.insert(events).values(defined(dto)).returning();
    return { ...eventToApi(created!), media: [], coverUrl: null };
  }

  /** Returns the event before and after (for the audit log). */
  async update(id: string, dto: EventBody) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(events).where(eq(events.id, id)).for('update');
      if (!before) throw new NotFoundException('Event not found');
      const changes = defined(dto);
      const [after] = Object.keys(changes).length
        ? await tx.update(events).set(changes).where(eq(events.id, id)).returning()
        : [before];
      return { before: eventToApi(before), after: eventToApi(after!) };
    });
  }

  /** Its photos and videos (rows and files) go with it. */
  async remove(id: string) {
    const urls = await this.db.transaction(async (tx) => {
      const deleted = await tx.delete(events).where(eq(events.id, id)).returning({ id: events.id });
      if (!deleted.length) throw new NotFoundException('Event not found');
      return this.mediaService.deleteForOwner(tx, 'event', id);
    });
    await this.mediaService.removeUnusedFiles(urls);
    return { deleted: true, mediaDeleted: urls.length };
  }
}
