import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

/** What Postgres reports (node-postgres DatabaseError fields); drizzle wraps it as `cause`. */
interface PgError {
  code?: string;
  constraint?: string;
}

/** The Postgres error behind an error, if there is one. */
export function pgError(err: unknown): PgError | undefined {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; i++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e as PgError;
    e = e.cause as typeof e;
  }
  return undefined;
}

const UNIQUE_MESSAGES: Record<string, string> = {
  gear_serial_number_unique: 'That serial number is already in use',
  people_sign_in_email_unique: 'Another person who signs in already uses that email',
};

const MISSING_REFERENCE: Record<string, string> = {
  rigs_primary_person_id_people_id_fk: 'Primary person not found',
  gear_rig_id_rigs_id_fk: 'Assigned rig not found',
  gear_person_id_people_id_fk: 'Assigned person not found',
  sessions_person_id_people_id_fk: 'Person not found',
  sign_in_links_person_id_people_id_fk: 'Person not found',
};

/**
 * Turns database errors a request caused into plain 4xx answers instead of a 500:
 * a duplicate unique value (23505) is 409; a missing referenced record (23503), or a malformed
 * id or other invalid value (22xxx), is 400. Everything else goes to Nest's normal handling.
 */
@Catch()
export class PgErrorsFilter extends BaseExceptionFilter {
  override catch(err: unknown, host: ArgumentsHost) {
    const pg = pgError(err);
    if (pg && host.getType() === 'http') {
      const res = host.switchToHttp().getResponse<Response>();
      const answer = (status: number, message: string) =>
        res.status(status).json({ statusCode: status, message });
      if (pg.code === '23505')
        return answer(
          HttpStatus.CONFLICT,
          UNIQUE_MESSAGES[pg.constraint ?? ''] ?? 'That value is already in use',
        );
      if (pg.code === '23503')
        return answer(
          HttpStatus.BAD_REQUEST,
          MISSING_REFERENCE[pg.constraint ?? ''] ?? 'A linked record was not found',
        );
      if (pg.code === '22P02') return answer(HttpStatus.BAD_REQUEST, 'Invalid id or value');
      if (pg.code?.startsWith('22') || pg.code === '23514')
        return answer(HttpStatus.BAD_REQUEST, 'Invalid data');
    }
    super.catch(err, host);
  }
}
