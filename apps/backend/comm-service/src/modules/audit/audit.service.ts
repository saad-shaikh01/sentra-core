import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommAuditLog, CommAuditLogDocument, CommAuditAction } from '../../schemas/comm-audit-log.schema';
import { buildCommPaginationResponse, toMongoosePagination } from '../../common/helpers/pagination.helper';

export interface AuditLogParams {
  organizationId: string;
  actorUserId: string;
  action: CommAuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryDto {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  action?: CommAuditAction;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(CommAuditLog.name)
    private readonly auditModel: Model<CommAuditLogDocument>,
  ) {}

  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.auditModel.create(params);
    } catch (err) {
      // Audit logging should never break business operations
      this.logger.error(`Failed to write audit log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async queryLogs(organizationId: string, query: AuditQueryDto) {
    const { entityType, entityId, actorUserId, action, page = 1, limit = 20 } = query;
    const filter: Record<string, any> = { organizationId };

    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    if (actorUserId) filter.actorUserId = actorUserId;
    if (action) filter.action = action;

    const { skip } = toMongoosePagination(page, limit);
    const [data, total] = await Promise.all([
      this.auditModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.auditModel.countDocuments(filter),
    ]);

    return buildCommPaginationResponse(data, total, page, limit);
  }
}
