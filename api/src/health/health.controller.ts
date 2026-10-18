import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';

/** For the container healthcheck and for showing which release is running. */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    const version = process.env.APP_VERSION || 'dev';
    try {
      await this.connection.db?.admin().ping();
    } catch {
      throw new ServiceUnavailableException({ ok: false, version, database: 'unreachable' });
    }
    return { ok: true, version };
  }
}
