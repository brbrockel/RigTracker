import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { RigsService } from './rigs.service.js';
import { RigsController } from './rigs.controller.js';

@Module({
  imports: [MediaModule],
  providers: [RigsService],
  controllers: [RigsController],
})
export class RigsModule {}
