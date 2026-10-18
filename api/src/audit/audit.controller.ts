import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { RequireRoles } from '../auth/roles.decorator.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireRoles('admin')
  findAll(
    @Query('resource') resource?: unknown,
    @Query('action') action?: unknown,
    @Query('page') page?: unknown,
    @Query('limit') limit?: unknown,
  ) {
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 50) : undefined);
    const pageNum = Math.max(1, parseInt(String(str(page) || '1')) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(str(limit) || '50')) || 50));
    return this.auditService.findAll({
      resource: str(resource) || undefined,
      action: str(action) || undefined,
      skip: (pageNum - 1) * limitNum,
      limit: limitNum,
    });
  }
}
