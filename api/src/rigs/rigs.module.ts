import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Rig, RigSchema } from './rig.schema';
import { RigsService } from './rigs.service';
import { RigsController } from './rigs.controller';
import { Person, PersonSchema } from '../people/person.schema';
import { Gear, GearSchema } from '../gear/gear.schema';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Rig.name, schema: RigSchema }]),
    MongooseModule.forFeature([{ name: Person.name, schema: PersonSchema }]),
    MongooseModule.forFeature([{ name: Gear.name, schema: GearSchema }]),
    AuditModule,
  ],
  providers: [RigsService],
  controllers: [RigsController],
})
export class RigsModule {}
