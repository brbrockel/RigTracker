import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthSessionGuard } from './auth/auth-session.guard';
import { RolesGuard } from './auth/roles.guard';
import { ClientIpThrottlerGuard, DEFAULT_LIMIT } from './common/throttle';
import { GearModule } from './gear/gear.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RigsModule } from './rigs/rigs.module';
import { PeopleModule } from './people/people.module';
import { UploadsModule } from './uploads/uploads.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { HealthController } from './health/health.controller';
import { readSecret } from './common/secrets';

@Module({
  imports: [
    ThrottlerModule.forRoot([DEFAULT_LIMIT]),
    MongooseModule.forRoot(readSecret('MONGO_URI') || 'mongodb://localhost:27017/rigtracker'),
    GearModule,
    RigsModule,
    PeopleModule,
    UploadsModule,
    EventsModule,
    AuthModule,
    AuditModule,
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
