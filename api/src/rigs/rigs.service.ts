import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Rig, RigDocument } from './rig.schema'

@Injectable()
export class RigsService {
  constructor(@InjectModel(Rig.name) private rigModel: Model<RigDocument>) {}

  async create(dto: any) {
    const created = new this.rigModel(dto)
    return created.save()
  }

  async findAll() {
    return this.rigModel.find().lean()
  }

  async findOne(id: string) {
    const r = await this.rigModel.findById(id).lean()
    if (!r) throw new NotFoundException('Rig not found')
    return r
  }

  async update(id: string, dto: any) {
    const updated = await this.rigModel.findByIdAndUpdate(id, dto, { new: true }).lean()
    if (!updated) throw new NotFoundException('Rig not found')
    return updated
  }

  async remove(id: string) {
    const res = await this.rigModel.findByIdAndDelete(id).lean()
    if (!res) throw new NotFoundException('Rig not found')
    return { deleted: true }
  }
}
