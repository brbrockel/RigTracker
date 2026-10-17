import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Gear, GearDocument } from './gear.schema'
import { Rig } from '../rigs/rig.schema'
import { Person } from '../people/person.schema'
import { defined } from '../common/validation'
import type { GearBody } from './gear.dto'

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

  async create(dto: GearBody) {
    const normalized = await this.normalizeAssignment(undefined, defined(dto), dto)
    if (!normalized.serialNumber) delete normalized.serialNumber
    const created = new this.gearModel(normalized)
    return created.save()
  }

  async update(id: string, dto: GearBody) {
    const current = await this.gearModel.findById(id).lean()
    if (!current) throw new NotFoundException('Gear not found')
    const normalized = await this.normalizeAssignment(current, defined(dto), dto)
    // A cleared serial is removed: the unique (sparse) index would treat every null as the same value.
    const unset = 'serialNumber' in normalized && !normalized.serialNumber ? { serialNumber: 1 } : undefined
    if (unset) delete normalized.serialNumber
    const updated = await this.gearModel
      .findByIdAndUpdate(id, { $set: normalized, ...(unset ? { $unset: unset } : {}) }, { new: true, runValidators: true })
      .lean()
    if (!updated) throw new NotFoundException('Gear not found')
    return updated
  }

  async remove(id: string) {
    const deleted = await this.gearModel.findByIdAndDelete(id).lean()
    if (!deleted) throw new NotFoundException('Gear not found')
    return { ok: true }
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

    const hasAssignedRigField = rawDto?.assignedRigId !== undefined
    const hasAssignedPersonField = rawDto?.assignedPersonId !== undefined

    const requestedRigId = this.normalizeId(next.assignedRigId)
    const requestedPersonId = this.normalizeId(next.assignedPersonId)

    const effectiveRigId = hasAssignedRigField ? requestedRigId : existingRigId

    if (effectiveRigId) {
      const rig = await this.rigModel.findById(effectiveRigId).lean() as any
      if (rig) {
        // On a rig, the gear goes with the rig's primary person.
        next.assignedRigId = effectiveRigId
        next.assignedPersonId = this.normalizeId(rig.primaryUserId) ?? null
        return next
      }
      if (hasAssignedRigField) throw new BadRequestException('Assigned rig not found')
      // Its rig was deleted: the gear is no longer on a rig, and stays editable.
      next.assignedRigId = null
      if (!hasAssignedPersonField) return next
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
