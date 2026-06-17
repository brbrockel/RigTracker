import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Event, EventSchema } from './event.schema'
import { EventsService } from './events.service'
import { EventsController } from './events.controller'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [MongooseModule.forFeature([{ name: Event.name, schema: EventSchema }]), AuditModule],
  providers: [EventsService],
  controllers: [EventsController]
})
export class EventsModule {}
