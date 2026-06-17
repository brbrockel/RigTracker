import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { Gear, GearSchema } from './gear.schema';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Gear.name, schema: GearSchema }]), AuditModule],
  controllers: [GearController],
  providers: [GearService]
})
export class GearModule {}
