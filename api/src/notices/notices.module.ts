import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';

@Module({
  providers: [NoticesService],
  controllers: [NoticesController],
})
export class NoticesModule {}
