import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rig, RigDocument } from './rig.schema'
import { Person } from '../people/person.schema'
import { Gear } from '../gear/gear.schema'

type AnyModel = Model<any>

@Injectable()
export class RigsService {
  constructor(
    @InjectModel(Rig.name) private rigModel: Model<RigDocument>,
    @InjectModel(Person.name) private personModel: AnyModel,
    @InjectModel(Gear.name) private gearModel: AnyModel,
  ) {}

  async create(dto: any) {
    const created = new this.rigModel(dto)
    return created.save()
  }

  async findAll() {
    const rigs = await this.rigModel.find().lean() as any[]
    const ids = Array.from(new Set(rigs.map((r: any) => r.primaryUserId).filter(Boolean)))
    const people = ids.length ? await this.personModel.find({ _id: { $in: ids } }).lean() as any[] : []
    const pMap: Record<string,string> = {}
    people.forEach((p: any) => {
      const display = (p.displayName && String((p as any).displayName).trim()) || [p.firstName, p.middleName, p.lastName].filter(Boolean).map((s:string)=>String(s).trim()).join(' ').trim()
      pMap[String(p._id || p.id)] = display
    })
    return rigs.map((r: any) => ({ ...(r as any), primaryUserName: pMap[String(r.primaryUserId)] || '' }))
  }

  async findOne(id: string) {
    const r = await this.rigModel.findById(id).lean() as any
    if (!r) throw new NotFoundException('Rig not found')
    if (r.primaryUserId) {
      const p = await this.personModel.findById(r.primaryUserId).lean() as any
      if (p) {
        r.primaryUserName = (p.displayName && String((p as any).displayName).trim()) || [p.firstName, p.middleName, p.lastName].filter(Boolean).map((s:string)=>String(s).trim()).join(' ').trim()
      } else {
        r.primaryUserName = ''
      }
    }
    return r
  }

  async update(id: string, dto: any) {
    const existing = await this.rigModel.findById(id).lean() as any
    if (!existing) throw new NotFoundException('Rig not found')

    const updated = await this.rigModel.findByIdAndUpdate(id, dto, { new: true }).lean()
    if (!updated) throw new NotFoundException('Rig not found')

    if (dto.primaryUserId !== undefined) {
      const normalizedPrimaryUserId = dto.primaryUserId ? String(dto.primaryUserId).trim() : null
      await this.gearModel.updateMany(
        { assignedRigId: id },
        { $set: { assignedPersonId: normalizedPrimaryUserId || null } },
      )
    }

    return updated
  }

  async remove(id: string) {
    const res = await this.rigModel.findByIdAndDelete(id).lean()
    if (!res) throw new NotFoundException('Rig not found')
    await this.gearModel.updateMany(
      { assignedRigId: id },
      { $set: { assignedRigId: null, assignedPersonId: null } },
    )
    return { deleted: true }
  }
}
