import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common'
import { RigsService } from './rigs.service'
import { RequireRoles } from '../auth/roles.decorator'
import { AuditService } from '../audit/audit.service'

@Controller('rigs')
export class RigsController {
  constructor(
    private readonly rigsService: RigsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  getAll() {
    return this.rigsService.findAll()
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.rigsService.findOne(id)
  }

  @Post()
  @RequireRoles('user', 'admin')
  async create(@Body() dto: any, @Req() req: any) {
    const result = await this.rigsService.create(dto)
    await this.auditService.log({ action: 'CREATE', resource: 'rigs', resourceId: String(result._id || result.id), resourceName: result.name, actor: req.authUser })
    return result
  }

  @Put(':id')
  @RequireRoles('user', 'admin')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const result = await this.rigsService.update(id, dto)
    await this.auditService.log({ action: 'UPDATE', resource: 'rigs', resourceId: id, resourceName: result?.name ?? dto?.name, actor: req.authUser })
    return result
  }

  @Delete(':id')
  @RequireRoles('admin')
  async remove(@Param('id') id: string, @Req() req: any) {
    const result = await this.rigsService.remove(id)
    await this.auditService.log({ action: 'DELETE', resource: 'rigs', resourceId: id, actor: req.authUser })
    return result
  }
}
