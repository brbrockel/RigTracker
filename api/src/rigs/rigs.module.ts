import { Module } from '@nestjs/common';
import { RigsService } from './rigs.service.js';
import { RigsController } from './rigs.controller.js';

@Module({
  providers: [RigsService],
  controllers: [RigsController],
})
export class RigsModule {}
