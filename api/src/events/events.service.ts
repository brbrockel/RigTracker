import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Event, EventDocument } from './event.schema'
import * as fs from 'fs'
import * as path from 'path'

const baseUploadDir = path.resolve(process.cwd(), 'uploads')

@Injectable()
export class EventsService {
  constructor(@InjectModel(Event.name) private eventModel: Model<EventDocument>) {}

  async findAll() {
    return this.eventModel.find().sort({ eventDate: 1, createdAt: 1 }).lean()
  }

  async findOne(id: string) {
    const event = await this.eventModel.findById(id).lean()
    if (!event) throw new NotFoundException('Event not found')
    return event
  }

  async create(dto: any) {
    const created = new this.eventModel(this.mapDto(dto))
    return created.save()
  }

  async update(id: string, dto: any) {
    const updated = await this.eventModel.findByIdAndUpdate(id, this.mapDto(dto), { new: true }).lean()
    if (!updated) throw new NotFoundException('Event not found')
    return updated
  }

  async remove(id: string, purgeMedia = false) {
    const deleted = await this.eventModel.findByIdAndDelete(id).lean()
    if (!deleted) throw new NotFoundException('Event not found')
    if (purgeMedia) {
      this.deleteEventMediaFiles(deleted)
    }
    return { deleted: true }
  }

  private deleteEventMediaFiles(event: any) {
    const urls = new Set<string>()
    if (Array.isArray(event.photoUrls)) {
      event.photoUrls.forEach((url: any) => {
        if (url) urls.add(String(url))
      })
    }
    if (event.eventPhotoUrl) urls.add(String(event.eventPhotoUrl))

    urls.forEach((url) => {
      if (!url.startsWith('/uploads/')) return
      const relativePath = url.slice('/uploads/'.length)
      const absolutePath = path.resolve(baseUploadDir, relativePath)
      if (!absolutePath.startsWith(baseUploadDir + path.sep)) return
      try {
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath)
          this.cleanupEmptyUploadDirs(path.dirname(absolutePath))
        }
      } catch (err) {
        // keep delete-event operation resilient even if file cleanup fails
      }
    })
  }

  private cleanupEmptyUploadDirs(startDir: string) {
    let currentDir = startDir
    while (currentDir.startsWith(baseUploadDir + path.sep) && currentDir !== baseUploadDir) {
      try {
        const entries = fs.readdirSync(currentDir)
        if (entries.length > 0) break
        fs.rmdirSync(currentDir)
        currentDir = path.dirname(currentDir)
      } catch (err) {
        break
      }
    }
  }

  private mapDto(dto: any) {
    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.eventDate !== undefined) data.eventDate = dto.eventDate
    if (dto.event_date !== undefined) data.eventDate = dto.event_date
    if (dto.date !== undefined) data.eventDate = dto.date
    if (dto.description !== undefined) data.description = dto.description
    if (dto.eventPhotoUrl !== undefined) data.eventPhotoUrl = dto.eventPhotoUrl
    if (dto.event_photo_url !== undefined) data.eventPhotoUrl = dto.event_photo_url
    const photoUrls = this.normalizePhotoUrls(dto.photoUrls ?? dto.photo_urls ?? dto.albumUrls ?? dto.album_urls)
    if (photoUrls) data.photoUrls = photoUrls
    const eventPhotoUrl = data.eventPhotoUrl || dto.eventPhotoUrl || dto.event_photo_url
    if (eventPhotoUrl && !data.photoUrls?.includes(eventPhotoUrl)) {
      data.photoUrls = [...(data.photoUrls || []), eventPhotoUrl]
    }
    if (!data.eventPhotoUrl && dto.eventPhotoUrl) data.eventPhotoUrl = dto.eventPhotoUrl
    return data
  }

  private normalizePhotoUrls(value: any): string[] | undefined {
    if (value === undefined || value === null) return undefined
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean)
      } catch (err) {
        return value.split(',').map((item) => item.trim()).filter(Boolean)
      }
    }
    return undefined
  }
}
