import { Controller, Get, Param, Post, Body, Put, Delete, Req, Query } from '@nestjs/common';
import { GearService } from './gear.service';
import { RequireRoles } from '../auth/roles.decorator';
import { AuditService } from '../audit/audit.service';
import { ZodPipe } from '../common/validation';
import { GearBody, GearQuery } from './gear.dto';

@Controller('gear')
export class GearController {
  constructor(
    private readonly gearService: GearService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll(@Query(new ZodPipe(GearQuery)) { rigId, personId, unassigned }: { rigId?: string; personId?: string; unassigned?: string }) {
    return this.gearService.findAll({ rigId, personId, unassigned });
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.gearService.findOne(id);
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body(new ZodPipe(GearBody)) dto: GearBody, @Req() req: any) {
    const result = await this.gearService.create(dto);
    await this.auditService.log({ action: 'CREATE', resource: 'gear', resourceId: String(result._id || result.id), resourceName: result.name, actor: req.authUser });
    return result;
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(@Param('id') id: string, @Body(new ZodPipe(GearBody)) dto: GearBody, @Req() req: any) {
    const result = await this.gearService.update(id, dto);
    await this.auditService.log({ action: 'UPDATE', resource: 'gear', resourceId: id, resourceName: result?.name ?? dto?.name ?? undefined, actor: req.authUser });
    return result;
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id') id: string, @Req() req: any) {
    const result = await this.gearService.remove(id);
    await this.auditService.log({ action: 'DELETE', resource: 'gear', resourceId: id, actor: req.authUser });
    return result;
  }
}
