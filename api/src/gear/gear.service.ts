import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/db.js';
import { gear, people, rigs, type Gear, type RigSlot } from '../db/schema.js';
import { defined } from '../common/validation.js';
import { omit } from '../common/omit.js';
import type { GearBody } from './gear.dto.js';

/** Gear as the API returns it: no serialNumber key when it has none. */
export function gearToApi(row: Gear) {
  const rest = omit(row, 'legacyId', 'serialNumber');
  return row.serialNumber == null ? rest : { ...rest, serialNumber: row.serialNumber };
}

type GearChanges = Partial<typeof gear.$inferInsert>;

export const SLOT_LABELS: Record<RigSlot, string> = {
  container: 'container',
  main: 'main',
  reserve: 'reserve',
  aad: 'AAD',
};

@Injectable()
export class GearService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findAll(filters?: { rigId?: string; personId?: string; unassigned?: string }) {
    const where: SQL[] = [];
    if (filters?.rigId) where.push(eq(gear.assignedRigId, filters.rigId));
    if (filters?.personId) where.push(eq(gear.assignedPersonId, filters.personId));
    if (filters?.unassigned === 'true')
      where.push(isNull(gear.assignedRigId), isNull(gear.assignedPersonId));
    const rows = await this.db
      .select()
      .from(gear)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(gear.createdAt));
    return rows.map(gearToApi);
  }

  private async get(id: string) {
    const [row] = await this.db.select().from(gear).where(eq(gear.id, id));
    if (!row) throw new NotFoundException('Gear not found');
    return row;
  }

  async findOne(id: string) {
    return gearToApi(await this.get(id));
  }

  async create(dto: GearBody) {
    const values = await this.normalizeAssignment(undefined, defined(dto), dto);
    const [created] = await this.db.insert(gear).values(values).returning();
    return gearToApi(created!);
  }

  /** Returns the gear before and after (for the audit log). */
  async update(id: string, dto: GearBody) {
    const current = await this.get(id);
    const changes = await this.normalizeAssignment(current, defined(dto), dto);
    const [updated] = Object.keys(changes).length
      ? await this.db.update(gear).set(changes).where(eq(gear.id, id)).returning()
      : [current];
    if (!updated) throw new NotFoundException('Gear not found');
    return { before: gearToApi(current), after: gearToApi(updated) };
  }

  async remove(id: string) {
    const deleted = await this.db.delete(gear).where(eq(gear.id, id)).returning({ id: gear.id });
    if (!deleted.length) throw new NotFoundException('Gear not found');
    return { ok: true };
  }

  /**
   * Where gear goes (see normalizeRigAndPerson), then its slot: only gear on a rig has one (a
   * slot without a rig is 400); off its rig, or moved to another rig without a slot sent, it
   * has none; a slot another gear on that rig already fills is 409.
   */
  private async normalizeAssignment(
    existing: Gear | undefined,
    mapped: GearChanges,
    rawDto: GearBody,
  ): Promise<GearChanges> {
    const next = await this.normalizeRigAndPerson(existing, mapped, rawDto);
    const rigId = next.assignedRigId !== undefined ? next.assignedRigId : existing?.assignedRigId;
    const rigChanged = (rigId ?? null) !== (existing?.assignedRigId ?? null);
    const slot = rawDto.slot !== undefined ? rawDto.slot : rigChanged ? null : existing?.slot;

    if (!rigId) {
      if (rawDto.slot)
        throw new BadRequestException('Only gear on a rig can be one of its components');
      if (existing?.slot || rawDto.slot !== undefined) next.slot = null;
      return next;
    }
    if (rawDto.slot !== undefined || rigChanged) next.slot = slot ?? null;
    if (slot) {
      const taken = await this.db
        .select({ id: gear.id })
        .from(gear)
        .where(
          and(
            eq(gear.assignedRigId, rigId),
            eq(gear.slot, slot),
            existing ? ne(gear.id, existing.id) : undefined,
          ),
        );
      if (taken.length) {
        const [rig] = await this.db
          .select({ number: rigs.number, name: rigs.name })
          .from(rigs)
          .where(eq(rigs.id, rigId));
        const which = rig?.number ? `Rig #${rig.number}` : rig?.name ? rig.name : 'That rig';
        throw new ConflictException(
          `${which} already has ${slot === 'aad' ? 'an' : 'a'} ${SLOT_LABELS[slot]}`,
        );
      }
    }
    return next;
  }

  private normalizeId(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  /**
   * Where gear goes: on a rig, it goes with the rig's primary person (a person sent alongside
   * is ignored); taken off a rig without a person, it has none; given a person, it comes off
   * its rig. A rig or person that doesn't exist is 400.
   */
  private async normalizeRigAndPerson(
    existing: Gear | undefined,
    mapped: GearChanges,
    rawDto: GearBody,
  ): Promise<GearChanges> {
    const next: GearChanges = { ...mapped };
    const existingRigId = this.normalizeId(existing?.assignedRigId) ?? null;
    const existingPersonId = this.normalizeId(existing?.assignedPersonId) ?? null;

    const hasAssignedRigField = rawDto?.assignedRigId !== undefined;
    const hasAssignedPersonField = rawDto?.assignedPersonId !== undefined;

    const requestedRigId = this.normalizeId(next.assignedRigId);
    const requestedPersonId = this.normalizeId(next.assignedPersonId);

    const effectiveRigId = hasAssignedRigField ? requestedRigId : existingRigId;

    if (effectiveRigId) {
      const [rig] = await this.db
        .select({ primaryUserId: rigs.primaryUserId })
        .from(rigs)
        .where(eq(rigs.id, effectiveRigId));
      if (rig) {
        // On a rig, the gear goes with the rig's primary person.
        next.assignedRigId = effectiveRigId;
        next.assignedPersonId = this.normalizeId(rig.primaryUserId) ?? null;
        return next;
      }
      if (hasAssignedRigField) throw new BadRequestException('Assigned rig not found');
      // Its rig is gone (with foreign keys this can't happen, but stay safe): the gear is no
      // longer on a rig, and stays editable.
      next.assignedRigId = null;
      if (!hasAssignedPersonField) return next;
    }

    if (hasAssignedRigField) {
      next.assignedRigId = null;
      if (!hasAssignedPersonField) {
        next.assignedPersonId = null;
        return next;
      }
    }

    const effectivePersonId = hasAssignedPersonField ? requestedPersonId : existingPersonId;
    if (hasAssignedPersonField) {
      next.assignedPersonId = requestedPersonId;
    }

    if (effectivePersonId) {
      const [person] = await this.db
        .select({ id: people.id })
        .from(people)
        .where(eq(people.id, effectivePersonId));
      if (!person) throw new BadRequestException('Assigned person not found');
      next.assignedPersonId = effectivePersonId;
      if (hasAssignedRigField) {
        next.assignedRigId = null;
      }
      return next;
    }

    if (hasAssignedPersonField) {
      next.assignedPersonId = null;
    }

    return next;
  }
}
