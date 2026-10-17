import { Module } from '@nestjs/common';
import { GearModule } from './gear/gear.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RigsModule } from './rigs/rigs.module';
import { PeopleModule } from './people/people.module';
import { UploadsModule } from './uploads/uploads.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { readSecret } from './common/secrets';

@Module({
  imports: [
    MongooseModule.forRoot(readSecret('MONGO_URI') || 'mongodb://localhost:27017/rigtracker'),
    GearModule,
    RigsModule,
    PeopleModule,
    UploadsModule,
    EventsModule,
    AuthModule,
    AuditModule,
  ]
})
export class AppModule {}
