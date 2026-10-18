import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, getTableColumns } from 'drizzle-orm';
import { DB, type Database, type Executor } from '../db/db.js';
import { gear, people, rigs, type Rig } from '../db/schema.js';
import { defined } from '../common/validation.js';
import { omit } from '../common/omit.js';
import { fullName } from '../people/person-view.js';
import type { RigBody } from './rig.dto.js';

/** A rig as the API returns it. */
export function rigToApi(rig: Rig) {
  return omit(rig, 'legacyId');
}

const rigColumns = omit(getTableColumns(rigs), 'legacyId');
const personNameColumns = {
  firstName: people.firstName,
  middleName: people.middleName,
  lastName: people.lastName,
};

@Injectable()
export class RigsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async checkPerson(id: string | null | undefined, tx: Executor = this.db) {
    if (!id) return;
    const [p] = await tx.select({ id: people.id }).from(people).where(eq(people.id, id));
    if (!p) throw new BadRequestException('Primary person not found');
  }

  async create(dto: RigBody) {
    await this.checkPerson(dto.primaryUserId);
    const [created] = await this.db.insert(rigs).values(defined(dto)).returning();
    return rigToApi(created!);
  }

  /** Every rig, with its primary person's name ('' when none). */
  async findAll() {
    const rows = await this.db
      .select({ rig: rigColumns, person: personNameColumns })
      .from(rigs)
      .leftJoin(people, eq(people.id, rigs.primaryUserId))
      .orderBy(asc(rigs.createdAt));
    return rows.map(({ rig, person }) => ({
      ...rig,
      primaryUserName: person ? fullName(person) : '',
    }));
  }

  async findOne(id: string) {
    const [row] = await this.db
      .select({ rig: rigColumns, person: personNameColumns })
      .from(rigs)
      .leftJoin(people, eq(people.id, rigs.primaryUserId))
      .where(eq(rigs.id, id));
    if (!row) throw new NotFoundException('Rig not found');
    return row.rig.primaryUserId
      ? { ...row.rig, primaryUserName: row.person ? fullName(row.person) : '' }
      : row.rig;
  }

  /**
   * Changing the primary person moves the rig's gear to them. Returns the rig before and after
   * (for the audit log).
   */
  async update(id: string, dto: RigBody) {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(rigs).where(eq(rigs.id, id)).for('update');
      if (!before) throw new NotFoundException('Rig not found');
      await this.checkPerson(dto.primaryUserId, tx);

      const changes = defined(dto);
      const [after] = Object.keys(changes).length
        ? await tx.update(rigs).set(changes).where(eq(rigs.id, id)).returning()
        : [before];

      if (dto.primaryUserId !== undefined) {
        await tx
          .update(gear)
          .set({ assignedPersonId: dto.primaryUserId || null })
          .where(eq(gear.assignedRigId, id));
      }
      return { before: rigToApi(before), after: rigToApi(after!) };
    });
  }

  /** Its gear comes off the rig and off the rig's person. */
  async remove(id: string) {
    return this.db.transaction(async (tx) => {
      // The foreign key would clear gear.rig_id by itself; the person goes with the rig too.
      await tx
        .update(gear)
        .set({ assignedRigId: null, assignedPersonId: null })
        .where(eq(gear.assignedRigId, id));
      const deleted = await tx.delete(rigs).where(eq(rigs.id, id)).returning({ id: rigs.id });
      if (!deleted.length) throw new NotFoundException('Rig not found');
      return { deleted: true };
    });
  }
}
