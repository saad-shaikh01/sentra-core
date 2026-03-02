/**
 * EngagementsProjectsModule — PM-BE-007 / PM-BE-008 / PM-BE-009
 *
 * Encapsulates:
 * - Engagement CRUD (PM-BE-007)
 * - Project creation and CRUD (PM-BE-008)
 * - Template-to-project stage/task/dependency generation (PM-BE-009)
 *
 * PrismaService and PmCacheService are injected via global providers
 * (PrismaClientModule and PmCacheModule are both @Global()).
 */

import { Module } from '@nestjs/common';
import { EngagementsController } from './engagements.controller';
import { ProjectsController } from './projects.controller';
import { EngagementsService } from './engagements.service';
import { ProjectsService } from './projects.service';
import { ProjectGeneratorService } from './project-generator.service';

@Module({
  controllers: [EngagementsController, ProjectsController],
  providers: [EngagementsService, ProjectsService, ProjectGeneratorService],
  exports: [EngagementsService, ProjectsService, ProjectGeneratorService],
})
export class EngagementsProjectsModule {}
