import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { Gear, GearSchema } from './gear.schema';
import { AuditModule } from '../audit/audit.module';
import { Rig, RigSchema } from '../rigs/rig.schema';
import { Person, PersonSchema } from '../people/person.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Gear.name, schema: GearSchema }]),
    MongooseModule.forFeature([{ name: Rig.name, schema: RigSchema }]),
    MongooseModule.forFeature([{ name: Person.name, schema: PersonSchema }]),
    AuditModule,
  ],
  controllers: [GearController],
  providers: [GearService]
})
export class GearModule {}
