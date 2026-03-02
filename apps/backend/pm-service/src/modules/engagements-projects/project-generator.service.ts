/**
 * ProjectGeneratorService — PM-BE-009
 *
 * Stamps a template's stage/task/dependency graph onto a newly created project.
 * Designed to be called inside the caller's Prisma $transaction — no separate
 * transaction is opened here. If anything fails the entire project creation
 * rolls back atomically.
 *
 * Generation rules:
 *  - PmTemplateStage  → PmProjectStage  (status=PENDING, links back via templateStageId)
 *  - PmTemplateTask   → PmTask          (status=PENDING, links back via templateTaskId)
 *  - PmTemplateStageDependency → PmStageDependency (graph remapped via stageIdMap)
 *
 * Idempotency guard:
 *  If PmProjectStage records already exist for this projectId, generation is
 *  skipped entirely. This prevents duplicate stamps on retried requests.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sentra-core/prisma-client';

// ---------------------------------------------------------------------------
// Capture the full loaded-template type from the Prisma query helper below.
// Using a standalone function avoids self-referential class method types.
// ---------------------------------------------------------------------------

function buildTemplateQuery(
  prisma: PrismaService,
  organizationId: string,
  templateId: string,
) {
  return prisma.pmServiceTemplate.findFirst({
    where: { id: templateId, organizationId, isActive: true },
    include: {
      stages: {
        orderBy: { sortOrder: 'asc' },
        include: {
          tasks: { orderBy: { sortOrder: 'asc' } },
          dependencies: true,
        },
      },
    },
  });
}

export type LoadedTemplate = NonNullable<Awaited<ReturnType<typeof buildTemplateQuery>>>;

// ---------------------------------------------------------------------------
// Minimal tx-client type — structurally compatible with both PrismaService and
// Prisma.TransactionClient so we avoid importing @prisma/client directly.
// ---------------------------------------------------------------------------

type TxClient = Pick<PrismaService, 'pmProjectStage' | 'pmTask' | 'pmStageDependency'>;

// ---------------------------------------------------------------------------

@Injectable()
export class ProjectGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads the full template tree (outside of a transaction).
   * Template data is stable enough for a consistent pre-read.
   */
  async loadTemplate(organizationId: string, templateId: string): Promise<LoadedTemplate> {
    const template = await buildTemplateQuery(this.prisma, organizationId, templateId);
    if (!template) throw new NotFoundException('Template not found or is inactive');
    return template;
  }

  /**
   * Stamps stages, tasks, and stage-dependency graph from the template onto
   * the given project. Must be called inside an active Prisma $transaction.
   */
  async generateFromTemplate(
    tx: TxClient,
    organizationId: string,
    userId: string,
    projectId: string,
    template: LoadedTemplate,
  ): Promise<void> {
    // Idempotency guard — skip if already generated
    const existingCount = await tx.pmProjectStage.count({ where: { projectId } });
    if (existingCount > 0) return;

    // Maps old templateStageId → new projectStageId for dependency reconstruction
    const stageIdMap = new Map<string, string>();

    // 1. Create project stages and their tasks
    for (const stage of template.stages) {
      const projectStage = await tx.pmProjectStage.create({
        data: {
          organizationId,
          projectId,
          templateStageId: stage.id,
          name: stage.name,
          description: stage.description ?? null,
          departmentCode: stage.departmentCode,
          sortOrder: stage.sortOrder,
          clientReviewMode: stage.clientReviewMode,
          requiresStageApproval: stage.requiresStageApproval,
          requiresQcByDefault: stage.requiresQcByDefault,
          isOptional: stage.isOptional,
        },
      });

      stageIdMap.set(stage.id, projectStage.id);

      // 2. Create tasks under this stage
      for (const task of stage.tasks) {
        await tx.pmTask.create({
          data: {
            organizationId,
            projectId,
            projectStageId: projectStage.id,
            templateTaskId: task.id,
            name: task.name,
            description: task.description ?? null,
            sortOrder: task.sortOrder,
            requiresQc: task.requiresQc,
            isRequired: task.isRequired,
            createdById: userId,
          },
        });
      }
    }

    // 3. Reconstruct stage dependency graph using mapped IDs
    for (const stage of template.stages) {
      const newStageId = stageIdMap.get(stage.id);
      if (!newStageId) continue;

      for (const dep of stage.dependencies) {
        const newDependsOnId = stageIdMap.get(dep.dependsOnTemplateStageId);
        if (!newDependsOnId) continue;

        await tx.pmStageDependency.create({
          data: {
            projectId,
            projectStageId: newStageId,
            dependsOnProjectStageId: newDependsOnId,
            dependencyType: dep.dependencyType,
          },
        });
      }
    }
  }
}
