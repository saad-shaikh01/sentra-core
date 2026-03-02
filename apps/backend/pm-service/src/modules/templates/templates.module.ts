/**
 * TemplatesModule — PM-BE-004/005/006
 *
 * Encapsulates the full template engine:
 * - ServiceTemplate CRUD
 * - TemplateStage management + ordering + dependencies
 * - TemplateTask management + ordering
 * - TemplateChecklist management
 *
 * PrismaService and PmCacheService are injected via global providers
 * (PrismaClientModule and PmCacheModule are both @Global()).
 */

import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplateStagesController } from './template-stages.controller';
import { TemplateTasksController } from './template-tasks.controller';
import { TemplateChecklistsController } from './template-checklists.controller';
import { TemplatesService } from './templates.service';
import { TemplateStagesService } from './template-stages.service';
import { TemplateTasksService } from './template-tasks.service';
import { TemplateChecklistsService } from './template-checklists.service';

@Module({
  controllers: [
    TemplatesController,
    TemplateStagesController,
    TemplateTasksController,
    TemplateChecklistsController,
  ],
  providers: [
    TemplatesService,
    TemplateStagesService,
    TemplateTasksService,
    TemplateChecklistsService,
  ],
  exports: [
    TemplatesService,
    TemplateStagesService,
    TemplateTasksService,
    TemplateChecklistsService,
  ],
})
export class TemplatesModule {}
