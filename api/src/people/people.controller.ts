import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common'
import { PeopleService } from './people.service'
import { RequireRoles } from '../auth/roles.decorator'
import { AuditService } from '../audit/audit.service'

@Controller('people')
export class PeopleController {
  constructor(
    private readonly peopleService: PeopleService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.peopleService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.peopleService.findOne(id)
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body() dto: any, @Req() req: any) {
    const result = await this.peopleService.create(dto)
    const name = [dto.firstName, dto.lastName].filter(Boolean).join(' ')
    await this.auditService.log({ action: 'CREATE', resource: 'people', resourceId: String(result._id || result.id), resourceName: name, actor: req.authUser })
    return result
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const result = await this.peopleService.update(id, dto)
    const name = [dto.firstName, dto.lastName].filter(Boolean).join(' ')
    await this.auditService.log({ action: 'UPDATE', resource: 'people', resourceId: id, resourceName: name, actor: req.authUser })
    return result
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id') id: string, @Req() req: any) {
    const result = await this.peopleService.remove(id)
    await this.auditService.log({ action: 'DELETE', resource: 'people', resourceId: id, actor: req.authUser })
    return result
  }
}
