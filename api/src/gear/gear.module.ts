import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { Gear, GearSchema } from './gear.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Gear.name, schema: GearSchema }])],
  controllers: [GearController],
  providers: [GearService]
})
export class GearModule {}
