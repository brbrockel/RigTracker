import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common';
import { RigsService } from './rigs.service.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import { isGuest, type AuthedRequest } from '../auth/auth-user.js';
import { GuestOk } from '../auth/public.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import { IdPipe, ZodPipe } from '../common/validation.js';
import { RigBody } from './rig.dto.js';

@Controller('rigs')
export class RigsController {
  constructor(
    private readonly rigsService: RigsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @GuestOk()
  getAll(@Req() req: AuthedRequest) {
    return this.rigsService.findAll(isGuest(req));
  }

  @Get(':id')
  @GuestOk()
  getOne(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    return this.rigsService.findOne(id, isGuest(req));
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body(new ZodPipe(RigBody)) dto: RigBody, @Req() req: AuthedRequest) {
    const result = await this.rigsService.create(dto);
    await this.auditService.log({
      action: 'CREATE',
      resource: 'rigs',
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
    @Body(new ZodPipe(RigBody)) dto: RigBody,
    @Req() req: AuthedRequest,
  ) {
    const { before, after } = await this.rigsService.update(id, dto);
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'rigs',
      resourceId: id,
      resourceName: after.name ?? dto.name ?? undefined,
      actor: req.authUser,
      before,
      after,
    });
    return this.rigsService.withExtras(after);
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    const result = await this.rigsService.remove(id);
    await this.auditService.log({
      action: 'DELETE',
      resource: 'rigs',
      resourceId: id,
      actor: req.authUser,
    });
    return result;
  }
}
