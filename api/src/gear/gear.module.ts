import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { GearController } from './gear.controller.js';
import { GearService } from './gear.service.js';

@Module({
  imports: [MediaModule],
  controllers: [GearController],
  providers: [GearService],
})
export class GearModule {}
