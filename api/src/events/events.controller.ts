import { Controller, Get, Param, Post, Body, Put, Delete, Req } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import type { AuthedRequest } from '../auth/auth-user.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { EventBody } from './event.dto.js';
import { AuditService } from '../audit/audit.service.js';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.eventsService.findAll();
  }

  @Get(':id')
  getOne(@Param('id', IdPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body(new ZodPipe(EventBody)) dto: EventBody, @Req() req: AuthedRequest) {
    const result = await this.eventsService.create(dto);
    await this.auditService.log({
      action: 'CREATE',
      resource: 'events',
      resourceId: result.id,
      resourceName: result.name,
      actor: req.authUser,
    });
    return result;
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(
    @Param('id', IdPipe) id: string,
    @Body(new ZodPipe(EventBody)) dto: EventBody,
    @Req() req: AuthedRequest,
  ) {
    const { before, after } = await this.eventsService.update(id, dto);
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'events',
      resourceId: id,
      resourceName: after.name ?? dto.name ?? undefined,
      actor: req.authUser,
      before,
      after,
    });
    return this.eventsService.withMedia(after);
  }

  /**
   * Its photos and videos are deleted with it. ?purgeMedia= (1.x: whether to delete the
   * files) is accepted and ignored.
   */
  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    const { mediaDeleted } = await this.eventsService.remove(id);
    await this.auditService.log({
      action: 'DELETE',
      resource: 'events',
      resourceId: id,
      details: { mediaDeleted },
      actor: req.authUser,
    });
    return { deleted: true };
  }
}
