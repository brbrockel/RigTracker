import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AuditLog, AuditLogDocument } from './audit-log.schema'

export interface AuditActor {
  id: string
  email: string
  displayName: string
  roles: string[]
}

export interface LogParams {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SIGN_IN' | 'SIGN_OUT' | 'SIGN_IN_LINK'
  resource: string
  resourceId: string
  resourceName?: string
  actor?: AuditActor | null
  details?: Record<string, any>
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  async log(params: LogParams): Promise<void> {
    try {
      await this.auditModel.create({
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
        userId: params.actor?.id,
        userEmail: params.actor?.email,
        userDisplayName: params.actor?.displayName,
        details: params.details,
      })
    } catch (err) {
      // Never let audit failures break the main request
      console.error('[AuditService] Failed to write log entry:', err)
    }
  }

  async findAll(opts: {
    resource?: string
    action?: string
    skip?: number
    limit?: number
  }) {
    const filter: Record<string, any> = {}
    if (opts.resource) filter.resource = opts.resource
    if (opts.action) filter.action = opts.action

    const [total, logs] = await Promise.all([
      this.auditModel.countDocuments(filter),
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(opts.skip ?? 0)
        .limit(opts.limit ?? 50)
        .lean(),
    ])

    return { total, logs }
  }
}
