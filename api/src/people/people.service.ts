import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PERSON_PROFILE_FIELDS, Person, PersonDocument } from './person.schema';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import isEmail from 'validator/lib/isEmail';

@Injectable()
export class PeopleService {
  constructor(@InjectModel(Person.name) private personModel: Model<PersonDocument>) {}

  /** Only profile fields, validated; sign-in fields (roles etc.) can't be set this way. */
  private profile(dto: any): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of PERSON_PROFILE_FIELDS) {
      if (dto && Object.prototype.hasOwnProperty.call(dto, key)) out[key] = dto[key];
    }
    if (out.email) {
      const e = String(out.email).trim().toLowerCase();
      if (!isEmail(e)) throw new BadRequestException('Invalid email');
      out.email = e;
    }
    if (out.phone) {
      const pn = parsePhoneNumberFromString(String(out.phone), dto.country || 'US');
      if (!pn || !pn.isValid()) throw new BadRequestException('Invalid phone');
      out.phone = pn.format('E.164');
    }
    return out;
  }

  /** Someone who signs in needs an email address no one else who signs in uses. */
  private async checkSignInEmail(id: string, email: unknown) {
    const person = await this.personModel.findById(id).lean();
    if (!person) throw new NotFoundException('Person not found');
    if (!person.roles?.length) return;
    const e = typeof email === 'string' ? email : '';
    if (!e) throw new BadRequestException('This person signs in, so they need an email address');
    const other = await this.personModel
      .findOne({ _id: { $ne: id }, email: e, 'roles.0': { $exists: true } })
      .lean();
    if (other) throw new ConflictException('Another person who signs in already uses that email');
  }

  async create(dto: any) {
    const created = new this.personModel(this.profile(dto));
    return created.save();
  }

  async findAll() {
    return this.personModel.find().lean();
  }

  async findOne(id: string) {
    const p = await this.personModel.findById(id).lean();
    if (!p) throw new NotFoundException('Person not found');
    return p;
  }

  async update(id: string, dto: any) {
    const changes = this.profile(dto);
    if ('email' in changes) await this.checkSignInEmail(id, changes.email);
    const updated = await this.personModel
      .findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new NotFoundException('Person not found');
    return updated;
  }

  async remove(id: string) {
    const res = await this.personModel.findByIdAndDelete(id).lean();
    if (!res) throw new NotFoundException('Person not found');
    // Nothing keeps pointing at someone who's gone.
    const db = this.personModel.db;
    await db
      .collection('rigs')
      .updateMany({ primaryUserId: id }, { $set: { primaryUserId: null } });
    await db
      .collection('gear')
      .updateMany({ assignedPersonId: id }, { $set: { assignedPersonId: null } });
    return { deleted: true };
  }
}
