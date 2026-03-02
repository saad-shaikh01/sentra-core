/**
 * PM Database Module
 *
 * PM-BE-002: Postgres access strategy for pm-service
 *
 * Strategy:
 * - pm-service shares the same PostgreSQL cluster as core-service.
 * - The Prisma schema is unified (single schema.prisma) but ownership is enforced in code.
 * - PrismaService (from @sentra-core/prisma-client) is the single DB access layer.
 * - pm-service ONLY reads and writes the following model groups:
 *     PmServiceTemplate, PmTemplateStage, PmTemplateStageDependency,
 *     PmTemplateTask, PmTemplateChecklist,
 *     PmEngagement, PmProject, PmProjectStage, PmStageDependency,
 *     PmTask, PmTaskAssignment, PmTaskWorklog,
 *     PmTaskSubmission, PmSelfQcResponse, PmQcReview,
 *     PmBypassRecord, PmRevisionRequest,
 *     PmDeliverablePackage, PmDeliverableItem,
 *     PmApprovalRequest, PmApprovalSnapshot,
 *     PmProjectClosureRecord,
 *     PmConversationThread, PmMessage, PmMessageMention,
 *     PmMessageAttachment, PmThreadParticipant,
 *     PmFileAsset, PmFileVersion, PmFileLink, PmFileAccessLog,
 *     PmNotification, PmActivityLog,
 *     PmEscalationEvent, PmPerformanceEvent, PmScoreSnapshot
 *
 * - pm-service reads identifiers from core-service domain (organizationId, brandId,
 *   clientId, userId) via JWT payload or gateway-injected headers — it never writes
 *   to Organization, Brand, Client, User, or any other core-owned table.
 *
 * - All PM list queries must include organizationId in the WHERE clause.
 *   This is the tenant isolation boundary enforced at the service layer.
 *
 * Cross-service coordination:
 * - Reads on cross-domain identities happen by ID reference, not JOIN.
 * - For hydrating user/client display names, pm-service makes internal API calls
 *   to core-service (future) or receives them via event payloads.
 */

import { Module } from '@nestjs/common';
import { PrismaClientModule, PrismaService } from '@sentra-core/prisma-client';

@Module({
  imports: [PrismaClientModule],
  exports: [PrismaService],
})
export class PmDatabaseModule {}
