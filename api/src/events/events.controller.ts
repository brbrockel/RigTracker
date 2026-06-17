import { Controller, Get, Param, Post, Body, Put, Delete, Query } from '@nestjs/common'
import { EventsService } from './events.service'
import { RequireRoles } from '../auth/roles.decorator'

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
  @RequireRoles('editor', 'admin')
  create(@Body() dto: any) {
    return this.eventsService.create(dto)
  }

  @Put(':id')
  @RequireRoles('editor', 'admin')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.eventsService.update(id, dto)
  }

  @Delete(':id')
  @RequireRoles('admin')
  remove(@Param('id') id: string, @Query('purgeMedia') purgeMedia?: string) {
    const shouldPurgeMedia = String(purgeMedia).toLowerCase() === 'true'
    return this.eventsService.remove(id, shouldPurgeMedia)
  }
}
