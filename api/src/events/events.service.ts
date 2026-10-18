import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DB, type Database } from '../db/db.js';
import { events, type Event } from '../db/schema.js';
import { defined } from '../common/validation.js';
import { omit } from '../common/omit.js';
import { uploadsDir } from '../common/uploads-dir.js';
import type { EventBody } from './event.dto.js';

const baseUploadDir = uploadsDir();

/** An event as the API returns it. */
export function eventToApi(event: Event) {
  return omit(event, 'legacyId');
}

@Injectable()
export class EventsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** By date (undated first, as before), then by when they were added. */
  async findAll() {
    const rows = await this.db
      .select()
      .from(events)
      .orderBy(sql`${events.eventDate} asc nulls first`, asc(events.createdAt));
    return rows.map(eventToApi);
  }

  private async get(id: string) {
    const [event] = await this.db.select().from(events).where(eq(events.id, id));
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async findOne(id: string) {
    return eventToApi(await this.get(id));
  }

  async create(dto: EventBody) {
    const data = this.mapDto(dto);
    if (dto.eventPhotoUrl && !dto.photoUrls) data.photoUrls = [dto.eventPhotoUrl];
    const [created] = await this.db.insert(events).values(data).returning();
    return eventToApi(created!);
  }

  /** Returns the event before and after (for the audit log). */
  async update(id: string, dto: EventBody) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(events).where(eq(events.id, id)).for('update');
      if (!before) throw new NotFoundException('Event not found');
      const changes: Record<string, unknown> = this.mapDto(dto);
      // A new main photo sent without the photo list joins the existing photos.
      if (dto.eventPhotoUrl && !dto.photoUrls) {
        changes.photoUrls = sql`case when ${dto.eventPhotoUrl}::text = any(${events.photoUrls})
          then ${events.photoUrls} else array_append(${events.photoUrls}, ${dto.eventPhotoUrl}::text) end`;
      }
      const [after] = Object.keys(changes).length
        ? await tx.update(events).set(changes).where(eq(events.id, id)).returning()
        : [before];
      return { before: eventToApi(before), after: eventToApi(after!) };
    });
  }

  async remove(id: string, purgeMedia = false) {
    const [deleted] = await this.db.delete(events).where(eq(events.id, id)).returning();
    if (!deleted) throw new NotFoundException('Event not found');
    if (purgeMedia) {
      this.deleteEventMediaFiles(deleted);
    }
    return { deleted: true };
  }

  private deleteEventMediaFiles(event: Event) {
    const urls = new Set<string>();
    for (const url of event.photoUrls) if (url) urls.add(String(url));
    if (event.eventPhotoUrl) urls.add(String(event.eventPhotoUrl));

    urls.forEach((url) => {
      if (!url.startsWith('/uploads/')) return;
      const relativePath = url.slice('/uploads/'.length);
      const absolutePath = path.resolve(baseUploadDir, relativePath);
      if (!absolutePath.startsWith(baseUploadDir + path.sep)) return;
      try {
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
          this.cleanupEmptyUploadDirs(path.dirname(absolutePath));
        }
      } catch {
        // keep delete-event operation resilient even if file cleanup fails
      }
    });
  }

  private cleanupEmptyUploadDirs(startDir: string) {
    let currentDir = startDir;
    while (currentDir.startsWith(baseUploadDir + path.sep) && currentDir !== baseUploadDir) {
      try {
        const entries = fs.readdirSync(currentDir);
        if (entries.length > 0) break;
        fs.rmdirSync(currentDir);
        currentDir = path.dirname(currentDir);
      } catch {
        break;
      }
    }
  }

  /** The main photo is always one of the event's photos. */
  private mapDto(dto: EventBody): Partial<typeof events.$inferInsert> {
    const data: Partial<typeof events.$inferInsert> = defined(dto);
    if (dto.eventPhotoUrl && dto.photoUrls && !dto.photoUrls.includes(dto.eventPhotoUrl)) {
      data.photoUrls = [...dto.photoUrls, dto.eventPhotoUrl];
    }
    return data;
  }
}
