import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { PeopleService } from './people.service.js';
import { RequireRoles } from '../auth/roles.decorator.js';
import type { AuthedRequest } from '../auth/auth-user.js';
import { AuditService } from '../audit/audit.service.js';
import { IdPipe } from '../common/validation.js';
import { shortName } from './person-view.js';

@Controller('people')
export class PeopleController {
  constructor(
    private readonly peopleService: PeopleService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.peopleService.findAll();
  }

  @Get(':id')
  getOne(@Param('id', IdPipe) id: string) {
    return this.peopleService.findOne(id);
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body() dto: unknown, @Req() req: AuthedRequest) {
    const result = await this.peopleService.create(dto);
    await this.auditService.log({
      action: 'CREATE',
      resource: 'people',
      resourceId: result.id,
      resourceName: shortName(result),
      actor: req.authUser,
    });
    return result;
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(@Param('id', IdPipe) id: string, @Body() dto: unknown, @Req() req: AuthedRequest) {
    const { before, after } = await this.peopleService.update(id, dto);
    await this.auditService.log({
      action: 'UPDATE',
      resource: 'people',
      resourceId: id,
      resourceName: shortName(after),
      actor: req.authUser,
      before,
      after,
    });
    return after;
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id', IdPipe) id: string, @Req() req: AuthedRequest) {
    if (req.authUser?.id === id) throw new ForbiddenException("You can't delete yourself");
    const person = await this.peopleService.findOne(id);
    const result = await this.peopleService.remove(id);
    await this.auditService.log({
      action: 'DELETE',
      resource: 'people',
      resourceId: id,
      resourceName: shortName(person),
      actor: req.authUser,
    });
    return result;
  }
}
