import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Person, PersonDocument } from './person.schema'

@Injectable()
export class PeopleService {
  constructor(@InjectModel(Person.name) private personModel: Model<PersonDocument>) {}

  async create(dto: any) {
    const created = new this.personModel(dto)
    return created.save()
  }

  async findAll() {
    return this.personModel.find().lean()
  }

  async findOne(id: string) {
    const p = await this.personModel.findById(id).lean()
    if (!p) throw new NotFoundException('Person not found')
    return p
  }

  async update(id: string, dto: any) {
    const updated = await this.personModel.findByIdAndUpdate(id, dto, { new: true }).lean()
    if (!updated) throw new NotFoundException('Person not found')
    return updated
  }

  async remove(id: string) {
    const res = await this.personModel.findByIdAndDelete(id).lean()
    if (!res) throw new NotFoundException('Person not found')
    return { deleted: true }
  }
}
