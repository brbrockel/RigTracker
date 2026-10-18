import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import validator from 'validator';
import { DB, type Database } from '../db/db.js';
import { people, type Person } from '../db/schema.js';
import { dateOnly } from '../common/validation.js';
import { personToApi } from './person-view.js';

/** Fields an ordinary create or edit may set. Sign-in fields are left out on purpose. */
export const PERSON_PROFILE_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'email',
  'phone',
  'address',
  'dob',
  'emergencyContacts',
  'customFields',
] as const;

type Profile = Partial<Pick<typeof people.$inferInsert, (typeof PERSON_PROFILE_FIELDS)[number]>>;
type Body = Record<string, unknown>;

const TEXT_FIELDS = new Set(['firstName', 'middleName', 'lastName', 'email', 'phone']);
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

@Injectable()
export class PeopleService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Only profile fields, checked; sign-in fields (roles etc.) and anything else sent are ignored.
   * Values of the wrong type (e.g. operator objects such as {"$gt": ""}) are refused.
   */
  private profile(dto: unknown): Profile {
    const body: Body = isPlainObject(dto) ? dto : {};
    const out: Record<string, unknown> = {};
    for (const key of PERSON_PROFILE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const v = body[key];
      if (TEXT_FIELDS.has(key)) {
        if (v === null || typeof v === 'string') out[key] = v;
        else if (typeof v === 'number' || typeof v === 'boolean') out[key] = String(v);
        else throw new BadRequestException(`Invalid ${key}`);
      } else if (key === 'dob') {
        if (v === null || v === '') out.dob = null;
        else {
          const d = dateOnly.safeParse(v);
          if (!d.success) throw new BadRequestException('Invalid dob: use yyyy-mm-dd');
          out.dob = d.data;
        }
      } else if (key === 'emergencyContacts') {
        if (v === null) out[key] = [];
        else if (Array.isArray(v) && v.every(isPlainObject)) out[key] = v;
        else throw new BadRequestException('Invalid emergencyContacts');
      } else {
        // address, customFields
        if (v === null) out[key] = {};
        else if (isPlainObject(v)) out[key] = v;
        else throw new BadRequestException(`Invalid ${key}`);
      }
    }
    if (out.email) {
      const e = String(out.email).trim().toLowerCase();
      if (!validator.isEmail(e)) throw new BadRequestException('Invalid email');
      out.email = e;
    } else if ('email' in out) out.email = null;
    if (out.phone) {
      const country = typeof body.country === 'string' ? body.country : 'US';
      const pn = parsePhoneNumberFromString(String(out.phone), country as CountryCode);
      if (!pn || !pn.isValid()) throw new BadRequestException('Invalid phone');
      out.phone = pn.format('E.164');
    } else if ('phone' in out) out.phone = null;
    return out as Profile;
  }

  private async get(id: string): Promise<Person> {
    const [p] = await this.db.select().from(people).where(eq(people.id, id));
    if (!p) throw new NotFoundException('Person not found');
    return p;
  }

  async create(dto: unknown) {
    const [created] = await this.db.insert(people).values(this.profile(dto)).returning();
    return personToApi(created!);
  }

  async findAll() {
    const rows = await this.db.select().from(people).orderBy(asc(people.createdAt));
    return rows.map(personToApi);
  }

  async findOne(id: string) {
    return personToApi(await this.get(id));
  }

  /** Returns the person before and after (for the audit log). */
  async update(id: string, dto: unknown) {
    const changes = this.profile(dto);
    const before = await this.get(id);
    // Someone who signs in needs an email address; the unique index (lower(email) for people
    // with a role) refuses one another person who signs in uses: 409, see PgErrorsFilter.
    if ('email' in changes && before.role && !changes.email)
      throw new BadRequestException('This person signs in, so they need an email address');
    const [after] = Object.keys(changes).length
      ? await this.db.update(people).set(changes).where(eq(people.id, id)).returning()
      : [before];
    if (!after) throw new NotFoundException('Person not found');
    return { before: personToApi(before), after: personToApi(after) };
  }

  /** Rigs and gear stop pointing at them (ON DELETE SET NULL); their sessions and links go too. */
  async remove(id: string) {
    const deleted = await this.db.delete(people).where(eq(people.id, id)).returning();
    if (!deleted.length) throw new NotFoundException('Person not found');
    return { deleted: true };
  }
}
