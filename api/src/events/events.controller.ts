import { Controller, Get, Param, Post, Body, Put, Delete } from '@nestjs/common'
import { EventsService } from './events.service'

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  getAll() {
    return this.eventsService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.eventsService.findOne(id)
  }

  @Post()
  create(@Body() dto: any) {
    return this.eventsService.create(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.eventsService.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.eventsService.remove(id)
  }
}
