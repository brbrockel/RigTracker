import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthSessionGuard } from './auth/auth-session.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { ClientIpThrottlerGuard, DEFAULT_LIMIT } from './common/throttle.js';
import { DbModule } from './db/db.module.js';
import { GearModule } from './gear/gear.module.js';
import { RigsModule } from './rigs/rigs.module.js';
import { PeopleModule } from './people/people.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { MediaModule } from './media/media.module.js';
import { EventsModule } from './events/events.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { MailModule } from './mail/mailer.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([DEFAULT_LIMIT]),
    DbModule,
    AuditModule,
    MailModule,
    GearModule,
    RigsModule,
    PeopleModule,
    UploadsModule,
    MediaModule,
    EventsModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit first, then the session (and CSRF) check, then roles.
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
