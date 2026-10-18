import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, inArray, isNotNull } from 'drizzle-orm';
import { DB, type Database, type Executor } from '../db/db.js';
import { RIG_SLOTS, gear, people, rigs, type Rig, type RigSlot } from '../db/schema.js';
import { defined } from '../common/validation.js';
import { omit } from '../common/omit.js';
import { fullName } from '../people/person-view.js';
import type { RigBody } from './rig.dto.js';

/** The 1.x component columns, kept until production is moved (scripts/rig-components.ts). */
const OLD_COMPONENT_COLUMNS = [
  'container',
  'containerSerialNumber',
  'containerDOM',
  'mainSize',
  'mainDOM',
  'mainSerialNumber',
  'reserveSize',
  'reserveDOM',
  'reserveSerialNumber',
  'aadType',
  'aadDOM',
  'aadSerialNumber',
] as const;

/** A rig's own fields as the API returns them (and the audit log records them). */
export function rigToApi(rig: Rig) {
  return omit(rig, 'legacyId', ...OLD_COMPONENT_COLUMNS);
}

const rigColumns = omit(getTableColumns(rigs), 'legacyId', ...OLD_COMPONENT_COLUMNS);

const componentColumns = {
  rigId: gear.assignedRigId,
  slot: gear.slot,
  id: gear.id,
  name: gear.name,
  type: gear.type,
  serialNumber: gear.serialNumber,
  dateOfManufacture: gear.dateOfManufacture,
  imageUrl: gear.imageUrl,
};
export type RigComponent = {
  id: string;
  name: string | null;
  type: string | null;
  serialNumber: string | null;
  dateOfManufacture: string | null;
  imageUrl: string | null;
};
export type RigComponents = Record<RigSlot, RigComponent | null>;

const emptyComponents = (): RigComponents =>
  Object.fromEntries(RIG_SLOTS.map((s) => [s, null])) as RigComponents;
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

  /** The gear in each rig's slots, by rig id (every slot present, null when empty). */
  private async components(rigIds: string[]): Promise<Map<string, RigComponents>> {
    const byRig = new Map<string, RigComponents>(rigIds.map((id) => [id, emptyComponents()]));
    if (!rigIds.length) return byRig;
    const rows = await this.db
      .select(componentColumns)
      .from(gear)
      .where(and(inArray(gear.assignedRigId, rigIds), isNotNull(gear.slot)));
    for (const { rigId, slot, ...component } of rows) byRig.get(rigId!)![slot!] = component;
    return byRig;
  }

  async componentsOf(rigId: string): Promise<RigComponents> {
    return (await this.components([rigId])).get(rigId)!;
  }

  async create(dto: RigBody) {
    await this.checkPerson(dto.primaryUserId);
    const [created] = await this.db.insert(rigs).values(defined(dto)).returning();
    return { ...rigToApi(created!), components: emptyComponents() };
  }

  /** Every rig, with its primary person's name ('' when none) and its components. */
  async findAll() {
    const rows = await this.db
      .select({ rig: rigColumns, person: personNameColumns })
      .from(rigs)
      .leftJoin(people, eq(people.id, rigs.primaryUserId))
      .orderBy(asc(rigs.createdAt));
    const components = await this.components(rows.map((r) => r.rig.id));
    return rows.map(({ rig, person }) => ({
      ...rig,
      primaryUserName: person ? fullName(person) : '',
      components: components.get(rig.id)!,
    }));
  }

  async findOne(id: string) {
    const [row] = await this.db
      .select({ rig: rigColumns, person: personNameColumns })
      .from(rigs)
      .leftJoin(people, eq(people.id, rigs.primaryUserId))
      .where(eq(rigs.id, id));
    if (!row) throw new NotFoundException('Rig not found');
    const components = (await this.components([id])).get(id)!;
    return row.rig.primaryUserId
      ? { ...row.rig, primaryUserName: row.person ? fullName(row.person) : '', components }
      : { ...row.rig, components };
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

  /** Its gear (components too) comes off the rig and off the rig's person. */
  async remove(id: string) {
    return this.db.transaction(async (tx) => {
      // The foreign key would clear gear.rig_id by itself; the person goes with the rig too.
      await tx
        .update(gear)
        .set({ assignedRigId: null, assignedPersonId: null, slot: null })
        .where(eq(gear.assignedRigId, id));
      const deleted = await tx.delete(rigs).where(eq(rigs.id, id)).returning({ id: rigs.id });
      if (!deleted.length) throw new NotFoundException('Rig not found');
      return { deleted: true };
    });
  }
}
