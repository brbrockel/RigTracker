import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Person, PersonDocument } from './person.schema'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import isEmail from 'validator/lib/isEmail'

@Injectable()
export class PeopleService {
  constructor(@InjectModel(Person.name) private personModel: Model<PersonDocument>) {}

  async create(dto: any) {
    // validate / normalize
    if (dto.email) {
      const e = String(dto.email).trim().toLowerCase()
      if (!isEmail(e)) throw new BadRequestException('Invalid email')
      dto.email = e
    }
    if (dto.phone) {
      const pn = parsePhoneNumberFromString(String(dto.phone), dto.country || 'US')
      if (!pn || !pn.isValid()) throw new BadRequestException('Invalid phone')
      dto.phone = pn.format('E.164')
    }
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
    // validate / normalize
    if (dto.email) {
      const e = String(dto.email).trim().toLowerCase()
      if (!isEmail(e)) throw new BadRequestException('Invalid email')
      dto.email = e
    }
    if (dto.phone) {
      const pn = parsePhoneNumberFromString(String(dto.phone), dto.country || 'US')
      if (!pn || !pn.isValid()) throw new BadRequestException('Invalid phone')
      dto.phone = pn.format('E.164')
    }
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
