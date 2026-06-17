import { Module } from '@nestjs/common';
import { GearModule } from './gear/gear.module';
import { MongooseModule } from '@nestjs/mongoose';
import { RigsModule } from './rigs/rigs.module';
import { PeopleModule } from './people/people.module';
import { UploadsModule } from './uploads/uploads.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/rigtracker'),
    GearModule,
    RigsModule,
    PeopleModule,
    UploadsModule,
    EventsModule,
    AuthModule
  ]
})
export class AppModule {}
