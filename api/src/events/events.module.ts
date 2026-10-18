import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';

@Module({
  imports: [MediaModule],
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
