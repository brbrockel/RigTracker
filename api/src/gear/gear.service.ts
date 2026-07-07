import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Gear, GearDocument } from './gear.schema'
import { Rig } from '../rigs/rig.schema'
import { Person } from '../people/person.schema'

type AnyModel = Model<any>

@Injectable()
export class GearService {
  constructor(
    @InjectModel(Gear.name) private gearModel: Model<GearDocument>,
    @InjectModel(Rig.name) private rigModel: AnyModel,
    @InjectModel(Person.name) private personModel: AnyModel,
  ) {}

  async findAll(filters?: { rigId?: string; personId?: string; unassigned?: string }) {
    const query: any = {}
    if (filters?.rigId) query.assignedRigId = filters.rigId
    if (filters?.personId) query.assignedPersonId = filters.personId
    if (filters?.unassigned === 'true') {
      query.$and = [
        { $or: [{ assignedRigId: null }, { assignedRigId: { $exists: false } }, { assignedRigId: '' }] },
        { $or: [{ assignedPersonId: null }, { assignedPersonId: { $exists: false } }, { assignedPersonId: '' }] },
      ]
    }
    return this.gearModel.find(query).lean()
  }

  async findOne(id: string) {
    const gear = await this.gearModel.findById(id).lean()
    if (!gear) throw new NotFoundException('Gear not found')
    return gear
  }

  async create(dto: any) {
    const normalized = await this.normalizeAssignment(undefined, this.mapDto(dto), dto)
    const created = new this.gearModel(normalized)
    return created.save()
  }

  async update(id: string, dto: any) {
    const current = await this.gearModel.findById(id).lean()
    if (!current) throw new NotFoundException('Gear not found')
    const normalized = await this.normalizeAssignment(current, this.mapDto(dto), dto)
    const updated = await this.gearModel.findByIdAndUpdate(id, normalized, { new: true }).lean()
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
    if (dto.assignedRigId !== undefined) data.assignedRigId = dto.assignedRigId
    if (dto.assigned_rig_id !== undefined) data.assignedRigId = dto.assigned_rig_id
    if (dto.assignedPersonId !== undefined) data.assignedPersonId = dto.assignedPersonId
    if (dto.assigned_person_id !== undefined) data.assignedPersonId = dto.assigned_person_id
    return data
  }

  private normalizeId(value: any): string | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null
    const normalized = String(value).trim()
    return normalized ? normalized : null
  }

  private async normalizeAssignment(existing: any | undefined, mapped: any, rawDto: any) {
    const next: any = { ...mapped }
    const existingRigId = this.normalizeId(existing?.assignedRigId) ?? null
    const existingPersonId = this.normalizeId(existing?.assignedPersonId) ?? null

    const hasAssignedRigField = rawDto?.assignedRigId !== undefined || rawDto?.assigned_rig_id !== undefined
    const hasAssignedPersonField = rawDto?.assignedPersonId !== undefined || rawDto?.assigned_person_id !== undefined

    const requestedRigId = this.normalizeId(next.assignedRigId)
    const requestedPersonId = this.normalizeId(next.assignedPersonId)

    const effectiveRigId = hasAssignedRigField ? requestedRigId : existingRigId

    if (effectiveRigId) {
      const rig = await this.rigModel.findById(effectiveRigId).lean() as any
      if (!rig) throw new BadRequestException('Assigned rig not found')
      next.assignedRigId = effectiveRigId
      next.assignedPersonId = this.normalizeId(rig.primaryUserId) ?? null
      return next
    }

    if (hasAssignedRigField) {
      next.assignedRigId = null
      if (!hasAssignedPersonField) {
        next.assignedPersonId = null
        return next
      }
    }

    const effectivePersonId = hasAssignedPersonField ? requestedPersonId : existingPersonId
    if (hasAssignedPersonField) {
      next.assignedPersonId = requestedPersonId
    }

    if (effectivePersonId) {
      const person = await this.personModel.findById(effectivePersonId).lean() as any
      if (!person) throw new BadRequestException('Assigned person not found')
      next.assignedPersonId = effectivePersonId
      if (hasAssignedRigField) {
        next.assignedRigId = null
      }
      return next
    }

    if (hasAssignedPersonField) {
      next.assignedPersonId = null
    }

    return next
  }
}
