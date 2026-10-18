import { Module } from '@nestjs/common';
import { GearController } from './gear.controller.js';
import { GearService } from './gear.service.js';

@Module({
  controllers: [GearController],
  providers: [GearService],
})
export class GearModule {}
