import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Gear, GearDocument } from './gear.schema'

@Injectable()
export class GearService {
  constructor(@InjectModel(Gear.name) private gearModel: Model<GearDocument>) {}

  async findAll() {
    return this.gearModel.find().lean()
  }

  async findOne(id: string) {
    const gear = await this.gearModel.findById(id).lean()
    if (!gear) throw new NotFoundException('Gear not found')
    return gear
  }

  async create(dto: any) {
    const created = new this.gearModel(this.mapDto(dto))
    return created.save()
  }

  async update(id: string, dto: any) {
    const updated = await this.gearModel.findByIdAndUpdate(id, this.mapDto(dto), { new: true }).lean()
    if (!updated) throw new NotFoundException('Gear not found')
    return updated
  }

  async remove(id: string) {
    const deleted = await this.gearModel.findByIdAndDelete(id).lean()
    if (!deleted) throw new NotFoundException('Gear not found')
    return { ok: true }
  }

  private mapDto(dto: any) {
    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.type !== undefined) data.type = dto.type
    if (dto.dateOfManufacture !== undefined) data.dateOfManufacture = dto.dateOfManufacture
    if (dto.date_of_manufacture !== undefined) data.dateOfManufacture = dto.date_of_manufacture
    if (dto.manufactureDate !== undefined) data.dateOfManufacture = dto.manufactureDate
    if (dto.notes !== undefined) data.notes = dto.notes
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl
    if (dto.image_url !== undefined) data.imageUrl = dto.image_url
    if (dto.image !== undefined) data.imageUrl = dto.image
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber
    if (dto.serial_number !== undefined) data.serialNumber = dto.serial_number
    return data
  }
}
