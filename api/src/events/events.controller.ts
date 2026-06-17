import { Controller, Get, Param, Post, Body, Put, Delete, Query, Req } from '@nestjs/common'
import { EventsService } from './events.service'
import { RequireRoles } from '../auth/roles.decorator'
import { AuditService } from '../audit/audit.service'

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.eventsService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.eventsService.findOne(id)
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body() dto: any, @Req() req: any) {
    const result = await this.eventsService.create(dto)
    await this.auditService.log({ action: 'CREATE', resource: 'events', resourceId: String(result._id || result.id), resourceName: result.name, actor: req.authUser })
    return result
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const result = await this.eventsService.update(id, dto)
    await this.auditService.log({ action: 'UPDATE', resource: 'events', resourceId: id, resourceName: result?.name ?? dto?.name, actor: req.authUser })
    return result
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id') id: string, @Query('purgeMedia') purgeMedia?: string, @Req() req?: any) {
    const shouldPurgeMedia = String(purgeMedia).toLowerCase() === 'true'
    const result = await this.eventsService.remove(id, shouldPurgeMedia)
    await this.auditService.log({ action: 'DELETE', resource: 'events', resourceId: id, details: { purgeMedia: shouldPurgeMedia }, actor: req?.authUser })
    return result
  }
}
