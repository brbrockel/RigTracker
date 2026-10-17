import { Controller, Get, Query } from '@nestjs/common'
import { AuditService } from './audit.service'
import { RequireRoles } from '../auth/roles.decorator'

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireRoles('admin')
  findAll(
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 50) : undefined)
    resource = str(resource)
    action = str(action)
    const pageNum = Math.max(1, parseInt(String(page || '1')) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit || '50')) || 50))
    return this.auditService.findAll({
      resource: resource || undefined,
      action: action || undefined,
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
    })
  }
}
