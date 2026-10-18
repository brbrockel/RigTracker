import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Event, EventDocument } from './event.schema';
import * as fs from 'fs';
import { defined } from '../common/validation';
import type { EventBody } from './event.dto';
import * as path from 'path';
import { uploadsDir } from '../common/uploads-dir';

const baseUploadDir = uploadsDir();

@Injectable()
export class EventsService {
  constructor(@InjectModel(Event.name) private eventModel: Model<EventDocument>) {}

  async findAll() {
    return this.eventModel.find().sort({ eventDate: 1, createdAt: 1 }).lean();
  }

  async findOne(id: string) {
    const event = await this.eventModel.findById(id).lean();
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(dto: EventBody) {
    const data = this.mapDto(dto);
    if (dto.eventPhotoUrl && !dto.photoUrls) data.photoUrls = [dto.eventPhotoUrl];
    const created = new this.eventModel(data);
    return created.save();
  }

  async update(id: string, dto: EventBody) {
    // A new main photo sent without the photo list joins the existing photos.
    const addMain =
      dto.eventPhotoUrl && !dto.photoUrls ? { $addToSet: { photoUrls: dto.eventPhotoUrl } } : {};
    const updated = await this.eventModel
      .findByIdAndUpdate(
        id,
        { $set: this.mapDto(dto), ...addMain },
        { new: true, runValidators: true },
      )
      .lean();
    if (!updated) throw new NotFoundException('Event not found');
    return updated;
  }

  async remove(id: string, purgeMedia = false) {
    const deleted = await this.eventModel.findByIdAndDelete(id).lean();
    if (!deleted) throw new NotFoundException('Event not found');
    if (purgeMedia) {
      this.deleteEventMediaFiles(deleted);
    }
    return { deleted: true };
  }

  private deleteEventMediaFiles(event: any) {
    const urls = new Set<string>();
    if (Array.isArray(event.photoUrls)) {
      event.photoUrls.forEach((url: any) => {
        if (url) urls.add(String(url));
      });
    }
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
  private mapDto(dto: EventBody) {
    const data: Record<string, unknown> = defined(dto);
    if (dto.eventPhotoUrl && dto.photoUrls && !dto.photoUrls.includes(dto.eventPhotoUrl)) {
      data.photoUrls = [...dto.photoUrls, dto.eventPhotoUrl];
    }
    return data;
  }
}
