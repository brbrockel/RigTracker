/**
 * Moves each rig's container, main, reserve and AAD from the rig's own text columns (the 1.x
 * model) into gear rows in the rig's slots (gear.slot), and tidies gear types. Safe to re-run:
 * a slot that's already filled is left alone, so a second run changes nothing.
 *
 *   node dist/scripts/rig-components.js           dry run: the plan for each rig, and a summary
 *   node dist/scripts/rig-components.js --apply   does it, in one transaction
 *
 * Reads DATABASE_URL (or DATABASE_URL_FILE). The rig columns themselves are left as they are;
 * a later release drops them.
 *
 * For each rig (by number) and slot with anything in it (model or size, serial, date made;
 * '', 'N/A' and '-' count as empty; a reserve serial missing from its column is taken from the
 * custom field 'Reserve Serial Number', which the old spreadsheet import filled instead):
 * 1. gear with the same serial (ignoring case and spaces) is used: unassigned, with a person or
 *    already on this rig, it goes into the slot (with the rig's primary person, as the API
 *    does), and an empty date made is filled from the rig's. Gear on another rig, or in another
 *    of this rig's slots, is a conflict: it isn't moved, and the rig's text is kept in the rig's
 *    custom fields as "Unplaced <slot>".
 * 2. otherwise new gear is made: named after the model or size, typed Container, Main, Reserve
 *    or AAD, with the serial and date made, in the slot.
 * Gear types are trimmed and case variants unified to the most common spelling ('Aad' → 'AAD').
 */
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb, createPool, type Database, type Executor } from '../db/db.js';
import {
  RIG_SLOTS,
  auditLog,
  gear,
  people,
  rigs,
  type CustomFields,
  type Gear,
  type RigSlot,
} from '../db/schema.js';

export const SLOT_TYPES: Record<RigSlot, string> = {
  container: 'Container',
  main: 'Main',
  reserve: 'Reserve',
  aad: 'AAD',
};
const RESERVE_SERIAL_FIELD = 'Reserve Serial Number';
const PRIMARY_USER_FIELD = 'Primary User';
const unplacedField = (slot: RigSlot) => `Unplaced ${slot === 'aad' ? 'AAD' : slot}`;

export interface ComponentsReport {
  /** One row per rig: what happens to each slot. */
  plan: Array<{ rig: string } & Record<RigSlot, string>>;
  matched: number;
  created: number;
  /** Slots already filled (from an earlier run, or set in the app). */
  alreadyDone: number;
  conflicts: string[];
  /** Matched gear whose empty date made was filled from the rig's. */
  datesFilled: number;
  dateDifferences: string[];
  /** e.g. "'Aad' → 'AAD' (10)". */
  typesNormalised: string[];
  suggestions: string[];
  notes: string[];
  applied: boolean;
}

/** '' / 'N/A' / 'n/a' / '-' and whitespace are empty. */
export function clean(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  return s === '' || /^(n\/a|-)$/i.test(s) ? null : s;
}
/** Serials compare ignoring case and whitespace. */
const serialKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();
/** Type spellings compare ignoring case and extra whitespace. */
const typeKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

class DryRun extends Error {}

export async function moveRigComponents(opts: {
  db: Database;
  apply: boolean;
  log?: (line: string) => void;
}): Promise<ComponentsReport> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const report: ComponentsReport = {
    plan: [],
    matched: 0,
    created: 0,
    alreadyDone: 0,
    conflicts: [],
    datesFilled: 0,
    dateDifferences: [],
    typesNormalised: [],
    suggestions: [],
    notes: [],
    applied: false,
  };
  // The dry run does everything in the transaction too, then rolls it back: it reports exactly
  // what --apply would do.
  try {
    await opts.db.transaction(async (tx) => {
      await normaliseTypes(tx, report);
      await moveComponents(tx, report);
      if (!opts.apply) throw new DryRun();
      // One summary entry in the Activity log, when something actually changed.
      if (report.matched || report.created || report.datesFilled || report.typesNormalised.length) {
        await tx.insert(auditLog).values({
          action: 'UPDATE',
          resource: 'rigs',
          resourceId: 'all',
          resourceName: 'Rig components moved into gear',
          details: {
            via: 'command line',
            matched: report.matched,
            created: report.created,
            conflicts: report.conflicts.length,
            datesFilled: report.datesFilled,
            typesNormalised: report.typesNormalised.length,
          },
        });
      }
    });
    report.applied = true;
  } catch (err) {
    if (!(err instanceof DryRun)) throw err;
  }
  printReport(report, log, opts.apply);
  return report;
}

async function normaliseTypes(tx: Executor, report: ComponentsReport) {
  const rows = await tx.select({ type: gear.type }).from(gear);
  // key → spelling (trimmed, single spaces) → count
  const groups = new Map<string, Map<string, number>>();
  const raw = new Map<string, Set<string>>();
  for (const { type } of rows) {
    if (type == null) continue;
    const key = typeKey(type);
    if (!key) continue;
    const spelling = type.trim().replace(/\s+/g, ' ');
    const g = groups.get(key) ?? new Map<string, number>();
    g.set(spelling, (g.get(spelling) ?? 0) + 1);
    groups.set(key, g);
    raw.set(key, (raw.get(key) ?? new Set()).add(type));
  }
  const slotTypes = new Map(Object.values(SLOT_TYPES).map((t) => [t.toLowerCase(), t]));
  for (const [key, spellings] of groups) {
    const canonical =
      slotTypes.get(key) ??
      [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    for (const variant of raw.get(key)!) {
      if (variant === canonical) continue;
      const changed = await tx
        .update(gear)
        .set({ type: canonical })
        .where(eq(gear.type, variant))
        .returning({ id: gear.id });
      report.typesNormalised.push(`'${variant}' → '${canonical}' (${changed.length})`);
    }
  }
  // Plurals are probably the same thing, but that's for a person to decide.
  for (const key of groups.keys())
    if (groups.has(`${key}s`)) {
      const name = (k: string) => [...groups.get(k)!.keys()][0];
      report.suggestions.push(
        `Gear types '${name(key)}' and '${name(`${key}s`)}' may be the same; not merged.`,
      );
    }
}

async function moveComponents(tx: Executor, report: ComponentsReport) {
  const allRigs = await tx.select().from(rigs).orderBy(asc(rigs.createdAt));
  // By number (numerically), so the first rig to claim a serial gets it.
  allRigs.sort((a, b) => {
    const na = Number.parseInt(a.number ?? '', 10);
    const nb = Number.parseInt(b.number ?? '', 10);
    return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb);
  });
  const allGear = await tx.select().from(gear).orderBy(asc(gear.createdAt));
  const firstNames = new Map(
    (await tx.select({ id: people.id, firstName: people.firstName }).from(people)).map((p) => [
      p.id,
      (p.firstName ?? '').trim(),
    ]),
  );
  const bySerial = new Map<string, Gear>();
  for (const g of allGear) {
    if (!g.serialNumber || !clean(g.serialNumber)) continue;
    const key = serialKey(g.serialNumber);
    if (bySerial.has(key))
      report.notes.push(
        `Two gear have serial ${g.serialNumber.trim()}: ${bySerial.get(key)!.name ?? '?'} and ${g.name ?? '?'}; the first is used.`,
      );
    else bySerial.set(key, g);
  }
  const inSlot = (rigId: string, slot: RigSlot) =>
    allGear.find((g) => g.assignedRigId === rigId && g.slot === slot);

  for (const rig of allRigs) {
    const rigLabel = rig.number ? `Rig #${rig.number}` : `Rig ${rig.name ?? rig.id}`;
    const row = { rig: rig.number ? `#${rig.number}` : (rig.name ?? rig.id) } as {
      rig: string;
    } & Record<RigSlot, string>;
    const custom: CustomFields = { ...rig.customFields };
    const fromCustom = clean(custom[RESERVE_SERIAL_FIELD]);
    const columns: Record<RigSlot, { name: unknown; serial: unknown; dom: string | null }> = {
      container: { name: rig.container, serial: rig.containerSerialNumber, dom: rig.containerDOM },
      main: { name: rig.mainSize, serial: rig.mainSerialNumber, dom: rig.mainDOM },
      reserve: {
        name: rig.reserveSize,
        serial: clean(rig.reserveSerialNumber) ?? fromCustom,
        dom: rig.reserveDOM,
      },
      aad: { name: rig.aadType, serial: rig.aadSerialNumber, dom: rig.aadDOM },
    };
    if (fromCustom && clean(rig.reserveSerialNumber)) {
      if (serialKey(fromCustom) === serialKey(clean(rig.reserveSerialNumber)!))
        delete custom[RESERVE_SERIAL_FIELD];
      else
        report.notes.push(
          `${rigLabel}: custom field '${RESERVE_SERIAL_FIELD}' (${fromCustom}) differs from the reserve serial; left as it is.`,
        );
    } else if (fromCustom) delete custom[RESERVE_SERIAL_FIELD];
    // An empty copy of the field (the spreadsheet had no reserve serial) says nothing.
    else if (RESERVE_SERIAL_FIELD in custom) delete custom[RESERVE_SERIAL_FIELD];
    // The spreadsheet's 'Primary User' text, where it just repeats the rig's primary person.
    const primaryText = clean(custom[PRIMARY_USER_FIELD]);
    const primary = rig.primaryUserId ? firstNames.get(rig.primaryUserId) : undefined;
    if (primaryText && primary && primaryText.toLowerCase() === primary.toLowerCase()) {
      delete custom[PRIMARY_USER_FIELD];
      report.notes.push(
        `${rigLabel}: removed custom field '${PRIMARY_USER_FIELD}' (${primaryText}), the same as the primary person.`,
      );
    } else if (PRIMARY_USER_FIELD in custom && !primaryText) delete custom[PRIMARY_USER_FIELD];

    for (const slot of RIG_SLOTS) {
      const c = columns[slot];
      const name = clean(c.name);
      const serial = clean(c.serial);
      const dom = c.dom;
      const what = `${rigLabel} ${SLOT_TYPES[slot].toLowerCase()}`;
      if (!name && !serial && !dom) {
        row[slot] = '-';
        continue;
      }

      const filled = inSlot(rig.id, slot);
      if (filled) {
        report.alreadyDone++;
        row[slot] = 'already';
        if (
          serial &&
          (!filled.serialNumber || serialKey(filled.serialNumber) !== serialKey(serial))
        )
          report.notes.push(
            `${what}: the rig says serial ${serial}, but the gear in that slot is ${filled.name ?? '?'} ${filled.serialNumber ? `#${filled.serialNumber}` : '(no serial)'}; left as it is.`,
          );
        continue;
      }

      const match = serial ? bySerial.get(serialKey(serial)) : undefined;
      if (match) {
        const elsewhere =
          (match.assignedRigId && match.assignedRigId !== rig.id) ||
          (match.assignedRigId === rig.id && match.slot && match.slot !== slot);
        if (elsewhere) {
          const where =
            match.assignedRigId === rig.id
              ? `this rig's ${match.slot}`
              : rigName(allRigs, match.assignedRigId!) +
                (match.slot ? `'s ${SLOT_TYPES[match.slot].toLowerCase()}` : '');
          const text = [String(c.name ?? '').trim(), `#${serial}`, dom ? `made ${dom}` : '']
            .filter(Boolean)
            .join(' ');
          report.conflicts.push(
            `${what}: gear #${serial} (${match.name ?? '?'}) is on ${where}; not moved. Kept as custom field '${unplacedField(slot)}': ${text}`,
          );
          custom[unplacedField(slot)] = text;
          row[slot] = `CONFLICT #${serial}`;
          continue;
        }
        const changes: Partial<typeof gear.$inferInsert> = {
          assignedRigId: rig.id,
          slot,
          assignedPersonId: rig.primaryUserId,
        };
        if (!clean(match.type)) changes.type = SLOT_TYPES[slot];
        if (dom && !match.dateOfManufacture) {
          changes.dateOfManufacture = dom;
          report.datesFilled++;
        } else if (dom && match.dateOfManufacture !== dom)
          report.dateDifferences.push(
            `${what} #${serial}: gear made ${match.dateOfManufacture}, rig says ${dom}; kept the gear's.`,
          );
        if (match.assignedPersonId && match.assignedPersonId !== rig.primaryUserId)
          report.notes.push(
            `${what} #${serial}: was with a person; now goes with the rig's primary person${rig.primaryUserId ? '' : ' (none)'}.`,
          );
        const [updated] = await tx
          .update(gear)
          .set(changes)
          .where(eq(gear.id, match.id))
          .returning();
        Object.assign(match, updated);
        report.matched++;
        row[slot] = `match #${serial}`;
        continue;
      }

      const [createdGear] = await tx
        .insert(gear)
        .values({
          name: name ?? SLOT_TYPES[slot],
          type: SLOT_TYPES[slot],
          serialNumber: serial,
          dateOfManufacture: dom,
          assignedRigId: rig.id,
          assignedPersonId: rig.primaryUserId,
          slot,
        })
        .returning();
      allGear.push(createdGear!);
      if (serial) bySerial.set(serialKey(serial), createdGear!);
      report.created++;
      row[slot] = `new ${name ?? SLOT_TYPES[slot]}${serial ? ` #${serial}` : ''}`;
    }

    if (JSON.stringify(custom) !== JSON.stringify(rig.customFields))
      await tx.update(rigs).set({ customFields: custom }).where(eq(rigs.id, rig.id));
    report.plan.push(row);
  }
}

function rigName(
  all: Array<{ id: string; number: string | null; name: string | null }>,
  id: string,
) {
  const r = all.find((x) => x.id === id);
  return r?.number ? `Rig #${r.number}` : `rig ${r?.name ?? id}`;
}

function printReport(report: ComponentsReport, log: (line: string) => void, apply: boolean) {
  log(
    report.applied
      ? 'Applied'
      : apply
        ? 'Not applied'
        : 'Dry run: nothing written (run again with --apply to do it)',
  );
  const header = ['rig', ...RIG_SLOTS];
  const rows = report.plan.map((r) => [r.rig, ...RIG_SLOTS.map((s) => r[s])]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]!))
      .join('  ')
      .trimEnd();
  log(line(header));
  for (const r of rows) log(line(r));
  for (const c of report.conflicts) log(`CONFLICT: ${c}`);
  for (const d of report.dateDifferences) log(`date differs: ${d}`);
  for (const n of report.notes) log(`note: ${n}`);
  for (const s of report.suggestions) log(`suggestion: ${s}`);
  for (const t of report.typesNormalised) log(`type: ${t}`);
  log(
    `Summary: ${report.matched} gear matched by serial, ${report.created} created, ` +
      `${report.alreadyDone} already in place, ${report.conflicts.length} conflicts, ` +
      `${report.datesFilled} dates filled, ${report.dateDifferences.length} dates differ, ` +
      `${report.typesNormalised.length} type spellings normalised.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const pool = createPool(loadConfig().DATABASE_URL);
  moveRigComponents({ db: createDb(pool), apply })
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(apply ? 'Rolled back, nothing written:' : 'Failed:', err);
      await pool.end().catch(() => undefined);
      process.exit(1);
    });
}
