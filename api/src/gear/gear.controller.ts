import { Controller, Get, Param, Post, Body, Put, Delete, Req, Query } from '@nestjs/common';
import { GearService } from './gear.service.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import type { AuthedRequest } from '../auth/auth-user.js';
import { AuditService } from '../audit/audit.service.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { GearBody, GearQuery } from './gear.dto.js';
import type { z } from 'zod';

@Controller('gear')
export class GearController {
  constructor(
    private readonly gearService: GearService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll(@Query(new ZodPipe(GearQuery)) filters: z.infer<typeof GearQuery>) {
    return this.gearService.findAll(filters);
  }

  @Get(':id')
  getOne(@Param('id', IdPipe) id: string) {
    return this.gearService.findOne(id);
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body(new ZodPipe(GearBody)) dto: GearBody, @Req() req: AuthedRequest) {
    const result = await this.gearService.create(dto);
    await this.auditService.log({
      action: 'CREATE',
      resource: 'gear',
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
    @Body(new ZodPipe(GearBody)) dto: GearBody,
    @Req() req: AuthedRequest,
  ) {
    const { before, after } = await this.gearService.update(id, dto);
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'gear',
      resourceId: id,
      resourceName: after.name ?? dto.name ?? undefined,
      actor: req.authUser,
      before,
      after,
    });
    return after;
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    const result = await this.gearService.remove(id);
    await this.auditService.log({
      action: 'DELETE',
      resource: 'gear',
      resourceId: id,
      actor: req.authUser,
    });
    return result;
  }
}
