/**
 * TemplatesController — PM-BE-005
 *
 * Routes:
 *   POST   /api/pm/templates              — create template
 *   GET    /api/pm/templates              — list templates (paginated)
 *   GET    /api/pm/templates/:id          — template detail (with stages/tasks)
 *   PATCH  /api/pm/templates/:id          — update template metadata
 *   POST   /api/pm/templates/:id/archive  — archive (deactivate) template
 *   POST   /api/pm/templates/:id/duplicate — deep copy template
 *   POST   /api/pm/templates/:id/stages   — create a stage under this template
 *   GET    /api/pm/templates/:id/stages   — list stages for this template
 *   PATCH  /api/pm/templates/:id/stages/reorder — reorder all stages
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { TemplatesService } from './templates.service';
import { TemplateStagesService } from './template-stages.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';
import { CreateStageDto } from './dto/create-stage.dto';
import { ReorderDto } from './dto/reorder.dto';

@UseGuards(OrgContextGuard)
@Controller('templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly stagesService: TemplateStagesService,
  ) {}

  // -------------------------------------------------------------------------
  // Template CRUD
  // -------------------------------------------------------------------------

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @GetOrgContext() ctx: OrgContext,
    @Body() dto: CreateTemplateDto,
  ) {
    const template = await this.templatesService.create(
      ctx.organizationId,
      ctx.userId,
      dto,
    );
    return wrapSingle(template);
  }

  @Get()
  async list(
    @GetOrgContext() ctx: OrgContext,
    @Query() query: QueryTemplatesDto,
  ) {
    return this.templatesService.list(ctx.organizationId, query);
  }

  @Get(':id')
  async findOne(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const template = await this.templatesService.findOne(ctx.organizationId, id);
    return wrapSingle(template);
  }

  @Patch(':id')
  async update(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    const updated = await this.templatesService.update(ctx.organizationId, id, dto);
    return wrapSingle(updated);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const archived = await this.templatesService.archive(ctx.organizationId, id);
    return wrapSingle(archived);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  async duplicate(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') id: string,
  ) {
    const copy = await this.templatesService.duplicate(
      ctx.organizationId,
      ctx.userId,
      id,
    );
    return wrapSingle(copy);
  }

  // -------------------------------------------------------------------------
  // Stage sub-routes (scoped to a template)
  // -------------------------------------------------------------------------

  /** POST /templates/:id/stages */
  @Post(':id/stages')
  @HttpCode(HttpStatus.CREATED)
  async createStage(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') templateId: string,
    @Body() dto: CreateStageDto,
  ) {
    const stage = await this.stagesService.createStage(
      ctx.organizationId,
      templateId,
      dto,
    );
    return wrapSingle(stage);
  }

  /** GET /templates/:id/stages */
  @Get(':id/stages')
  async listStages(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') templateId: string,
  ) {
    const stages = await this.stagesService.listStages(ctx.organizationId, templateId);
    return wrapSingle(stages);
  }

  /**
   * PATCH /templates/:id/stages/reorder
   * Note: declared before :id/stages/:stageId routes to avoid NestJS ambiguity.
   */
  @Patch(':id/stages/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderStages(
    @GetOrgContext() ctx: OrgContext,
    @Param('id') templateId: string,
    @Body() dto: ReorderDto,
  ) {
    await this.stagesService.reorderStages(ctx.organizationId, templateId, dto);
    return { success: true };
  }
}
