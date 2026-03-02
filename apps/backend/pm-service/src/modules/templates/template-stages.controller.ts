/**
 * TemplateStagesController — PM-BE-006
 *
 * Routes (all under controller prefix 'templates/stages'):
 *   PATCH  /api/pm/templates/stages/:stageId             — update stage
 *   DELETE /api/pm/templates/stages/:stageId             — delete stage
 *   GET    /api/pm/templates/stages/:stageId/tasks       — list tasks for stage
 *   POST   /api/pm/templates/stages/:stageId/tasks       — create task in stage
 *   PATCH  /api/pm/templates/stages/:stageId/tasks/reorder — reorder tasks
 *   GET    /api/pm/templates/stages/:stageId/dependencies  — list dependencies
 *   POST   /api/pm/templates/stages/:stageId/dependencies  — create dependency
 *   DELETE /api/pm/templates/stages/:stageId/dependencies/:depId — remove dependency
 */

import {
  Controller,
  Patch,
  Delete,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrgContextGuard } from '../../common/guards/org-context.guard';
import { GetOrgContext, OrgContext } from '../../common/decorators/org-context.decorator';
import { wrapSingle } from '../../common/response/pm-api-response';
import { TemplateStagesService } from './template-stages.service';
import { TemplateTasksService } from './template-tasks.service';
import { UpdateStageDto } from './dto/update-stage.dto';
import { CreateStageDependencyDto } from './dto/create-dependency.dto';
import { CreateTemplateTaskDto } from './dto/create-task.dto';
import { ReorderDto } from './dto/reorder.dto';

@UseGuards(OrgContextGuard)
@Controller('templates/stages')
export class TemplateStagesController {
  constructor(
    private readonly stagesService: TemplateStagesService,
    private readonly tasksService: TemplateTasksService,
  ) {}

  // -------------------------------------------------------------------------
  // Stage operations
  // -------------------------------------------------------------------------

  @Patch(':stageId')
  async updateStage(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    const stage = await this.stagesService.updateStage(
      ctx.organizationId,
      stageId,
      dto,
    );
    return wrapSingle(stage);
  }

  @Delete(':stageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStage(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
  ) {
    await this.stagesService.deleteStage(ctx.organizationId, stageId);
  }

  // -------------------------------------------------------------------------
  // Task sub-routes (within a stage)
  // -------------------------------------------------------------------------

  /** GET /templates/stages/:stageId/tasks */
  @Get(':stageId/tasks')
  async listTasks(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
  ) {
    const tasks = await this.tasksService.listTasks(ctx.organizationId, stageId);
    return wrapSingle(tasks);
  }

  /** POST /templates/stages/:stageId/tasks */
  @Post(':stageId/tasks')
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Body() dto: CreateTemplateTaskDto,
  ) {
    const task = await this.tasksService.createTask(ctx.organizationId, stageId, dto);
    return wrapSingle(task);
  }

  /**
   * PATCH /templates/stages/:stageId/tasks/reorder
   * Declared before :stageId/tasks/:taskId to avoid ambiguity.
   */
  @Patch(':stageId/tasks/reorder')
  @HttpCode(HttpStatus.OK)
  async reorderTasks(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Body() dto: ReorderDto,
  ) {
    await this.tasksService.reorderTasks(ctx.organizationId, stageId, dto);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Dependency sub-routes (within a stage)
  // -------------------------------------------------------------------------

  /** GET /templates/stages/:stageId/dependencies */
  @Get(':stageId/dependencies')
  async listDependencies(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
  ) {
    const deps = await this.stagesService.listDependencies(ctx.organizationId, stageId);
    return wrapSingle(deps);
  }

  /** POST /templates/stages/:stageId/dependencies */
  @Post(':stageId/dependencies')
  @HttpCode(HttpStatus.CREATED)
  async createDependency(
    @GetOrgContext() ctx: OrgContext,
    @Param('stageId') stageId: string,
    @Body() dto: CreateStageDependencyDto,
  ) {
    const dep = await this.stagesService.createDependency(
      ctx.organizationId,
      stageId,
      dto,
    );
    return wrapSingle(dep);
  }

  /** DELETE /templates/stages/:stageId/dependencies/:depId */
  @Delete(':stageId/dependencies/:depId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDependency(
    @GetOrgContext() ctx: OrgContext,
    @Param('depId') depId: string,
  ) {
    await this.stagesService.deleteDependency(ctx.organizationId, depId);
  }
}
